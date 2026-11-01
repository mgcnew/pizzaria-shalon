-- 0182 — Editar pedido com justificativa obrigatória
-- D-2026-11-01-182 · CLAUDE.md §16, §22, §24, §28, §33, §34 · RN-ALT-009, RN-CAIXA-020
--
-- Até aqui: "Propor alteração" (só até o aceite, valia depois do link) e
-- "Acrescentar itens" (só somar). Decisão do Marcelo: um "Editar pedido" só,
-- que vale na hora, com o motivo obrigatório como controle.
--   · tira, soma e acrescenta itens; o que fica mantém o preço original e só o
--     item novo paga o preço atual;
--   · troca retirada ↔ entrega, endereço e taxa, com a mesma medição do balcão;
--   · dados do cliente, observação e forma de pagamento ESPERADA;
--   · total abaixo do já pago exige registrar a devolução no mesmo ato.
-- O realizado (`payments`) nunca é reescrito: a devolução estorna a linha e
-- registra o que ficou, como a troca de forma (0174).

-- 1. Revisão do tipo edição -----------------------------------------------------
alter table public.order_revisions
  add column reason_kind text,
  add column changes jsonb;

alter table public.order_revisions
  drop constraint order_revisions_tipo,
  drop constraint order_revisions_acrescimo;

alter table public.order_revisions
  add constraint order_revisions_tipo check (kind in ('change', 'addition', 'edit')),
  add constraint order_revisions_acrescimo check (
    kind in ('change', 'edit')
    or (added_from_line is not null and customer_channel in ('whatsapp', 'phone', 'counter'))
  ),
  add constraint order_revisions_edicao check (
    kind <> 'edit'
    or (reason_kind = 'mistake' and customer_channel is null)
    or (reason_kind = 'customer' and customer_channel in ('whatsapp', 'phone', 'counter'))
  );

-- 2. Rótulo legível de uma linha ---------------------------------------------------
create or replace function public.rotulo_do_item_do_pedido(p_item_id uuid)
returns text
language sql
stable
set search_path to ''
as $function$
  select coalesce(
           (select string_agg(f.flavor_name_snapshot, ' / ' order by f.sort_order)
              from public.order_item_flavors f where f.order_item_id = i.id),
           i.product_name_snapshot)
         || coalesce(' (' || i.size_name_snapshot || ')', '')
    from public.order_items i where i.id = p_item_id;
$function$;

-- 3. Devolução de parte do que foi recebido ----------------------------------------
-- Interna: só `editar_pedido` chama. Valida TUDO antes de gravar, para quem chama
-- poder devolver `ok: false` sem nada escrito.
--
-- A linha é estornada e o que sobra vira uma linha nova, na mesma sessão e com a
-- data original: a receita continua no dia em que entrou (como na 0174).
-- Caixa já fechado fica de fora: mexer nele pede correção do fechamento. O caminho
-- nesse caso é o estorno completo, que já existe.
create or replace function public.devolver_parte_do_pagamento(
  p_order_id uuid,
  p_valor numeric,
  p_primeiro uuid,
  p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ator uuid := public.current_app_user_id();
  v_pag record;
  v_mov record;
  v_resta numeric := p_valor;
  v_parte numeric;
  v_ficou numeric;
  v_novo uuid;
  v_linhas jsonb := '[]'::jsonb;
begin
  if not public.has_permission('finance.reverse') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para devolver dinheiro ao cliente.');
  end if;

  -- 1ª passada: só confere.
  for v_pag in
    select p.*, s.status as sessao_status
      from public.payments p
      left join public.cash_sessions s on s.id = p.cash_session_id
     where p.order_id = p_order_id and p.status = 'confirmed'
     order by (p.id = p_primeiro) desc, p.received_at desc, p.created_at desc
     for update of p
  loop
    exit when v_resta <= 0;
    if v_pag.sessao_status is distinct from 'open' then
      return jsonb_build_object('ok', false, 'erro',
        format('O recebimento em %s não está num caixa aberto. Estorne o pagamento e receba de novo.',
               v_pag.payment_method_name_snapshot));
    end if;
    v_resta := v_resta - least(v_resta, v_pag.amount);
  end loop;

  if v_resta > 0 then
    return jsonb_build_object('ok', false, 'erro', 'O valor a devolver é maior que o recebido.');
  end if;

  -- 2ª passada: grava.
  v_resta := p_valor;
  for v_pag in
    select p.* from public.payments p
     where p.order_id = p_order_id and p.status = 'confirmed'
     order by (p.id = p_primeiro) desc, p.received_at desc, p.created_at desc
  loop
    exit when v_resta <= 0;
    v_parte := least(v_resta, v_pag.amount);
    v_ficou := v_pag.amount - v_parte;
    v_resta := v_resta - v_parte;

    select * into v_mov from public.cash_movements m
     where m.payment_id = v_pag.id and m.movement_type = 'sale_receipt' and m.reversed_at is null;

    if v_mov.id is not null then
      insert into public.cash_movements (
        cash_session_id, movement_type, direction, amount,
        order_id, payment_id, reason, created_by, reverses_movement_id)
      values (v_mov.cash_session_id, 'refund', 'out', v_mov.amount,
        p_order_id, v_pag.id, p_motivo, v_ator, v_mov.id);

      update public.cash_movements
         set reversed_at = now(), reversed_by = v_ator, reversal_reason = p_motivo
       where id = v_mov.id;
    end if;

    update public.payments
       set status = 'reversed', reversed_at = now(), reversed_by = v_ator, reversal_reason = p_motivo
     where id = v_pag.id;

    if v_ficou > 0 then
      insert into public.payments (
        order_id, payment_method_id, payment_brand_id,
        payment_method_name_snapshot, payment_method_family_snapshot, payment_brand_name_snapshot,
        amount, status, received_at, confirmed_by, cash_session_id, notes)
      values (
        p_order_id, v_pag.payment_method_id, v_pag.payment_brand_id,
        v_pag.payment_method_name_snapshot, v_pag.payment_method_family_snapshot,
        v_pag.payment_brand_name_snapshot,
        v_ficou, 'confirmed', v_pag.received_at, v_ator, v_pag.cash_session_id, p_motivo)
      returning id into v_novo;

      if v_mov.id is not null then
        insert into public.cash_movements (
          cash_session_id, movement_type, direction, amount, order_id, payment_id, created_by)
        values (v_mov.cash_session_id, 'sale_receipt', 'in', v_ficou, p_order_id, v_novo, v_ator);
      end if;
    end if;

    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object(
      'forma', v_pag.payment_method_name_snapshot, 'era', v_pag.amount,
      'devolvido', v_parte::numeric(12,2), 'ficou', v_ficou::numeric(12,2)));
  end loop;

  perform public.log_audit('pagamento_devolver_parte', 'orders', p_order_id,
    null, jsonb_build_object('valor', p_valor, 'linhas', v_linhas), p_motivo);

  return jsonb_build_object('ok', true, 'linhas', v_linhas);
