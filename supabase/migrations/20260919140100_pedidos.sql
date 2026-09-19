-- 0038 — Pedidos, itens e snapshots
-- 02-MODELO-DADOS-SUPABASE.md §9 · 04-REGRAS-NEGOCIO.md PARTE V · §20
-- 03-RLS-RBAC-SEGURANCA.md §9 e §10 · CLAUDE.md §21, §22, §34
--
-- PRINCÍPIO DESTAS TABELAS: o pedido precisa continuar historicamente
-- correto mesmo depois que o cardápio mudar. Por isso quase tudo tem
-- `_snapshot`: nome, tamanho, sabor, borda, adicional, preço unitário e
-- preço de tabela ficam GRAVADOS. Reconstruir o passado por JOIN com o
-- cadastro atual reescreveria a história (RN-SNAP-001).

-- Número humano do pedido, separado da PK (03 §10.1: conhecer "#1052" não
-- pode dar acesso a nada — quem dá acesso é o token).
create sequence public.order_number_seq start with 1000 increment by 1;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint not null unique default nextval('public.order_number_seq'),

  customer_id uuid references public.customers (id) on delete restrict,
  public_device_id uuid references public.public_devices (id) on delete set null,
  -- 03 §10.1: token imprevisível, guardado como hash.
  tracking_token_hash text not null unique,

  -- 79.1: origem preservada. iFood existe como ORIGEM, sem integração.
  source text not null default 'shalon_link',
  fulfillment_type text not null,

  -- RN-STATE: estado não se edita por coluna solta; quem muda é operação de
  -- domínio. As transições operacionais são da Fase 6.
  status text not null,
  payment_status text not null default 'pending',

  -- Snapshots do cliente: alterar o cadastro depois NÃO reescreve o pedido
  -- (RN-CLI-005).
  customer_name_snapshot text not null,
  customer_whatsapp_snapshot text not null,
  marketing_consent_snapshot boolean not null default false,

  subtotal numeric(12, 2) not null,
  delivery_fee numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,

  general_note text,

  -- RN-LOJA-004: o pedido guarda o prazo que FOI MOSTRADO ao cliente.
  estimated_min_minutes integer,
  estimated_max_minutes integer,

  -- RN-ENT-011: dimensão PRÓPRIA, e não mais um estado no mesmo enum. Um
  -- pedido pode estar esperando confirmação do Pix E aprovação de entrega ao
  -- mesmo tempo; enum único forçaria escolher um e perder o outro
  -- (02 §9.2 alerta exatamente para isso).
  requires_delivery_approval boolean not null default false,
  delivery_approval_status text,
  delivery_approval_decided_by uuid references public.app_users (id) on delete set null,
  delivery_approval_decided_at timestamptz,

  -- RN-ENT-013: snapshot da distância e do provedor que a calculou.
  delivery_route_distance_km numeric(8, 3),
  delivery_route_provider text,
  delivery_fee_band_id uuid references public.delivery_fee_bands (id) on delete set null,
  delivery_address_snapshot jsonb,
  store_address_snapshot jsonb,

  rejection_reason text,
  cancellation_reason text,
  accepted_at timestamptz,
  accepted_by uuid references public.app_users (id) on delete set null,
  ready_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users (id) on delete set null,

  -- Proteção contra clique duplo e reenvio: a MESMA tentativa de checkout
  -- não pode virar dois pedidos.
  idempotency_key uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_origem check (
    source in ('shalon_link', 'whatsapp', 'phone', 'counter', 'ifood', 'other')
  ),
  constraint orders_modalidade check (fulfillment_type in ('delivery', 'pickup')),
  constraint orders_status check (status in (
    'waiting_pix_confirmation', 'waiting_delivery_approval', 'waiting_store_confirmation',
    'change_requested_waiting_customer', 'confirmed', 'in_production',
    'ready_for_pickup', 'ready_for_delivery', 'out_for_delivery',
    'delivery_failed', 'completed', 'rejected', 'cancelled'
  )),
  constraint orders_pagamento check (payment_status in ('pending', 'confirmed', 'reversed')),
  constraint orders_aprovacao check (
    delivery_approval_status is null
    or delivery_approval_status in ('pending', 'approved', 'rejected')
  ),
  -- Aprovação de entrega só existe para ENTREGA.
  constraint orders_aprovacao_so_entrega check (
    fulfillment_type = 'delivery' or not requires_delivery_approval
  ),
  constraint orders_aprovacao_coerente check (
    requires_delivery_approval = (delivery_approval_status is not null)
  ),
  -- RN-ENT-002: retirada não tem taxa, distância nem endereço de entrega.
  constraint orders_retirada_sem_entrega check (
    fulfillment_type = 'delivery'
    or (delivery_fee = 0
        and delivery_route_distance_km is null
        and delivery_address_snapshot is null)
  ),
  -- 02 §23: entrega criada normalmente tem snapshot de endereço e rota.
  constraint orders_entrega_com_snapshot check (
    fulfillment_type = 'pickup'
    or (delivery_address_snapshot is not null
        and delivery_route_distance_km is not null)
  ),
  constraint orders_valores check (
    subtotal >= 0 and delivery_fee >= 0 and total >= 0
  ),
  -- O total é a soma, e o banco confere. Um total "calculado" que não bate
  -- com subtotal + taxa nem chega a ser gravado.
  constraint orders_total_confere check (total = subtotal + delivery_fee),
  constraint orders_estimativa check (
    (estimated_min_minutes is null) = (estimated_max_minutes is null)
    and (estimated_min_minutes is null or estimated_max_minutes >= estimated_min_minutes)
  )
);

