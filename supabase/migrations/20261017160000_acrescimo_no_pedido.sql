-- 0168 — Acrescentar itens a pedido já aceito, a pedido do cliente
-- D-2026-10-17-154 · CLAUDE.md §16, §22, §33, §34 · RN-ALT (exceção controlada), RN-PGTO-013
--
-- O cliente pede mais alguma coisa depois do aceite (por WhatsApp, telefone
-- ou no balcão). Antes: só dava para lançar outro pedido e receber de novo.
--
-- Decisão da dona: "Acrescentar itens" no mesmo pedido.
--   · só ACRÉSCIMO (tirar/trocar continua na alteração com aceite do
--     cliente pelo acompanhamento — RN-ALT-004);
--   · o canal por onde o cliente pediu é obrigatório e registrado: é o
--     aceite dele, então não há aprovação pelo link;
--   · os itens são precificados pelo servidor (`montar_item`); os itens que
--     já estavam no pedido NÃO são reprecificados;
--   · fica uma revisão `addition` aplicada, com o antes, quem, quando e por
--     onde — o histórico não é sobrescrito (RN-ALT-007);
--   · pedido já pago: a diferença fica "a receber" no mesmo pedido. Por isso
--     `registrar_pagamento` passa a aceitar um COMPLEMENTO: quando já há
--     pagamento e o total subiu, recebe-se exatamente o que falta
--     (amplia RN-PGTO-013: um ato por pedido, mais um por acréscimo).

-- 1. Revisão do tipo acréscimo ------------------------------------------------
alter table public.order_revisions
  add column kind text not null default 'change',
  add column added_from_line integer,
  add column customer_channel text;

alter table public.order_revisions
  add constraint order_revisions_tipo check (kind in ('change', 'addition')),
  add constraint order_revisions_acrescimo check (
    kind = 'change'
    or (added_from_line is not null and customer_channel in ('whatsapp', 'phone', 'counter'))
  );

