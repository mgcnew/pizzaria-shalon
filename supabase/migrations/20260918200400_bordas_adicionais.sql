-- 0015 — Bordas e adicionais
-- 02-MODELO-DADOS-SUPABASE.md §5.5 a §5.10
-- 04-REGRAS-NEGOCIO.md RN-BORDA-001/002/003, RN-ADD-001 a RN-ADD-005
-- 01-DOCUMENTO-MESTRE.md §79.4

-- --------------------------------------------------------------- bordas
create table public.crusts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  is_temporarily_available boolean not null default true,
  temporary_unavailable_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crusts_nome check (length(btrim(name)) > 0)
);

comment on table public.crusts is 'Bordas recheadas. RN-BORDA-001: no máximo uma por pizza, ou nenhuma.';

create trigger crusts_updated_at before update on public.crusts
  for each row execute function public.tg_set_updated_at();

-- RN-BORDA-002: preço e disponibilidade variam POR TAMANHO. A ausência de
-- linha para um tamanho já significa "esta borda não existe nesse tamanho".
create table public.crust_size_prices (
  id uuid primary key default gen_random_uuid(),
  crust_id uuid not null references public.crusts (id) on delete restrict,
  size_id uuid not null references public.pizza_sizes (id) on delete restrict,
  price numeric(12, 2) not null,
  is_active boolean not null default true,
  is_temporarily_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crust_size_prices_unica unique (crust_id, size_id),
  constraint crust_size_prices_preco check (price >= 0)
);

create trigger crust_size_prices_updated_at before update on public.crust_size_prices
  for each row execute function public.tg_set_updated_at();

-- RN-BORDA-003: compatível com o tamanho => elegível por padrão. Esta tabela
-- guarda a EXCEÇÃO, não a permissão. size_id nulo exclui em todos os tamanhos.
create table public.product_crust_exclusions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  crust_id uuid not null references public.crusts (id) on delete restrict,
  size_id uuid references public.pizza_sizes (id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),

  constraint product_crust_exclusions_unica
    unique nulls not distinct (product_id, crust_id, size_id)
);

comment on table public.product_crust_exclusions is 'Exceções à regra padrão de borda (RN-BORDA-003). size_id nulo = exclui em todos os tamanhos.';

-- ----------------------------------------------------------- adicionais
create table public.addons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  is_temporarily_available boolean not null default true,
  temporary_unavailable_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint addons_nome check (length(btrim(name)) > 0)
);

-- RN-ADD-003: seleção única por tipo — um adicional entra ou não entra, nunca
-- "3 unidades do mesmo". Por isso não existe coluna de quantidade em lugar
-- algum deste módulo.
comment on table public.addons is 'Adicionais. RN-ADD-001: podem ser desligados globalmente por store_settings.addons_enabled.';

create trigger addons_updated_at before update on public.addons
  for each row execute function public.tg_set_updated_at();

create table public.addon_size_prices (
  id uuid primary key default gen_random_uuid(),
  addon_id uuid not null references public.addons (id) on delete restrict,
  size_id uuid not null references public.pizza_sizes (id) on delete restrict,
  price numeric(12, 2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint addon_size_prices_unica unique (addon_id, size_id),
  constraint addon_size_prices_preco check (price >= 0)
);

create trigger addon_size_prices_updated_at before update on public.addon_size_prices
  for each row execute function public.tg_set_updated_at();

-- 02 §5.10: compatibilidade por produto. Diferente das bordas, aqui a regra
-- é explícita nos dois sentidos — is_allowed permite registrar tanto a
-- liberação quanto a proibição para um produto específico.
create table public.product_addon_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  addon_id uuid not null references public.addons (id) on delete restrict,
  size_id uuid references public.pizza_sizes (id) on delete restrict,
  is_allowed boolean not null,
  created_at timestamptz not null default now(),

  constraint product_addon_rules_unica
    unique nulls not distinct (product_id, addon_id, size_id)
);

comment on table public.product_addon_rules is 'Compatibilidade adicional × produto (RN-ADD-002). size_id nulo = vale para todos os tamanhos.';
