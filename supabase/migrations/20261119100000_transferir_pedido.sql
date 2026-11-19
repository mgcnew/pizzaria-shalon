-- 0184 — Transferir pedido pronto para outro cliente
-- D-2026-11-19-190 · CLAUDE.md §21, §22, §24, §29, §33, §34 · RN-STATE-010
--
-- Caso do balcão: o cliente A desistiu ou não veio, e a pizza pronta vai para
-- o cliente B, que está ali. Decisões do Marcelo (19/11/2026):
--   · o MESMO pedido passa para B (não cancela um e cria outro);
--   · só pedido pronto (retirada ou entrega), e só se A ainda não pagou nem
--     ficou no fiado. Pago, estorna primeiro (cancelar e estornar, D-189);
--   · B leva no balcão: pedido de entrega vira retirada, a taxa sai e o total
--     é recalculado aqui, nunca vindo da tela (CLAUDE.md §16).
--
-- POR QUE UMA FUNÇÃO PRÓPRIA, e não `editar_pedido`. A edição troca só os
-- snapshots de nome e WhatsApp: o pedido continuaria ligado ao CADASTRO de A,
-- e a compra contaria para A no histórico, no fiado e no remarketing. Aqui o
-- vínculo também muda, e o link de acompanhamento de A deixa de abrir o
-- pedido, que agora tem o nome de B (CLAUDE.md §29).
--
-- O que NÃO muda: itens, preços, desconto, forma de pagamento esperada e o
-- histórico. Quem era o cliente, quem transferiu, quando e por quê ficam na
-- auditoria e no histórico de status.