-- 2. Acrescentar ------------------------------------------------------------------
create or replace function public.acrescentar_itens(p_order_id uuid, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ator uuid := public.current_app_user_id();
  v_pedido record;
  v_canal text := nullif(p_dados ->> 'canal', '');
  v_rotulo_canal text;
  v_versao timestamptz;
  v_item jsonb;
  v_res jsonb;
  v_novos jsonb := '[]'::jsonb;
  v_soma numeric := 0;
  v_antes jsonb;
  v_linha integer;
  v_primeira integer;
  v_detalhe jsonb;
  v_item_id uuid;
  v_sabor jsonb;
  v_adicional jsonb;
  v_componente jsonb;
  v_numero integer;
  v_revisao uuid;
  v_novo_total numeric;
  v_ja_pago numeric;
  v_motivo text;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('orders.request_change') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para alterar pedidos.');
  end if;

  v_rotulo_canal := case v_canal
    when 'whatsapp' then 'WhatsApp' when 'phone' then 'telefone' when 'counter' then 'no balcão' end;
  if v_rotulo_canal is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe por onde o cliente pediu o acréscimo.');
  end if;

  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  begin
    v_versao := nullif(p_dados ->> 'versao', '')::timestamptz;
  exception when others then
    v_versao := null;
  end;
  if v_versao is not null and v_versao <> v_pedido.updated_at then
    return jsonb_build_object('ok', false, 'versao_obsoleta', true,
      'erro', 'Este pedido mudou enquanto você editava. Recarregue e tente de novo.');
  end if;

  if v_pedido.status not in ('waiting_store_confirmation', 'confirmed', 'in_production',
                             'ready_for_pickup', 'ready_for_delivery') then
    return jsonb_build_object('ok', false, 'erro',
      'Só dá para acrescentar itens antes de o pedido sair para entrega ou ser concluído.');
  end if;

  if exists (select 1 from public.order_revisions r
              where r.order_id = p_order_id and r.status = 'pending_customer') then
    return jsonb_build_object('ok', false, 'erro',
      'Há uma alteração aguardando resposta do cliente. Resolva-a antes de acrescentar.');
  end if;

  if jsonb_typeof(p_dados -> 'itens') <> 'array'
     or jsonb_array_length(p_dados -> 'itens') = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Escolha ao menos um item para acrescentar.');
  end if;
  if jsonb_array_length(p_dados -> 'itens') > 30 then
    return jsonb_build_object('ok', false, 'erro', 'Itens demais de uma vez.');
  end if;

  -- §16: o servidor precifica os itens novos com a mesma `montar_item`.
  for v_item in select * from jsonb_array_elements(p_dados -> 'itens') loop
    v_res := public.montar_item(v_item);
    if not (v_res ->> 'ok')::boolean then
      return jsonb_build_object('ok', false,
        'erro', format('%s: %s', coalesce(v_res ->> 'nome', 'Item'), v_res ->> 'erro'));
    end if;
    v_novos := v_novos || jsonb_build_array(v_res || jsonb_build_object('observacao', v_item ->> 'observacao'));
    v_soma := v_soma + (v_res ->> 'total')::numeric;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'linha', i.line_number, 'nome', i.product_name_snapshot,
           'tamanho', i.size_name_snapshot, 'borda', i.crust_name_snapshot,
           'quantidade', i.quantity, 'preco_unitario', i.unit_price,
           'total', i.line_total, 'observacao', i.observation,
           'sabores', (select jsonb_agg(f.flavor_name_snapshot order by f.sort_order)
                         from public.order_item_flavors f where f.order_item_id = i.id),
           'adicionais', (select jsonb_agg(a.addon_name_snapshot order by a.addon_name_snapshot)
                            from public.order_item_addons a where a.order_item_id = i.id)
         ) order by i.line_number), '[]'::jsonb)
    into v_antes
    from public.order_items i where i.order_id = p_order_id;

  select coalesce(max(i.line_number), 0) + 1 into v_primeira
    from public.order_items i where i.order_id = p_order_id;
  v_linha := v_primeira - 1;

  -- Os itens novos entram DEPOIS dos que já existiam; nada é apagado.
  for v_res in select * from jsonb_array_elements(v_novos) loop
    v_detalhe := v_res -> 'detalhe';
    v_linha := v_linha + 1;

    insert into public.order_items (
      order_id, line_number, item_type, product_id, product_name_snapshot,
      category_name_snapshot, quantity, unit_price, line_total,
      size_id, size_name_snapshot, crust_id, crust_name_snapshot, crust_price_snapshot,
      observation, promotion_id, promotion_name_snapshot, regular_unit_price_snapshot
    ) values (
      p_order_id, v_linha, v_detalhe ->> 'item_type',
      (v_detalhe ->> 'produto_id')::uuid, v_detalhe ->> 'produto_nome',
      v_detalhe ->> 'categoria_nome',
      (v_res ->> 'quantidade')::integer,
      (v_res ->> 'preco_unitario')::numeric,
      (v_res ->> 'total')::numeric,
      nullif(v_detalhe ->> 'tamanho_id', '')::uuid, v_detalhe ->> 'tamanho_nome',
      nullif(v_detalhe ->> 'borda_id', '')::uuid, v_detalhe ->> 'borda_nome',
      coalesce((v_detalhe ->> 'borda_preco')::numeric, 0),
      nullif(btrim(coalesce(v_res ->> 'observacao', '')), ''),
      nullif(v_detalhe ->> 'promocao_id', '')::uuid, v_detalhe ->> 'promocao_nome',
      nullif(v_detalhe ->> 'preco_regular', '')::numeric
    ) returning id into v_item_id;

    for v_sabor in select * from jsonb_array_elements(coalesce(v_detalhe -> 'sabores', '[]'::jsonb)) loop
      insert into public.order_item_flavors (
        order_item_id, flavor_product_id, flavor_name_snapshot, variant_id,
        effective_price_snapshot, portion, sort_order)
      values (v_item_id, (v_sabor ->> 'produto_id')::uuid, v_sabor ->> 'nome',
        (v_sabor ->> 'variacao_id')::uuid, (v_sabor ->> 'preco_efetivo')::numeric,
        (v_sabor ->> 'porcao')::numeric, coalesce((v_sabor ->> 'ordem')::integer, 0));
    end loop;

    for v_adicional in select * from jsonb_array_elements(coalesce(v_detalhe -> 'adicionais', '[]'::jsonb)) loop
      insert into public.order_item_addons (order_item_id, addon_id, addon_name_snapshot, price_snapshot)
      values (v_item_id, (v_adicional ->> 'id')::uuid, v_adicional ->> 'nome',
        (v_adicional ->> 'preco')::numeric);
    end loop;

    for v_componente in select * from jsonb_array_elements(coalesce(v_detalhe -> 'combo', '[]'::jsonb)) loop
      insert into public.order_combo_components (
        order_item_id, component_product_id, component_variant_id,
        product_name_snapshot, size_name_snapshot, quantity, sort_order)
      values (v_item_id, (v_componente ->> 'produto_id')::uuid,
        nullif(v_componente ->> 'variacao_id', '')::uuid,
        v_componente ->> 'nome', v_componente ->> 'tamanho_nome',
        (v_componente ->> 'quantidade')::integer,
        coalesce((v_componente ->> 'ordem')::integer, 0));
    end loop;
  end loop;

  v_novo_total := v_pedido.total + v_soma;

  -- Pago antes? A diferença volta a ser "a receber" no mesmo pedido.
  update public.orders
     set subtotal = subtotal + v_soma,
         total = total + v_soma,
         requires_production = public.pedido_exige_producao(p_order_id),
         payment_status = case when payment_status = 'confirmed' and v_soma > 0
                               then 'pending' else payment_status end
   where id = p_order_id;

  -- Valor esperado acompanha o novo total. Troco que não cobre mais o total
  -- deixa de ser troco: some, e o balcão pergunta de novo.
  update public.order_payment_intents
     set amount_expected = v_novo_total,
         expected_change_amount = case
           when needs_change and change_for_amount >= v_novo_total then change_for_amount - v_novo_total
           when needs_change then null
           else expected_change_amount end
   where order_id = p_order_id;

  select coalesce(sum(p.amount), 0) into v_ja_pago
    from public.payments p where p.order_id = p_order_id and p.status = 'confirmed';

  v_motivo := 'Acréscimo pedido pelo cliente (' || v_rotulo_canal || ')';

  select coalesce(max(r.revision_number), 0) + 1 into v_numero
    from public.order_revisions r where r.order_id = p_order_id;

  insert into public.order_revisions (
    order_id, revision_number, reason, proposed_by, requires_customer_approval,
    status, status_before, items_before, items_after,
    subtotal_before, total_before, subtotal_after, total_after,
    kind, added_from_line, customer_channel, applied_at)
  values (
    p_order_id, v_numero, v_motivo, v_ator, false,
    'applied', v_pedido.status, v_antes, v_novos,
    v_pedido.subtotal, v_pedido.total, v_pedido.subtotal + v_soma, v_novo_total,
    'addition', v_primeira, v_canal, now())
  returning id into v_revisao;

  perform public.log_audit('pedido_acrescimo', 'orders', p_order_id,
    jsonb_build_object('subtotal', v_pedido.subtotal, 'total', v_pedido.total,
                       'payment_status', v_pedido.payment_status),
    jsonb_build_object('acrescimo', v_soma, 'total', v_novo_total, 'canal', v_canal,
                       'itens', v_novos, 'ja_pago', v_ja_pago),
    v_motivo);

  return jsonb_build_object('ok', true, 'revisao_id', v_revisao,
    'acrescimo', v_soma::numeric(12,2), 'total', v_novo_total::numeric(12,2),
    'a_receber', greatest(v_novo_total - v_ja_pago, 0)::numeric(12,2));
