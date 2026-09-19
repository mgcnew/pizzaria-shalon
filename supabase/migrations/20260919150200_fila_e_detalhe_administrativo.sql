-- 0050 — Fila operacional, detalhe do pedido e tracking com alteração
-- 01-DOCUMENTO-MESTRE.md §79.12 · 03-RLS-RBAC-SEGURANCA.md §10 · RN-ALT-005
--
-- A fila é uma projeção única, e não uma consulta por pedido: o balcão abre
-- isto o tempo todo, e N+1 aqui seria sentido na operação (CLAUDE.md §39).
--
-- INVOKER de propósito: quem não tem `orders.view` não enxerga linha
-- alguma, porque o RLS continua valendo dentro da função.

create or replace function public.fila_de_pedidos(p_encerrados boolean default false)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(f order by f.criado_em desc), '[]'::jsonb)
  from (
    select
      o.id, o.order_number as numero, o.status, o.fulfillment_type as modalidade,
      o.source as origem,
      o.customer_name_snapshot as cliente,
      o.subtotal, o.delivery_fee as taxa_entrega, o.total,
      o.created_at as criado_em, o.accepted_at as aceito_em,
      o.estimated_min_minutes as estimativa_min,
      o.estimated_max_minutes as estimativa_max,
      o.general_note as observacao,
      o.delivery_route_distance_km as distancia_km,
      (select count(*) from public.order_items i where i.order_id = o.id) as itens,
      pi.payment_method_name_snapshot as forma_pagamento,
      pi.expected_change_amount as troco,
      -- Os bloqueios que impedem o aceite, cada um por nome. A interface
      -- mostra o que falta resolver em vez de só desabilitar um botão.
      (pi.pix_confirmation_status = 'pending') as aguarda_pix,
      (o.delivery_approval_status = 'pending') as aguarda_aprovacao_entrega,
      exists (select 1 from public.order_revisions r
               where r.order_id = o.id and r.status = 'pending_customer') as aguarda_cliente,
      (o.status in ('completed', 'rejected', 'cancelled')) as encerrado
    from public.orders o
    left join public.order_payment_intents pi on pi.order_id = o.id
    where (o.status in ('completed', 'rejected', 'cancelled')) = p_encerrados
  ) f;
$$;

revoke all on function public.fila_de_pedidos(boolean) from public, anon;
grant execute on function public.fila_de_pedidos(boolean) to authenticated;

comment on function public.fila_de_pedidos is 'Central operacional. INVOKER: sem orders.view não retorna nada.';

