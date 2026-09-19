-- 0056 — cada item do pedido volta também com a configuração que o gerou
--
-- POR QUE ISSO É NECESSÁRIO.
--
-- `propor_alteracao` reprecifica com `montar_item`, que recebe ESCOLHAS —
-- ids de produto, tamanho, sabores, borda e adicionais. Mas o detalhe do
-- pedido devolvia apenas os snapshots, que são NOMES: bons para ler, inúteis
-- para remontar.
--
-- Sem isto, a tela de alteração teria de adivinhar os ids a partir dos
-- nomes, e nome não é chave: dois sabores podem ser renomeados, um tamanho
-- pode mudar de rótulo, e a alteração passaria a reprecificar outra coisa.
--
-- Os snapshots continuam sendo a verdade histórica do que foi vendido. A
-- configuração é só o ponto de partida para propor o que vem depois.
create or replace function public.configuracao_do_item(p_item_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'produto_id', i.product_id,
    -- A variação é a do PRÓPRIO produto no tamanho pedido. Em meio a meio,
    -- os demais sabores entram na lista de sabores.
    'variacao_id', (select pv.id from public.product_variants pv
                     where pv.product_id = i.product_id and pv.size_id = i.size_id),
    'sabores', coalesce((select jsonb_agg(f.variant_id order by f.sort_order)
                          from public.order_item_flavors f
                         where f.order_item_id = i.id), '[]'::jsonb),
    'borda_id', i.crust_id,
    'adicionais', coalesce((select jsonb_agg(a.addon_id order by a.addon_name_snapshot)
                             from public.order_item_addons a
                            where a.order_item_id = i.id), '[]'::jsonb),
    'observacao', coalesce(i.observation, ''),
    'quantidade', i.quantity)
  from public.order_items i
  where i.id = p_item_id;
$$;

revoke all on function public.configuracao_do_item(uuid) from public, anon;
grant execute on function public.configuracao_do_item(uuid) to authenticated;

comment on function public.configuracao_do_item is 'As escolhas que geraram o item, para remontar em uma alteração. Snapshot continua sendo o histórico.';

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
    'aguarda_cliente', exists (select 1 from public.order_revisions r
                                where r.order_id = o.id and r.status = 'pending_customer'),
    'pode_alterar', public.has_permission('orders.request_change')
                    and o.status in ('waiting_store_confirmation', 'confirmed')
                    and not exists (select 1 from public.order_revisions r
                                     where r.order_id = o.id and r.status = 'pending_customer'),
    'pode_retirar_alteracao', public.has_permission('orders.request_change')
                    and exists (select 1 from public.order_revisions r
                                 where r.order_id = o.id and r.status = 'pending_customer'),
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
                    from public.order_combo_components c where c.order_item_id = i.id),
        'configuracao', public.configuracao_do_item(i.id)
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
    'acoes', public.acoes_do_pedido(o.id)
  )
  from public.orders o
  where o.id = p_order_id;
$$;

comment on function public.pedido_administrativo is 'Detalhe operacional completo. INVOKER: o RLS de orders decide quem lê.';