end;
$function$;

revoke all on function public.acrescentar_itens(uuid, jsonb) from public, anon;
grant execute on function public.acrescentar_itens(uuid, jsonb) to authenticated;

-- 3. Patches ------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_novo text;
begin
  -- 3.1 registrar_pagamento: complemento quando o total subiu depois de pago.
  v_def := pg_get_functiondef('public.registrar_pagamento(uuid,jsonb)'::regprocedure);
  if v_def not like '%v_a_receber%' then
    v_novo := replace(v_def,
      E'  v_qtd integer;\nbegin',
      E'  v_qtd integer;\n  -- Complemento depois de acréscimo (0168).\n  v_ja_pago numeric;\n  v_a_receber numeric;\nbegin');
    v_novo := replace(v_novo,
      E'  select count(*) into v_qtd from public.payments p\n    where p.order_id = p_order_id and p.status = ''confirmed'';\n  if v_qtd > 0 then',
      E'  -- Já pago por inteiro: recusa. Pago em parte (o total subiu num\n'
      || E'  -- acréscimo, 0168): recebe-se exatamente o que falta.\n'
      || E'  select coalesce(sum(p.amount), 0) into v_ja_pago from public.payments p\n'
      || E'    where p.order_id = p_order_id and p.status = ''confirmed'';\n'
      || E'  v_a_receber := v_pedido.total - v_ja_pago;\n'
      || E'  if v_ja_pago > 0 and v_a_receber <= 0 then');
    v_novo := replace(v_novo,
      E'  if v_soma <> v_pedido.total then\n    return jsonb_build_object(''ok'', false, ''soma_divergente'', true,\n      ''erro'', ''A soma das formas não fecha com o total do pedido.'',\n      ''somado'', v_soma::numeric(12,2), ''total'', v_pedido.total);',
      E'  if v_soma <> v_a_receber then\n    return jsonb_build_object(''ok'', false, ''soma_divergente'', true,\n      ''erro'', case when v_ja_pago > 0\n                  then ''A soma das formas não fecha com o que falta receber.''\n                  else ''A soma das formas não fecha com o total do pedido.'' end,\n      ''somado'', v_soma::numeric(12,2), ''total'', v_a_receber::numeric(12,2));');
    if v_novo not like '%v_ja_pago > 0 and v_a_receber <= 0%'
       or v_novo not like '%if v_soma <> v_a_receber then%'
       or v_novo not like '%v_a_receber numeric;%' then
      raise exception 'registrar_pagamento mudou: patch do complemento';
    end if;
    execute v_novo;
  end if;

  -- 3.2 pedido administrativo: tipo da revisão e onde começam os itens novos.
  v_def := pg_get_functiondef('public.pedido_administrativo(uuid)'::regprocedure);
  if v_def not like '%added_from_line%' then
    v_novo := replace(v_def,
      E'''itens_antes'', r.items_before)',
      E'''itens_antes'', r.items_before, ''tipo'', r.kind,\n        ''a_partir_da_linha'', r.added_from_line, ''canal'', r.customer_channel)');
    if v_novo = v_def then raise exception 'pedido_administrativo mudou: patch do acréscimo'; end if;
    execute v_novo;
  end if;
end;
$$;