end;
$function$;

revoke all on function public.devolver_parte_do_pagamento(uuid, numeric, uuid, text)
  from public, anon, authenticated;

-- 4. Editar ---------------------------------------------------------------------------
create or replace function public.editar_pedido(p_order_id uuid, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ator uuid := public.current_app_user_id();
  v_pedido record;
  v_intencao record;
  v_loja record;
  v_tipo text := p_dados ->> 'motivo_tipo';
  v_canal text := nullif(p_dados ->> 'canal', '');
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_versao timestamptz;
  v_entrada jsonb;
  v_res jsonb;
  v_detalhe jsonb;
  v_sabor jsonb;
  v_adicional jsonb;
  v_componente jsonb;
  v_item record;
  v_item_id uuid;
  v_qtd integer;
  v_mantidos jsonb := '{}'::jsonb;
  v_novos jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_antes jsonb;
  v_depois jsonb;
  v_saiu jsonb := '[]'::jsonb;
  v_entrou jsonb := '[]'::jsonb;
  v_so_novos boolean := true;
  v_linha integer;
  v_primeira integer;
  -- entrega
  v_modalidade text;
  v_mudou_modalidade boolean;
  v_endereco jsonb := p_dados -> 'endereco';
  v_remedir boolean;
  v_endereco_mudou boolean := false;
  v_taxa numeric;
  v_taxa_manual numeric;
  v_motivo_taxa text;
  v_taxa_calculada numeric;
  v_distancia numeric;
  v_provedor text;
  v_faixa_id uuid;
  v_snapshot jsonb;
  v_exige boolean := false;
  v_requer boolean;
  v_aprovacao text;
  v_aprovou_por uuid;
  v_aprovou_em timestamptz;
  v_max_distancia numeric;
  v_status text;
  -- cliente e observação
  v_nome text;
  v_whatsapp text;
  v_observacao text;
  v_dados_mudaram jsonb := '[]'::jsonb;
  -- pagamento
  v_pag_dados jsonb := p_dados -> 'pagamento';
  v_forma record;
  v_bandeira_id uuid;
  v_bandeira_nome text;
  v_troca_forma boolean := false;
  v_troco_informado boolean := false;
  v_troco_para numeric;
  v_ja_pago numeric;
  v_desconto numeric;
  v_total numeric;
  v_devolver numeric := 0;
  v_primeiro_pagamento uuid;
  v_devolucao jsonb;
  v_numero integer;
  v_revisao uuid;
  v_afeta_comanda boolean;
  v_mudancas jsonb;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('orders.request_change') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para editar pedidos.');
  end if;

  -- JUSTIFICATIVA: sem ela nada acontece, seja qual for a tela que chamou.
  if v_tipo = 'customer' then
    if v_canal is null or v_canal not in ('whatsapp', 'phone', 'counter') then
      return jsonb_build_object('ok', false, 'erro', 'Informe por onde o cliente pediu a mudança.');
    end if;
  elsif v_tipo = 'mistake' then
    v_canal := null;
  else
    return jsonb_build_object('ok', false, 'erro', 'Informe por que o pedido está sendo editado.');
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    return jsonb_build_object('ok', false, 'erro', 'Explique o motivo da edição.');
  end if;
  if length(v_motivo) > 400 then
    return jsonb_build_object('ok', false, 'erro', 'Motivo longo demais.');
  end if;

  -- §34: trava antes de olhar. Duas edições juntas entram em fila.
  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  begin
    v_versao := nullif(p_dados ->> 'versao', '')::timestamptz;
  exception when others then
    v_versao := null;
  end;
  if v_versao is null or v_versao <> v_pedido.updated_at then
    return jsonb_build_object('ok', false, 'versao_obsoleta', true,
      'erro', 'Este pedido mudou enquanto você editava. Recarregue e tente de novo.');
  end if;

  if v_pedido.status not in ('waiting_pix_confirmation', 'waiting_delivery_approval',
                             'waiting_store_confirmation', 'confirmed', 'in_production',
                             'ready_for_pickup', 'ready_for_delivery') then
    return jsonb_build_object('ok', false, 'erro',
      'Só dá para editar o pedido antes de ele sair para entrega ou ser concluído.');
  end if;

  if exists (select 1 from public.order_revisions r
              where r.order_id = p_order_id and r.status = 'pending_customer') then
    return jsonb_build_object('ok', false, 'erro',
      'Há uma proposta aguardando o cliente. Retire-a antes de editar.');
  end if;

  select * into v_intencao from public.order_payment_intents i where i.order_id = p_order_id for update;
  select * into v_loja from public.store_settings limit 1;

  -- 1. ITENS ---------------------------------------------------------------------
  if jsonb_typeof(p_dados -> 'itens') <> 'array' or jsonb_array_length(p_dados -> 'itens') = 0 then
    return jsonb_build_object('ok', false, 'erro',
      'O pedido não pode ficar sem itens. Para não atender, use rejeitar ou cancelar.');
  end if;
  if jsonb_array_length(p_dados -> 'itens') > 60 then
    return jsonb_build_object('ok', false, 'erro', 'Itens demais de uma vez.');
  end if;

  for v_entrada in select * from jsonb_array_elements(p_dados -> 'itens') loop
    if v_entrada ? 'linha' then
      -- Item que fica: só a quantidade vem da tela. O preço é o do pedido.
      v_qtd := (v_entrada ->> 'quantidade')::integer;
      if v_qtd is null or v_qtd < 1 or v_qtd > 99 then
        return jsonb_build_object('ok', false, 'erro', 'Quantidade inválida.');
      end if;
      if v_mantidos ? (v_entrada ->> 'linha') then
        return jsonb_build_object('ok', false, 'erro', 'Item repetido na edição.');
      end if;
      if not exists (select 1 from public.order_items i
                      where i.order_id = p_order_id
                        and i.line_number = (v_entrada ->> 'linha')::integer) then
        return jsonb_build_object('ok', false, 'erro', 'Um dos itens não é mais deste pedido. Recarregue.');
      end if;
      v_mantidos := v_mantidos || jsonb_build_object(v_entrada ->> 'linha', v_qtd);
    else
      -- §16: item novo é precificado aqui, pelo motor do cardápio.
      v_res := public.montar_item(v_entrada);
      if not (v_res ->> 'ok')::boolean then
        return jsonb_build_object('ok', false,
          'erro', format('%s: %s', coalesce(v_res ->> 'nome', 'Item'), v_res ->> 'erro'));
      end if;
      v_novos := v_novos || jsonb_build_array(v_res || jsonb_build_object('observacao', v_entrada ->> 'observacao'));
      v_subtotal := v_subtotal + (v_res ->> 'total')::numeric;
    end if;
  end loop;

  for v_item in
    select i.* from public.order_items i where i.order_id = p_order_id order by i.line_number
  loop
    v_qtd := coalesce((v_mantidos ->> v_item.line_number::text)::integer, 0);
    v_subtotal := v_subtotal + (v_item.unit_price * v_qtd);
    if v_qtd < v_item.quantity then
      v_so_novos := false;
      v_saiu := v_saiu || jsonb_build_array(jsonb_build_object(
        'quantidade', v_item.quantity - v_qtd,
        'nome', public.rotulo_do_item_do_pedido(v_item.id)));
    elsif v_qtd > v_item.quantity then
      v_so_novos := false;
      v_entrou := v_entrou || jsonb_build_array(jsonb_build_object(
        'quantidade', v_qtd - v_item.quantity,
        'nome', public.rotulo_do_item_do_pedido(v_item.id)));
    end if;
  end loop;
  v_subtotal := round(v_subtotal, 2);

  -- 2. ENTREGA OU RETIRADA ---------------------------------------------------------
  v_modalidade := coalesce(nullif(p_dados ->> 'modalidade', ''), v_pedido.fulfillment_type);
  if v_modalidade not in ('delivery', 'pickup') then
    return jsonb_build_object('ok', false, 'erro', 'Modalidade inválida.');
  end if;
  v_mudou_modalidade := v_modalidade <> v_pedido.fulfillment_type;
  if v_endereco is not null and jsonb_typeof(v_endereco) <> 'object' then
    v_endereco := null;
  end if;
  v_remedir := v_modalidade = 'delivery' and (v_mudou_modalidade or v_endereco is not null);

  v_taxa := v_pedido.delivery_fee;
  v_distancia := v_pedido.delivery_route_distance_km;
  v_provedor := v_pedido.delivery_route_provider;
  v_faixa_id := v_pedido.delivery_fee_band_id;
  v_snapshot := v_pedido.delivery_address_snapshot;
  v_requer := v_pedido.requires_delivery_approval;
  v_aprovacao := v_pedido.delivery_approval_status;
  v_aprovou_por := v_pedido.delivery_approval_decided_by;
  v_aprovou_em := v_pedido.delivery_approval_decided_at;
  v_status := v_pedido.status;

  if (v_mudou_modalidade or v_remedir) and exists (
    select 1 from public.driver_run_orders r
     where r.order_id = p_order_id and r.delivery_status = 'pending') then
    return jsonb_build_object('ok', false, 'erro',
      'Este pedido já está com um motoboy. Resolva a saída antes de mudar a entrega.');
  end if;

  if v_modalidade = 'pickup' then
    v_taxa := 0;
    v_distancia := null;
    v_provedor := null;
    v_faixa_id := null;
    v_snapshot := null;
    v_endereco_mudou := v_mudou_modalidade;
  elsif v_remedir then
    if v_endereco is null then
      return jsonb_build_object('ok', false, 'erro', 'Informe o endereço de entrega.');
    end if;

    begin
      v_taxa_manual := nullif(p_dados ->> 'taxa_manual', '')::numeric;
    exception when others then
      return jsonb_build_object('ok', false, 'erro', 'Taxa de entrega inválida.');
    end;
    if v_taxa_manual is not null then
      if not public.has_permission('orders.override_delivery_fee') then
        return jsonb_build_object('ok', false, 'erro',
          'Você não tem permissão para informar a taxa de entrega.');
      end if;
      if v_taxa_manual < 0 or v_taxa_manual > 500 then
        return jsonb_build_object('ok', false, 'erro', 'Taxa de entrega fora do esperado.');
      end if;
      v_taxa_manual := round(v_taxa_manual, 2);
    end if;
    v_motivo_taxa := nullif(btrim(coalesce(p_dados ->> 'motivo_taxa_manual', '')), '');

    if v_taxa_manual is null or v_motivo_taxa is not null then
      -- §20: sem rota medida não há taxa. Nunca vira R$ 0,00 por acidente.
      if (v_endereco ->> 'latitude') is null or (v_endereco ->> 'longitude') is null then
        return jsonb_build_object('ok', false, 'erro',
          'Não conseguimos localizar esse endereço. Confira os dados.');
      end if;
      v_distancia := nullif(p_dados -> 'rota' ->> 'distancia_km', '')::numeric;
      if v_distancia is null or v_distancia < 0 then
        return jsonb_build_object('ok', false, 'erro',
          'Não conseguimos calcular a rota agora. Tente de novo em instantes.');
      end if;

      v_faixa_id := null;
      select f.id, f.fee into v_faixa_id, v_taxa from public.faixa_para_distancia(v_distancia) f;
      if v_faixa_id is null then
        select max(b.max_distance_km) into v_max_distancia
          from public.delivery_fee_bands b where b.is_active;
        return jsonb_build_object('ok', false, 'fora_de_area', true, 'erro',
          case when v_max_distancia is null
               then 'A entrega não está configurada.'
               else 'Esse endereço está fora da nossa área de entrega.' end);
      end if;

      v_exige := v_distancia > v_loja.automatic_delivery_radius_km;
      v_provedor := nullif(p_dados -> 'rota' ->> 'provedor', '');
      if v_taxa_manual is not null then
        v_taxa_calculada := v_taxa;
        v_taxa := v_taxa_manual;
      end if;
    else
      v_taxa := v_taxa_manual;
      v_distancia := null;
      v_provedor := null;
      v_faixa_id := null;
    end if;

    if v_mudou_modalidade and v_loja.delivery_minimum_enabled
       and v_subtotal < coalesce(v_loja.delivery_minimum_subtotal, 0) then
      return jsonb_build_object('ok', false, 'erro',
        format('O pedido mínimo para entrega é R$ %s.',
               to_char(v_loja.delivery_minimum_subtotal, 'FM999G999D00')));
    end if;

    v_snapshot := jsonb_build_object(
      'endereco_id', null,
      'logradouro', v_endereco ->> 'logradouro', 'numero', v_endereco ->> 'numero',
      'complemento', v_endereco ->> 'complemento', 'bairro', v_endereco ->> 'bairro',
      'cidade', v_endereco ->> 'cidade', 'uf', v_endereco ->> 'uf',
      'cep', v_endereco ->> 'cep', 'referencia', v_endereco ->> 'referencia',
      'latitude', v_endereco ->> 'latitude', 'longitude', v_endereco ->> 'longitude',
      'confianca', v_endereco ->> 'confianca',
      'taxa_manual', v_taxa_manual is not null,
      'taxa_calculada', v_taxa_calculada,
      'motivo_taxa', v_motivo_taxa,
      'taxa_a_confirmar', false,
      'taxa_teto', null);

    v_endereco_mudou := v_mudou_modalidade
      or (v_pedido.delivery_address_snapshot ->> 'logradouro') is distinct from (v_endereco ->> 'logradouro')
      or (v_pedido.delivery_address_snapshot ->> 'numero') is distinct from (v_endereco ->> 'numero')
      or nullif(v_pedido.delivery_address_snapshot ->> 'complemento', '') is distinct from nullif(v_endereco ->> 'complemento', '')
      or (v_pedido.delivery_address_snapshot ->> 'bairro') is distinct from (v_endereco ->> 'bairro')
      or nullif(v_pedido.delivery_address_snapshot ->> 'referencia', '') is distinct from nullif(v_endereco ->> 'referencia', '');
  end if;

  -- APROVAÇÃO DA ENTREGA. Só muda quando a entrega foi medida de novo, ou deixou
  -- de existir. Acima do raio automático, quem edita precisa poder aprovar: o
  -- pedido já aceito não volta para a fila por causa de uma edição.
  if v_modalidade = 'pickup' or (v_remedir and not v_exige) then
    v_requer := false;
    v_aprovacao := null;
    v_aprovou_por := null;
    v_aprovou_em := null;
    if v_status = 'waiting_delivery_approval' then
      v_status := 'waiting_store_confirmation';
    end if;
  elsif v_remedir and v_exige and v_aprovacao is distinct from 'pending' then
    if not public.has_permission('orders.accept') then
      return jsonb_build_object('ok', false, 'erro',
        'Esse endereço está acima do raio automático. Peça a quem pode aprovar entregas.');
    end if;
    v_requer := true;
    v_aprovacao := 'approved';
    v_aprovou_por := v_ator;
    v_aprovou_em := now();
  end if;

  -- Pronto para retirada vira pronto para entrega, e vice-versa.
  if v_mudou_modalidade then
    v_status := case v_status
      when 'ready_for_pickup' then 'ready_for_delivery'
      when 'ready_for_delivery' then 'ready_for_pickup'
      else v_status end;
  end if;

  -- 3. CLIENTE E OBSERVAÇÃO ---------------------------------------------------------
  v_nome := v_pedido.customer_name_snapshot;
  if p_dados ? 'nome' then
    v_nome := nullif(btrim(coalesce(p_dados ->> 'nome', '')), '');
    if v_nome is null or length(v_nome) > 120 then
      return jsonb_build_object('ok', false, 'erro', 'Informe o nome do cliente.');
    end if;
    if v_nome <> v_pedido.customer_name_snapshot then
      v_dados_mudaram := v_dados_mudaram || '["nome"]'::jsonb;
    end if;
  end if;

  v_whatsapp := v_pedido.customer_whatsapp_snapshot;
  if p_dados ? 'whatsapp' then
    v_whatsapp := regexp_replace(coalesce(p_dados ->> 'whatsapp', ''), '\D', '', 'g');
    if v_whatsapp <> '' and length(v_whatsapp) not between 10 and 15 then
      return jsonb_build_object('ok', false, 'erro', 'Telefone inválido.');
    end if;
    if v_whatsapp <> v_pedido.customer_whatsapp_snapshot then
      v_dados_mudaram := v_dados_mudaram || '["telefone"]'::jsonb;
    end if;
  end if;

  v_observacao := v_pedido.general_note;
  if p_dados ? 'observacao' then
    v_observacao := nullif(btrim(coalesce(p_dados ->> 'observacao', '')), '');
    if length(v_observacao) > 500 then
      return jsonb_build_object('ok', false, 'erro', 'Observação longa demais.');
    end if;
    if v_observacao is distinct from v_pedido.general_note then
      v_dados_mudaram := v_dados_mudaram || '["observacao"]'::jsonb;
    end if;
  end if;

  -- 4. TOTAL ------------------------------------------------------------------------
  v_desconto := least(v_pedido.discount_amount, v_subtotal + v_taxa);
  v_total := v_subtotal + v_taxa - v_desconto;

  select coalesce(sum(p.amount), 0) into v_ja_pago
    from public.payments p where p.order_id = p_order_id and p.status = 'confirmed';

  -- 5. FORMA ESPERADA (§24: só a intenção; o realizado não passa por aqui) ------------
  select * into v_forma from public.payment_methods m where false;
  if v_pag_dados is not null and jsonb_typeof(v_pag_dados) = 'object' and v_intencao.id is not null then
    v_troca_forma := nullif(v_pag_dados ->> 'forma_id', '')::uuid is distinct from v_intencao.payment_method_id
      or nullif(v_pag_dados ->> 'bandeira_id', '')::uuid is distinct from v_intencao.payment_brand_id;
    v_troco_informado := v_pag_dados ? 'troco_para';

    if v_troca_forma then
      if v_ja_pago > 0 then
        return jsonb_build_object('ok', false, 'erro',
          'Este pedido já foi recebido. A forma real se corrige em "Trocar forma".');
      end if;
      if v_intencao.pix_confirmation_status is not null then
        return jsonb_build_object('ok', false, 'erro',
          'Pedido com Pix antecipado não troca de forma aqui. Rejeite ou cancele se o Pix não vier.');
      end if;
      select * into v_forma from public.payment_methods m
       where m.id = nullif(v_pag_dados ->> 'forma_id', '')::uuid and m.is_active;
      if v_forma.id is null or v_forma.payment_family = 'pix_key' then
        return jsonb_build_object('ok', false, 'erro', 'Escolha uma forma de pagamento disponível.');
      end if;
      if v_forma.requires_brand then
        select b.id, b.name into v_bandeira_id, v_bandeira_nome
          from public.payment_brands b
         where b.id = nullif(v_pag_dados ->> 'bandeira_id', '')::uuid
           and b.payment_method_id = v_forma.id and b.is_active;
      end if;
      v_dados_mudaram := v_dados_mudaram || '["forma de pagamento"]'::jsonb;
    end if;

    if v_troco_informado then
      v_troco_para := nullif(v_pag_dados ->> 'troco_para', '')::numeric;
      if v_troco_para is not null then
        if coalesce(v_forma.payment_family, v_intencao.payment_method_family_snapshot) <> 'cash' then
          return jsonb_build_object('ok', false, 'erro', 'Troco só se aplica a pagamento em dinheiro.');
        end if;
        if v_troco_para < v_total then
          return jsonb_build_object('ok', false, 'erro', 'O troco precisa ser para um valor maior que o total.');
        end if;
      end if;
      if v_troco_para is distinct from v_intencao.change_for_amount then
        v_dados_mudaram := v_dados_mudaram || '["troco"]'::jsonb;
      end if;
    end if;
  end if;

  -- Nada mudou? Não é edição, e não deixa rastro.
  if jsonb_array_length(v_saiu) = 0 and jsonb_array_length(v_entrou) = 0
     and jsonb_array_length(v_novos) = 0 and not v_mudou_modalidade and not v_endereco_mudou
     and v_taxa = v_pedido.delivery_fee and jsonb_array_length(v_dados_mudaram) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Nenhuma mudança para salvar.');
  end if;

  -- 6. DEVOLUÇÃO. Primeiro de propósito: se não puder acontecer, nada foi gravado. ------
  v_devolver := greatest(v_ja_pago - v_total, 0);
  if v_devolver > 0 then
    begin
      v_primeiro_pagamento := nullif(p_dados ->> 'devolver_de', '')::uuid;
    exception when others then
      v_primeiro_pagamento := null;
    end;

    if v_primeiro_pagamento is null or not exists (
      select 1 from public.payments p
       where p.id = v_primeiro_pagamento and p.order_id = p_order_id and p.status = 'confirmed') then
      return jsonb_build_object('ok', false, 'exige_devolucao', true,
        'valor', v_devolver::numeric(12,2), 'total', v_total::numeric(12,2),
        'pagamentos', (select jsonb_agg(jsonb_build_object(
                          'id', p.id, 'forma', p.payment_method_name_snapshot, 'valor', p.amount)
                          order by p.received_at desc)
                         from public.payments p
                        where p.order_id = p_order_id and p.status = 'confirmed'),
        'erro', 'O novo total é menor que o recebido. Registre a devolução.');
    end if;

    v_devolucao := public.devolver_parte_do_pagamento(p_order_id, v_devolver, v_primeiro_pagamento,
      format('Edição do pedido #%s: %s', v_pedido.order_number, v_motivo));
    if not (v_devolucao ->> 'ok')::boolean then
      return jsonb_build_object('ok', false, 'erro', v_devolucao ->> 'erro');
    end if;
  end if;

  -- 7. GRAVAÇÃO ---------------------------------------------------------------------
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

  delete from public.order_items i
   where i.order_id = p_order_id and not (v_mantidos ? i.line_number::text);

  update public.order_items i
     set quantity = (v_mantidos ->> i.line_number::text)::integer,
         line_total = i.unit_price * (v_mantidos ->> i.line_number::text)::integer
   where i.order_id = p_order_id
     and i.quantity <> (v_mantidos ->> i.line_number::text)::integer;

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

    v_entrou := v_entrou || jsonb_build_array(jsonb_build_object(
      'quantidade', (v_res ->> 'quantidade')::integer,
      'nome', public.rotulo_do_item_do_pedido(v_item_id)));
  end loop;

  update public.orders
     set fulfillment_type = v_modalidade,
         status = v_status,
         subtotal = v_subtotal,
         delivery_fee = v_taxa,
         discount_amount = v_desconto,
         total = v_total,
         delivery_route_distance_km = v_distancia,
         delivery_route_provider = v_provedor,
         delivery_fee_band_id = v_faixa_id,
         delivery_address_snapshot = v_snapshot,
         requires_delivery_approval = v_requer,
         delivery_approval_status = v_aprovacao,
         delivery_approval_decided_by = v_aprovou_por,
         delivery_approval_decided_at = v_aprovou_em,
         customer_name_snapshot = v_nome,
         customer_whatsapp_snapshot = v_whatsapp,
         general_note = v_observacao,
         requires_production = public.pedido_exige_producao(p_order_id),
         -- Recebido a menos que o novo total volta a ter "falta receber".
         payment_status = case
           when v_ja_pago = 0 then payment_status
           when v_ja_pago - v_devolver >= v_total then 'confirmed'
           else 'pending' end
   where id = p_order_id;

  -- Intenção: valor acompanha o total. Troco que não cobre mais deixa de ser
  -- troco e o balcão pergunta de novo.
  if v_intencao.id is not null then
    if not v_troco_informado then
      v_troco_para := v_intencao.change_for_amount;
    end if;
    if v_troca_forma and coalesce(v_forma.payment_family, '') <> 'cash' then
      v_troco_para := null;
    end if;
    if v_troco_para is not null and v_troco_para < v_total then
      v_troco_para := null;
    end if;

    update public.order_payment_intents
       set amount_expected = v_total,
           payment_method_id = case when v_troca_forma then v_forma.id else payment_method_id end,
           payment_method_name_snapshot = case when v_troca_forma then v_forma.name else payment_method_name_snapshot end,
           payment_method_family_snapshot = case when v_troca_forma then v_forma.payment_family else payment_method_family_snapshot end,
           payment_brand_id = case when v_troca_forma then v_bandeira_id else payment_brand_id end,
           payment_brand_name_snapshot = case when v_troca_forma then v_bandeira_nome else payment_brand_name_snapshot end,
           needs_change = v_troco_para is not null,
           change_for_amount = v_troco_para,
           expected_change_amount = v_troco_para - v_total
     where id = v_intencao.id;
  end if;

  if v_status <> v_pedido.status then
    insert into public.order_status_history (order_id, from_status, to_status, actor_type, actor_user_id, reason)
    values (p_order_id, v_pedido.status, v_status, 'user', v_ator, 'Pedido editado: ' || v_motivo);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'linha', i.line_number, 'nome', i.product_name_snapshot,
           'tamanho', i.size_name_snapshot, 'quantidade', i.quantity,
           'preco_unitario', i.unit_price, 'total', i.line_total
         ) order by i.line_number), '[]'::jsonb)
    into v_depois
    from public.order_items i where i.order_id = p_order_id;

  -- A cozinha/expedição só precisa de papel novo se o que ela faz mudou.
  v_afeta_comanda := jsonb_array_length(v_saiu) > 0 or jsonb_array_length(v_entrou) > 0
    or v_mudou_modalidade or v_endereco_mudou or v_dados_mudaram ? 'observacao';

  v_mudancas := jsonb_build_object(
    'saiu', v_saiu, 'entrou', v_entrou,
    'modalidade', case when v_mudou_modalidade
      then jsonb_build_object('de', v_pedido.fulfillment_type, 'para', v_modalidade) end,
    'endereco_mudou', v_endereco_mudou and v_modalidade = 'delivery',
    'taxa', case when v_taxa <> v_pedido.delivery_fee
      then jsonb_build_object('de', v_pedido.delivery_fee, 'para', v_taxa) end,
    'dados', v_dados_mudaram,
    'devolvido', v_devolver::numeric(12,2),
    'afeta_comanda', v_afeta_comanda);

  select coalesce(max(r.revision_number), 0) + 1 into v_numero
    from public.order_revisions r where r.order_id = p_order_id;

  insert into public.order_revisions (
    order_id, revision_number, reason, proposed_by, requires_customer_approval,
    status, status_before, items_before, items_after,
    subtotal_before, total_before, subtotal_after, total_after,
    kind, added_from_line, customer_channel, reason_kind, changes, applied_at)
  values (
    p_order_id, v_numero, v_motivo, v_ator, false,
    'applied', v_pedido.status, v_antes, v_depois,
    v_pedido.subtotal, v_pedido.total, v_subtotal, v_total,
    'edit',
    -- Só somou item novo: a comanda anterior continua valendo (ACRÉSCIMO).
    case when v_so_novos and jsonb_array_length(v_novos) > 0 and not v_mudou_modalidade
              and not v_endereco_mudou and not v_dados_mudaram ? 'observacao'
         then v_primeira end,
    v_canal, v_tipo, v_mudancas, now())
  returning id into v_revisao;

  perform public.log_audit('pedido_editar', 'orders', p_order_id,
    jsonb_build_object('status', v_pedido.status, 'modalidade', v_pedido.fulfillment_type,
                       'subtotal', v_pedido.subtotal, 'taxa', v_pedido.delivery_fee,
                       'total', v_pedido.total, 'payment_status', v_pedido.payment_status),
    jsonb_build_object('status', v_status, 'modalidade', v_modalidade,
                       'subtotal', v_subtotal, 'taxa', v_taxa, 'total', v_total,
                       'canal', v_canal, 'motivo_tipo', v_tipo, 'mudancas', v_mudancas),
    v_motivo);

  return jsonb_build_object('ok', true, 'revisao_id', v_revisao,
    'total', v_total::numeric(12,2),
    'a_receber', case when v_ja_pago > 0
      then greatest(v_total - (v_ja_pago - v_devolver), 0) else 0 end::numeric(12,2),
    'devolvido', v_devolver::numeric(12,2),
    'afeta_comanda', v_afeta_comanda);