-- ---------------------------------------------------------------- detalhe
create or replace function public.pedido_administrativo(p_order_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'numero', o.order_number, 'status', o.status,
    'modalidade', o.fulfillment_type, 'origem', o.source,
    'criado_em', o.created_at, 'aceito_em', o.accepted_at,
    'cliente', jsonb_build_object(
      'nome', o.customer_name_snapshot,
      'whatsapp', o.customer_whatsapp_snapshot),
    'endereco', o.delivery_address_snapshot,
    'distancia_km', o.delivery_route_distance_km,
    'subtotal', o.subtotal, 'taxa_entrega', o.delivery_fee, 'total', o.total,
    'observacao', o.general_note,
    'estimativa_min', o.estimated_min_minutes,
    'estimativa_max', o.estimated_max_minutes,
    'motivo_rejeicao', o.rejection_reason,
    'motivo_cancelamento', o.cancellation_reason,
    'aguarda_aprovacao_entrega', o.delivery_approval_status = 'pending',
    'aprovacao_entrega', o.delivery_approval_status,
    'itens', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'linha', i.line_number, 'nome', i.product_name_snapshot,
        'categoria', i.category_name_snapshot,
        'quantidade', i.quantity, 'preco_unitario', i.unit_price, 'total', i.line_total,
        'tamanho', i.size_name_snapshot, 'borda', i.crust_name_snapshot,
        'observacao', i.observation,
        'sabores', (select jsonb_agg(jsonb_build_object('nome', f.flavor_name_snapshot,
                                                        'porcao', f.portion)
                                     order by f.sort_order)
                      from public.order_item_flavors f where f.order_item_id = i.id),
        'adicionais', (select jsonb_agg(a.addon_name_snapshot order by a.addon_name_snapshot)
                         from public.order_item_addons a where a.order_item_id = i.id),
        'combo', (select jsonb_agg(jsonb_build_object('nome', c.product_name_snapshot,
                                                      'tamanho', c.size_name_snapshot,
                                                      'quantidade', c.quantity)
                                   order by c.sort_order)
                    from public.order_combo_components c where c.order_item_id = i.id)
      ) order by i.line_number), '[]'::jsonb)
      from public.order_items i where i.order_id = o.id),
    'pagamento', (
      select jsonb_build_object(
        'forma', pi.payment_method_name_snapshot,
        'familia', pi.payment_method_family_snapshot,
        'bandeira', pi.payment_brand_name_snapshot,
        'valor_esperado', pi.amount_expected,
        'troco_para', pi.change_for_amount,
        'troco_esperado', pi.expected_change_amount,
        'pix_status', pi.pix_confirmation_status,
        'pix_confirmado_em', pi.pix_confirmed_at)
      from public.order_payment_intents pi where pi.order_id = o.id),
    'historico', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'de', h.from_status, 'para', h.to_status, 'em', h.created_at,
        'ator', h.actor_type, 'motivo', h.reason) order by h.created_at), '[]'::jsonb)
      from public.order_status_history h where h.order_id = o.id),
    'revisoes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'numero', r.revision_number, 'status', r.status,
        'motivo', r.reason, 'proposta_em', r.proposed_at,
        'exige_cliente', r.requires_customer_approval,
        'total_antes', r.total_before, 'total_depois', r.total_after,
        'itens_antes', r.items_before) order by r.revision_number desc), '[]'::jsonb)
      from public.order_revisions r where r.order_id = o.id),
    'impressoes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'tipo', p.document_type, 'via', p.copy_number,
        'status', p.status, 'transporte', p.transport, 'erro', p.error_message,
        'em', p.requested_at) order by p.requested_at desc), '[]'::jsonb)
      from public.order_prints p where p.order_id = o.id),
    -- O que este usuário realmente pode fazer agora, decidido no servidor.
    'comandos_possiveis', (
      select coalesce(jsonb_agg(c.comando), '[]'::jsonb)
      from (
        select unnest(array['confirmar_pix','aprovar_entrega','rejeitar_entrega','aceitar',
                            'iniciar_producao','marcar_pronto','despachar','concluir',
                            'registrar_falha_entrega','rejeitar','cancelar']) as comando
      ) c
      where public.has_permission(public.permissao_do_comando(c.comando)))
  )
  from public.orders o
  where o.id = p_order_id;
$$;

revoke all on function public.pedido_administrativo(uuid) from public, anon;
grant execute on function public.pedido_administrativo(uuid) to authenticated;

comment on function public.pedido_administrativo is 'Detalhe operacional completo. INVOKER: o RLS de orders decide quem lê.';

-- ------------------------------------------------ tracking com alteração
-- RN-ALT-005: a tela de aprovação mostra a mudança e o total anterior/novo.
-- Só isso é acrescentado à projeção pública: nada de id interno, nome de
-- funcionário, motivo interno ou histórico administrativo (03 §10.2).
create or replace function public.alteracao_do_pedido(p_token text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'ok', true,
      'motivo', r.reason,
      'itens_antes', r.items_before,
      'itens_depois', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'nome', item ->> 'nome',
          'quantidade', (item ->> 'quantidade')::integer,
          'total', (item ->> 'total')::numeric,
          'rotulos', item -> 'rotulos',
          'observacao', item ->> 'observacao')), '[]'::jsonb)
        from jsonb_array_elements(r.items_after) as item),
      'subtotal_antes', r.subtotal_before, 'subtotal_depois', r.subtotal_after,
      'total_antes', r.total_before, 'total_depois', r.total_after)
    from public.orders o
    join public.order_revisions r on r.order_id = o.id and r.status = 'pending_customer'
    where p_token is not null and length(p_token) >= 32
      and o.tracking_token_hash = public.hash_token(p_token)
  ), jsonb_build_object('ok', false));
$$;

revoke all on function public.alteracao_do_pedido(text) from public;
grant execute on function public.alteracao_do_pedido(text) to anon, authenticated;

comment on function public.alteracao_do_pedido is 'RN-ALT-005: antes e depois para o cliente decidir. Nada interno sai daqui.';
