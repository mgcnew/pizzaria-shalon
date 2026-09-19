-- 0043 — RLS dos pedidos e projeção pública de acompanhamento
-- 03-RLS-RBAC-SEGURANCA.md §9.1, §10, §11, §12 · §33.3 e §33.4

alter table public.customers enable row level security;
alter table public.customers force row level security;
alter table public.customer_addresses enable row level security;
alter table public.customer_addresses force row level security;
alter table public.public_devices enable row level security;
alter table public.public_devices force row level security;
alter table public.orders enable row level security;
alter table public.orders force row level security;
alter table public.order_items enable row level security;
alter table public.order_items force row level security;
alter table public.order_item_flavors enable row level security;
alter table public.order_item_flavors force row level security;
alter table public.order_item_addons enable row level security;
alter table public.order_item_addons force row level security;
alter table public.order_combo_components enable row level security;
alter table public.order_combo_components force row level security;
alter table public.order_status_history enable row level security;
alter table public.order_status_history force row level security;
alter table public.order_payment_intents enable row level security;
alter table public.order_payment_intents force row level security;
alter table public.payments enable row level security;
alter table public.payments force row level security;

-- NENHUMA policy para `anon` em tabela alguma deste grupo.
-- §9.1: "Não conceder ao papel anon permissão para inserir livremente em
-- orders, order_items, payments, snapshots financeiros." O público cria
-- pedido por `criar_pedido` e consulta por `pedido_por_token` — só isso.
-- §12.1: não existe endpoint público de busca de cliente por telefone.

create policy customers_select on public.customers
  for select to authenticated using (public.has_permission('customers.view'));
create policy customers_update on public.customers
  for update to authenticated
  using (public.has_permission('customers.block'))
  with check (public.has_permission('customers.block'));

create policy customer_addresses_select on public.customer_addresses
  for select to authenticated using (public.has_permission('customers.view'));

create policy public_devices_select on public.public_devices
  for select to authenticated using (public.has_permission('customers.view'));

create policy orders_select on public.orders
  for select to authenticated using (public.has_permission('orders.view'));
create policy order_items_select on public.order_items
  for select to authenticated using (public.has_permission('orders.view'));
create policy order_item_flavors_select on public.order_item_flavors
  for select to authenticated using (public.has_permission('orders.view'));
create policy order_item_addons_select on public.order_item_addons
  for select to authenticated using (public.has_permission('orders.view'));
create policy order_combo_components_select on public.order_combo_components
  for select to authenticated using (public.has_permission('orders.view'));
create policy order_status_history_select on public.order_status_history
  for select to authenticated using (public.has_permission('orders.view'));
create policy order_payment_intents_select on public.order_payment_intents
  for select to authenticated using (public.has_permission('orders.view'));

-- §17.3 e §33.7: dado financeiro tem porta própria.
create policy payments_select on public.payments
  for select to authenticated using (public.has_permission('finance.view'));

-- Escrita interna (aceitar, rejeitar, mudar estado) é da Fase 6 e entra com
-- as operações de domínio correspondentes. Não se abre UPDATE em `orders`
-- agora "para facilitar depois" — seria exatamente o atalho que §19 proíbe.

-- ----------------------------------------------------- tracking público
-- 03 §10: o token dá acesso A UM pedido e só aos dados públicos dele.
-- Conhecer o número "#1052" não serve para nada.
create or replace function public.pedido_por_token(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pedido record;
  v_itens jsonb;
  v_pagamento record;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('ok', false, 'erro', 'Link inválido.');
  end if;

  select * into v_pedido
    from public.orders o
    where o.tracking_token_hash = public.hash_token(p_token);

  if v_pedido.id is null then
    -- Mesma resposta para token errado e pedido inexistente: não confirma
    -- a existência de nada a quem está tentando adivinhar.
    return jsonb_build_object('ok', false, 'erro', 'Não encontramos esse pedido.');
  end if;

  select jsonb_agg(jsonb_build_object(
           'nome', i.product_name_snapshot,
           'quantidade', i.quantity,
           'total', i.line_total,
           'tamanho', i.size_name_snapshot,
           'borda', i.crust_name_snapshot,
           'observacao', i.observation,
           'sabores', (select jsonb_agg(f.flavor_name_snapshot order by f.sort_order)
                         from public.order_item_flavors f where f.order_item_id = i.id),
           'adicionais', (select jsonb_agg(a.addon_name_snapshot order by a.addon_name_snapshot)
                            from public.order_item_addons a where a.order_item_id = i.id)
         ) order by i.line_number)
    into v_itens
    from public.order_items i where i.order_id = v_pedido.id;

  select * into v_pagamento
    from public.order_payment_intents pi where pi.order_id = v_pedido.id;

  return jsonb_build_object(
    'ok', true,
    'numero', v_pedido.order_number,
    'status', v_pedido.status,
    'modalidade', v_pedido.fulfillment_type,
    'criado_em', v_pedido.created_at,
    -- Nome sim; telefone COMPLETO não. O cliente já sabe o próprio número, e
    -- quem achar o link não precisa saber.
    'cliente_nome', v_pedido.customer_name_snapshot,
    'itens', coalesce(v_itens, '[]'::jsonb),
    'subtotal', v_pedido.subtotal,
    'taxa_entrega', v_pedido.delivery_fee,
    'total', v_pedido.total,
    'observacao', v_pedido.general_note,
    'estimativa_min', v_pedido.estimated_min_minutes,
    'estimativa_max', v_pedido.estimated_max_minutes,
    'aguarda_aprovacao_entrega', v_pedido.requires_delivery_approval
      and v_pedido.delivery_approval_status = 'pending',
    'endereco', v_pedido.delivery_address_snapshot - 'latitude' - 'longitude' - 'endereco_id',
    'loja', v_pedido.store_address_snapshot,
    'pagamento', jsonb_build_object(
      'forma', v_pagamento.payment_method_name_snapshot,
      'bandeira', v_pagamento.payment_brand_name_snapshot,
      'troco_para', v_pagamento.change_for_amount,
      'troco_esperado', v_pagamento.expected_change_amount,
      'pix_status', v_pagamento.pix_confirmation_status
    ),
    -- Motivo PÚBLICO. Nota interna, auditoria, dado de funcionário e
    -- financeiro interno não saem daqui (§10.2).
    'motivo_rejeicao', v_pedido.rejection_reason,
    'motivo_cancelamento', v_pedido.cancellation_reason
  );
end;
$$;

comment on function public.pedido_por_token is '03 §10: token dá acesso a UM pedido e só aos dados públicos dele.';

revoke all on function public.pedido_por_token(text) from public;
grant execute on function public.pedido_por_token(text) to anon, authenticated;