-- Mesma tentativa de checkout, um pedido só.
create unique index orders_idempotencia
  on public.orders (idempotency_key) where idempotency_key is not null;

create index orders_criado on public.orders (created_at desc);
create index orders_status_criado on public.orders (status, created_at desc);
create index orders_do_cliente on public.orders (customer_id, created_at desc);
create index orders_do_dispositivo on public.orders (public_device_id, created_at desc);
create index orders_origem_criado on public.orders (source, created_at desc);

comment on table public.orders is 'Pedido. Snapshots preservam o passado; JOIN com o cadastro atual reescreveria a história (RN-SNAP-001).';
comment on column public.orders.delivery_approval_status is 'RN-ENT-011: dimensão própria. Pix pendente e aprovação de entrega convivem sem se anular.';
comment on column public.orders.idempotency_key is 'Clique duplo e reenvio não criam segundo pedido.';

create trigger orders_updated_at before update on public.orders
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------- itens
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  line_number integer not null,
  item_type text not null,

  product_id uuid references public.products (id) on delete set null,
  product_name_snapshot text not null,
  category_name_snapshot text,

  quantity integer not null,
  unit_price numeric(12, 2) not null,
  line_total numeric(12, 2) not null,

  size_id uuid references public.pizza_sizes (id) on delete set null,
  size_name_snapshot text,

  crust_id uuid references public.crusts (id) on delete set null,
  crust_name_snapshot text,
  crust_price_snapshot numeric(12, 2) not null default 0,

  observation text,

  promotion_id uuid references public.promotions (id) on delete set null,
  promotion_name_snapshot text,
  -- Preço que teria sido cobrado sem promoção. Permite dizer depois quanto o
  -- cliente economizou sem depender da promoção ainda existir.
  regular_unit_price_snapshot numeric(12, 2),

  created_at timestamptz not null default now(),

  constraint order_items_tipo check (item_type in ('product', 'pizza', 'combo')),
  constraint order_items_quantidade check (quantity > 0),
  constraint order_items_precos check (unit_price >= 0 and line_total >= 0),
  constraint order_items_total_confere check (line_total = unit_price * quantity),
  constraint order_items_linha_unica unique (order_id, line_number)
);

create index order_items_do_pedido on public.order_items (order_id);
create index order_items_produto on public.order_items (product_id);
create index order_items_promocao on public.order_items (promotion_id);
create index order_items_tamanho on public.order_items (size_id);
create index order_items_borda on public.order_items (crust_id);

-- RN-PIZZA-006 e RN-POP-001: a porção permite ranquear 1 para pizza inteira
-- e 0,5 para cada metade SEM interpretar texto.
create table public.order_item_flavors (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  flavor_product_id uuid references public.products (id) on delete set null,
  flavor_name_snapshot text not null,
  variant_id uuid references public.product_variants (id) on delete set null,
  effective_price_snapshot numeric(12, 2) not null,
  portion numeric(5, 4) not null,
  sort_order integer not null default 0,

  constraint order_item_flavors_porcao check (portion > 0 and portion <= 1),
  constraint order_item_flavors_preco check (effective_price_snapshot >= 0)
);

create index order_item_flavors_do_item on public.order_item_flavors (order_item_id);
create index order_item_flavors_produto on public.order_item_flavors (flavor_product_id);
create index order_item_flavors_variacao on public.order_item_flavors (variant_id);

comment on table public.order_item_flavors is 'RN-PIZZA-006: portion 1,0 para inteira e 0,5 por metade, sem inferir texto.';

-- RN-ADD-003: sem quantidade maior que 1 na V1 — por isso não há coluna.
create table public.order_item_addons (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  addon_id uuid references public.addons (id) on delete set null,
  addon_name_snapshot text not null,
  price_snapshot numeric(12, 2) not null,

  constraint order_item_addons_preco check (price_snapshot >= 0)
);

create index order_item_addons_do_item on public.order_item_addons (order_item_id);
create index order_item_addons_adicional on public.order_item_addons (addon_id);

-- RN-COMBO-002: o que efetivamente foi vendido dentro do combo. O preço
-- comercial continua no item do combo (RN-COMBO-006); isto serve à produção
-- e a relatórios de unidades movimentadas.
create table public.order_combo_components (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  component_product_id uuid references public.products (id) on delete set null,
  component_variant_id uuid references public.product_variants (id) on delete set null,
  product_name_snapshot text not null,
  size_name_snapshot text,
  quantity integer not null,
  observation text,
  sort_order integer not null default 0,

  constraint order_combo_components_quantidade check (quantity > 0)
);

create index order_combo_components_do_item on public.order_combo_components (order_item_id);
create index order_combo_components_produto on public.order_combo_components (component_product_id);
create index order_combo_components_variacao on public.order_combo_components (component_variant_id);

-- --------------------------------------------------- histórico de estado
-- RN-AUD e §19: transição é evento, não sobrescrita.
create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  from_status text,
  to_status text not null,
  reason text,
  actor_type text not null,
  actor_user_id uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint order_status_history_ator check (actor_type in ('customer', 'user', 'system'))
);

create index order_status_history_do_pedido
  on public.order_status_history (order_id, created_at);
create index order_status_history_ator on public.order_status_history (actor_user_id);

comment on table public.order_status_history is 'Append-only para a operação: transição é evento, não sobrescrita (§19).';