create or replace function public.transferir_pedido(p_order_id uuid, p_dados jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_nome text := nullif(btrim(coalesce(p_dados ->> 'nome', '')), '');
  v_whats text := regexp_replace(coalesce(p_dados ->> 'whatsapp', ''), '\D', '', 'g');
  v_pedido record;
  v_cliente record;
  v_cliente_id uuid;
  v_consentimento boolean := false;
  v_status text;
  v_desconto numeric;
  v_total numeric;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  -- A mesma permissão de editar pedido: transferir é trocar o dono do pedido.
  if not public.has_permission('orders.request_change') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para transferir pedidos.');
  end if;

  if v_motivo is null or length(v_motivo) < 3 then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da transferência.');
  end if;
  if length(v_motivo) > 400 then
    return jsonb_build_object('ok', false, 'erro', 'Motivo longo demais.');
  end if;
  if v_nome is null or length(v_nome) > 120 then
    return jsonb_build_object('ok', false, 'erro', 'Informe o nome de quem vai levar o pedido.');
  end if;
  if v_whats <> '' and length(v_whats) not between 10 and 15 then
    return jsonb_build_object('ok', false, 'erro', 'WhatsApp inválido. Use DDD e número.');
  end if;

  -- §34: trava antes de olhar. Duas transferências juntas entram em fila, e a
  -- segunda encontra o pedido já de outro dono.
  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  if v_pedido.status not in ('ready_for_pickup', 'ready_for_delivery') then
    return jsonb_build_object('ok', false, 'erro', 'Só dá para transferir pedido que está pronto.');
  end if;

  -- O dinheiro de A não vira pagamento de B.
  if exists (select 1 from public.payments p
              where p.order_id = p_order_id and p.status = 'confirmed') then
    return jsonb_build_object('ok', false, 'bloqueio', 'pagamento_confirmado',
      'erro', 'Este pedido já tem pagamento do cliente anterior. Cancele e estorne em vez de transferir.');
  end if;
  if v_pedido.deferred_at is not null then
    return jsonb_build_object('ok', false, 'bloqueio', 'fiado',
      'erro', 'Este pedido está no fiado do cliente anterior. Desfaça o fiado antes de transferir.');
  end if;
  if exists (select 1 from public.order_revisions r
              where r.order_id = p_order_id and r.status = 'pending_customer') then
    return jsonb_build_object('ok', false, 'erro',
      'Há uma proposta aguardando o cliente. Retire-a antes de transferir.');
  end if;

  -- Cadastro de B: o mesmo caminho do pedido de balcão. Sem WhatsApp, o
  -- pedido fica sem cadastro, como a venda de balcão sem cliente.
  if v_whats <> '' then
    if v_whats = v_pedido.customer_whatsapp_snapshot then
      return jsonb_build_object('ok', false, 'erro', 'Este pedido já é deste cliente.');
    end if;
    select * into v_cliente from public.customers c where c.whatsapp_normalized = v_whats;
    if v_cliente.id is null then
      insert into public.customers (name, whatsapp_normalized, whatsapp_display,
        marketing_consent, marketing_consent_updated_at)
      values (v_nome, v_whats, p_dados ->> 'whatsapp', false, null)
      returning * into v_cliente;
    elsif v_cliente.is_blocked then
      return jsonb_build_object('ok', false, 'erro',
        'Este cliente está bloqueado e não pode receber o pedido.');
    end if;
    v_cliente_id := v_cliente.id;
    v_consentimento := coalesce(v_cliente.marketing_consent, false);
  end if;

  -- B leva no balcão: entrega vira retirada, sem taxa nem endereço.
  v_status := 'ready_for_pickup';
  v_desconto := least(v_pedido.discount_amount, v_pedido.subtotal);
  v_total := v_pedido.subtotal - v_desconto;

  update public.orders
     set customer_id = v_cliente_id,
         customer_name_snapshot = v_nome,
         customer_whatsapp_snapshot = v_whats,
         marketing_consent_snapshot = v_consentimento,
         -- O link e o "Meus pedidos" de A deixam de abrir este pedido. Ninguém
         -- tem o token novo: B não acompanha pelo link, leva na mão.
         public_device_id = null,
         tracking_token_hash = 'transferido:' || gen_random_uuid()::text,
         fulfillment_type = 'pickup',
         status = v_status,
         delivery_fee = 0,
         discount_amount = v_desconto,
         total = v_total,
         delivery_route_distance_km = null,
         delivery_route_provider = null,
         delivery_fee_band_id = null,
         delivery_address_snapshot = null,
         requires_delivery_approval = false,
         delivery_approval_status = null,
         delivery_approval_decided_by = null,
         delivery_approval_decided_at = null
   where id = p_order_id;

  -- A intenção de pagamento acompanha o total; o troco era de A.
  update public.order_payment_intents
     set amount_expected = v_total,
         needs_change = false,
         change_for_amount = null,
         expected_change_amount = null
   where order_id = p_order_id;

  if v_status <> v_pedido.status then
    insert into public.order_status_history (order_id, from_status, to_status, actor_type, actor_user_id, reason)
    values (p_order_id, v_pedido.status, v_status, 'user', v_ator,
            'Transferido para ' || v_nome || ': ' || v_motivo);
  end if;

  perform public.log_audit('pedido_transferir', 'orders', p_order_id,
    jsonb_build_object('cliente_id', v_pedido.customer_id,
                       'nome', v_pedido.customer_name_snapshot,
                       'whatsapp', v_pedido.customer_whatsapp_snapshot,
                       'status', v_pedido.status, 'modalidade', v_pedido.fulfillment_type,
                       'taxa', v_pedido.delivery_fee, 'total', v_pedido.total),
    jsonb_build_object('cliente_id', v_cliente_id, 'nome', v_nome, 'whatsapp', v_whats,
                       'status', v_status, 'modalidade', 'pickup',
                       'taxa', 0, 'total', v_total),
    v_motivo);

  return jsonb_build_object('ok', true, 'status', v_status, 'total', v_total::numeric(12,2));
end;
$$;

comment on function public.transferir_pedido(uuid, jsonb) is
  'D-2026-11-19-190: pedido pronto e não pago passa para outro cliente, como retirada.';

revoke all on function public.transferir_pedido(uuid, jsonb) from public, anon;
grant execute on function public.transferir_pedido(uuid, jsonb) to authenticated;

do $post$
begin
  if not exists (select 1 from pg_proc where proname = 'transferir_pedido') then
    raise exception 'transferir_pedido não foi criada';
  end if;
end;
$post$;
