-- 0049 — Alteração de pedido: propor, retirar e a decisão do cliente
-- 04-REGRAS-NEGOCIO.md RN-ALT-001..007 · CLAUDE.md §16, §22, §34
--
-- O PRINCÍPIO: o pedido enviado não é objeto livremente editável. A Shalon
-- PROPÕE; quando itens ou total mudam, quem decide é o cliente; e a
-- aprovação cria revisão em vez de sobrescrever o que existia.

-- A proposta precisa lembrar de onde o pedido veio, para poder voltar
-- exatamente para lá se for retirada ou recusada.
alter table public.order_revisions add column status_before text;

insert into public.order_status_transitions (from_status, to_status) values
  ('change_requested_waiting_customer', 'confirmed');

-- ----------------------------------------------------------- propor
create or replace function public.propor_alteracao(p_order_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_pedido record;
  v_motivo text;
  v_item jsonb;
  v_res jsonb;
  v_depois jsonb := '[]'::jsonb;
  v_antes jsonb;
  v_subtotal numeric := 0;
  v_total numeric;
  v_exige boolean;
  v_numero integer;
  v_revisao uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('orders.request_change') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para alterar pedidos.');
  end if;

  v_motivo := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da alteração.');
  end if;

  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  -- Alterar pedido já pronto, despachado, concluído, rejeitado ou cancelado
  -- não é alteração: é outra coisa, e a V1 não a tem.
  if v_pedido.status not in ('waiting_store_confirmation', 'confirmed') then
    return jsonb_build_object('ok', false, 'erro',
      'Este pedido não está em um momento em que possa ser alterado.');
  end if;

  if exists (select 1 from public.order_revisions r
              where r.order_id = p_order_id and r.status = 'pending_customer') then
    return jsonb_build_object('ok', false, 'erro',
      'Já existe uma alteração aguardando resposta do cliente.');
  end if;

  if jsonb_typeof(p_dados -> 'itens') <> 'array'
     or jsonb_array_length(p_dados -> 'itens') = 0 then
    return jsonb_build_object('ok', false, 'erro', 'A alteração precisa ter pelo menos um item.');
  end if;

  -- CLAUDE.md §16: os itens propostos são REPRECIFICADOS pelo servidor, com
  -- a mesma `montar_item` do cardápio e do carrinho. Não existe preço de
  -- alteração digitado à mão.
  for v_item in select * from jsonb_array_elements(p_dados -> 'itens') loop
    v_res := public.montar_item(v_item);
    if not (v_res ->> 'ok')::boolean then
      return jsonb_build_object('ok', false,
        'erro', format('%s: %s', coalesce(v_res ->> 'nome', 'Item'), v_res ->> 'erro'));
    end if;
    v_depois := v_depois || jsonb_build_array(
      v_res || jsonb_build_object('observacao', v_item ->> 'observacao'));
    v_subtotal := v_subtotal + (v_res ->> 'total')::numeric;
  end loop;

  -- A taxa de entrega NÃO muda aqui: mexer nela é `orders.override_delivery_fee`,
  -- outra permissão e outra conversa.
  v_total := v_subtotal + v_pedido.delivery_fee;

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

  -- RN-ALT-004: aprovação do cliente só é exigida quando itens ou total
  -- mudam. Trocar apenas uma observação não obriga ninguém a responder.
  v_exige := v_total <> v_pedido.total
             or v_subtotal <> v_pedido.subtotal
             or jsonb_array_length(v_depois) <> jsonb_array_length(v_antes);

  select coalesce(max(r.revision_number), 0) + 1 into v_numero
    from public.order_revisions r where r.order_id = p_order_id;

  insert into public.order_revisions (
    order_id, revision_number, reason, proposed_by, requires_customer_approval,
    status, status_before, items_before, items_after,
    subtotal_before, total_before, subtotal_after, total_after)
  values (
    p_order_id, v_numero, v_motivo, v_ator, v_exige,
    case when v_exige then 'pending_customer' else 'approved' end,
    v_pedido.status, v_antes, v_depois,
    v_pedido.subtotal, v_pedido.total, v_subtotal, v_total)
  returning id into v_revisao;

  if v_exige then
    update public.orders set status = 'change_requested_waiting_customer' where id = p_order_id;
    insert into public.order_status_history
      (order_id, from_status, to_status, actor_type, actor_user_id, reason)
    values (p_order_id, v_pedido.status, 'change_requested_waiting_customer',
            'user', v_ator, v_motivo);
  else
    perform public.aplicar_revisao(v_revisao);
  end if;

  perform public.log_audit('pedido_propor_alteracao', 'orders', p_order_id,
    jsonb_build_object('subtotal', v_pedido.subtotal, 'total', v_pedido.total, 'itens', v_antes),
    jsonb_build_object('subtotal', v_subtotal, 'total', v_total, 'itens', v_depois),
    v_motivo);

  return jsonb_build_object('ok', true, 'revisao_id', v_revisao,
    'aguarda_cliente', v_exige, 'subtotal', v_subtotal, 'total', v_total);
end;
$$;

revoke all on function public.propor_alteracao(uuid, jsonb) from public, anon;
grant execute on function public.propor_alteracao(uuid, jsonb) to authenticated;

comment on function public.propor_alteracao is 'RN-ALT: propõe alteração reprecificada pelo servidor. Itens ou total diferentes exigem o cliente.';

-- ----------------------------------------------------------- retirar
create or replace function public.retirar_alteracao(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_rev record;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('orders.request_change') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para alterar pedidos.');
  end if;

  select * into v_rev from public.order_revisions r
   where r.order_id = p_order_id and r.status = 'pending_customer' for update;
  if v_rev.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Não há alteração aguardando o cliente.');
  end if;

  update public.order_revisions
     set status = 'withdrawn', decided_at = now(), decided_by_customer = false
   where id = v_rev.id;

  -- Volta exatamente para o estado de onde saiu.
  update public.orders set status = v_rev.status_before where id = p_order_id;
  insert into public.order_status_history
    (order_id, from_status, to_status, actor_type, actor_user_id, reason)
  values (p_order_id, 'change_requested_waiting_customer', v_rev.status_before,
          'user', v_ator, 'Alteração retirada pela pizzaria');

  perform public.log_audit('pedido_retirar_alteracao', 'orders', p_order_id,
    jsonb_build_object('revisao', v_rev.revision_number), null, null);

  return jsonb_build_object('ok', true, 'status', v_rev.status_before);
end;
$$;

revoke all on function public.retirar_alteracao(uuid) from public, anon;
grant execute on function public.retirar_alteracao(uuid) to authenticated;

-- ----------------------------------------------------------- aplicar
-- Substitui os itens pelo conteúdo JÁ PRECIFICADO da revisão. Não
-- reprecifica: o cliente aprovou aquele total, e reprecificar na aprovação
-- poderia entregar um número diferente do que ele aceitou.
--
-- Os itens anteriores não se perdem: `items_before` da revisão os guarda, e
-- o histórico de status registra o caminho (RN-ALT-007).
create or replace function public.aplicar_revisao(p_revisao_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_rev record;
  v_res jsonb;
  v_detalhe jsonb;
  v_linha integer := 0;
  v_item_id uuid;
  v_sabor jsonb;
  v_adicional jsonb;
  v_componente jsonb;
begin
  select * into v_rev from public.order_revisions r where r.id = p_revisao_id;
  if v_rev.id is null or v_rev.applied_at is not null then
    return;
  end if;

  delete from public.order_items where order_id = v_rev.order_id;

  for v_res in select * from jsonb_array_elements(v_rev.items_after) loop
    v_detalhe := v_res -> 'detalhe';
    v_linha := v_linha + 1;

    insert into public.order_items (
      order_id, line_number, item_type, product_id, product_name_snapshot,
      category_name_snapshot, quantity, unit_price, line_total,
      size_id, size_name_snapshot, crust_id, crust_name_snapshot, crust_price_snapshot,
      observation, promotion_id, promotion_name_snapshot, regular_unit_price_snapshot
    ) values (
      v_rev.order_id, v_linha, v_detalhe ->> 'item_type',
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

  update public.orders
     set subtotal = v_rev.subtotal_after, total = v_rev.total_after
   where id = v_rev.order_id;

  -- O valor esperado do pagamento acompanha o novo total; o troco esperado
  -- é recalculado a partir do mesmo valor que o cliente já havia informado.
  update public.order_payment_intents
     set amount_expected = v_rev.total_after,
         expected_change_amount = case when needs_change
           then change_for_amount - v_rev.total_after else expected_change_amount end
   where order_id = v_rev.order_id;

  update public.order_revisions
     set status = 'applied', applied_at = now()
   where id = p_revisao_id;
end;
$$;

revoke all on function public.aplicar_revisao(uuid) from public, anon, authenticated;

comment on function public.aplicar_revisao is 'RN-ALT-007: aplica a revisão JÁ precificada. Não reprecifica na aprovação.';

-- ------------------------------------------------- decisão do cliente
-- RN-ALT-004: quem decide é o cliente, pelo acompanhamento. O token é a
-- credencial — o mesmo que já dá acesso ao pedido, e a nada além dele.
create or replace function public.decidir_alteracao(p_token text, p_aceita boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_pedido record;
  v_rev record;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('ok', false, 'erro', 'Link inválido.');
  end if;

  select * into v_pedido from public.orders o
   where o.tracking_token_hash = public.hash_token(p_token) for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Não encontramos esse pedido.');
  end if;

  select * into v_rev from public.order_revisions r
   where r.order_id = v_pedido.id and r.status = 'pending_customer' for update;
  if v_rev.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Não há nada aguardando sua resposta.');
  end if;

  update public.order_revisions
     set status = case when p_aceita then 'approved' else 'rejected' end,
         decided_at = now(), decided_by_customer = true
   where id = v_rev.id;

  if p_aceita then
    perform public.aplicar_revisao(v_rev.id);
  end if;

  -- Aceite ou recusa devolvem o pedido ao estado anterior à proposta. A
  -- recusa NÃO cancela nada (RN-ALT-006): a pizzaria decide o que fazer.
  update public.orders set status = v_rev.status_before where id = v_pedido.id;

  insert into public.order_status_history
    (order_id, from_status, to_status, actor_type, reason)
  values (v_pedido.id, 'change_requested_waiting_customer', v_rev.status_before, 'customer',
          case when p_aceita then 'Cliente aprovou a alteração'
               else 'Cliente recusou a alteração' end);

  return jsonb_build_object('ok', true, 'aceita', p_aceita);
end;
$$;

revoke all on function public.decidir_alteracao(text, boolean) from public;
grant execute on function public.decidir_alteracao(text, boolean) to anon, authenticated;

comment on function public.decidir_alteracao is 'RN-ALT-004: a decisão é do cliente, pelo token do próprio pedido.';