end;
$function$;

revoke all on function public.editar_pedido(uuid, jsonb) from public, anon;
grant execute on function public.editar_pedido(uuid, jsonb) to authenticated;

-- 5. Detalhe administrativo ----------------------------------------------------------
do $$
declare
  v_def text;
  v_novo text;
begin
  v_def := pg_get_functiondef('public.pedido_administrativo(uuid)'::regprocedure);

  v_novo := replace(v_def,
    E'and o.status in (''waiting_store_confirmation'', ''confirmed'')',
    E'and o.status in (''waiting_pix_confirmation'', ''waiting_delivery_approval'',\n'
    || E'                                     ''waiting_store_confirmation'', ''confirmed'', ''in_production'',\n'
    || E'                                     ''ready_for_pickup'', ''ready_for_delivery'')');
  if v_novo = v_def then raise exception 'pedido_administrativo mudou: pode_alterar'; end if;
  v_def := v_novo;

  v_novo := replace(v_def,
    E'''canal'', r.customer_channel)',
    E'''canal'', r.customer_channel, ''motivo_tipo'', r.reason_kind, ''mudancas'', r.changes,\n'
    || E'        ''por'', (select e.full_name from public.app_users au\n'
    || E'                 join public.employees e on e.id = au.employee_id where au.id = r.proposed_by))');
  if v_novo = v_def then raise exception 'pedido_administrativo mudou: revisões'; end if;
  v_def := v_novo;

  v_novo := replace(v_def,
    E'''forma'', pi.payment_method_name_snapshot,',
    E'''forma'', pi.payment_method_name_snapshot,\n        ''forma_id'', pi.payment_method_id, ''bandeira_id'', pi.payment_brand_id,');
  if v_novo = v_def then raise exception 'pedido_administrativo mudou: pagamento'; end if;

  execute v_novo;
end;
$$;
