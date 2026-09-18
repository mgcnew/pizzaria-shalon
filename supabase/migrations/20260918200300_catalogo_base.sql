-- 0014 — Catálogo: categorias, tamanhos, produtos e variações
-- 02-MODELO-DADOS-SUPABASE.md §5.1 a §5.4
-- 04-REGRAS-NEGOCIO.md RN-CAT-001/002, RN-PROD-001/002/003,
--                      RN-PIZZA-001 a RN-PIZZA-003, RN-DISP-001 a RN-DISP-005
-- 01-DOCUMENTO-MESTRE.md §79.3 · D-2026-09-17-04
--
-- MODELO APROVADO, sem desvio:
--   · cada SABOR comercial de pizza é um PRODUTO — não existe tabela `flavors`;
--   · Tradicional e Brotinho são TAMANHOS reutilizáveis — não são categorias;
--   · cada pizza escolhe quais tamanhos oferece e o preço de cada combinação.

-- ---------------------------------------------------------- categorias
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  -- RN-DISP-001: ativo/inativo é CADASTRO; disponível é OPERAÇÃO.
  -- São duas colunas porque são dois estados distintos, não um só.
  is_active boolean not null default true,
  is_temporarily_available boolean not null default true,
  temporary_unavailable_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categories_slug check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint categories_nome check (length(btrim(name)) > 0)
);

comment on table public.categories is 'Categorias do cardápio. São dados, não enum (02 §5.1).';
comment on column public.categories.is_temporarily_available is 'RN-DISP-004: pausa operacional. Falso indisponibiliza os produtos da categoria SEM inativar cadastro.';
comment on column public.categories.temporary_unavailable_note is 'Motivo interno. O cliente vê apenas "Indisponível hoje" (79.25).';

create trigger categories_updated_at before update on public.categories
  for each row execute function public.tg_set_updated_at();

-- ------------------------------------------------------------ tamanhos
create table public.pizza_sizes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slice_count integer not null,
  -- RN-PIZZA-004: o TAMANHO decide se meio a meio existe. max_flavors = 1
  -- significa que a interface não oferece meio a meio naquele tamanho.
  max_flavors integer not null default 1,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pizza_sizes_fatias check (slice_count > 0),
  constraint pizza_sizes_sabores check (max_flavors >= 1),
  constraint pizza_sizes_nome check (length(btrim(name)) > 0)
);

comment on table public.pizza_sizes is 'Tamanhos reutilizáveis (RN-PIZZA-002). Tradicional e Brotinho são linhas aqui, não categorias.';

create trigger pizza_sizes_updated_at before update on public.pizza_sizes
  for each row execute function public.tg_set_updated_at();

-- ------------------------------------------------------------ produtos
create table public.products (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT, não CASCADE: RN-DISP-005 e §29 — registro usado em histórico
  -- não some porque alguém apagou a categoria.
  category_id uuid not null references public.categories (id) on delete restrict,
  product_type text not null,
  name text not null,
  slug text not null unique,
  short_description text,
  base_price numeric(12, 2),
  is_active boolean not null default true,
  is_temporarily_available boolean not null default true,
  temporary_unavailable_note text,
  -- RN-DEST-001: destaque manual, INDEPENDENTE de "Mais pedidos".
  is_featured boolean not null default false,
  max_quantity_per_order integer,
  -- RN-ADD-004: limite de adicionais por produto; nulo = sem limite.
  max_addons integer,
  sort_order integer not null default 0,
  image_asset_id uuid references public.media_assets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint products_tipo check (
    product_type in ('pizza', 'fogazza', 'drink', 'combo', 'other')
  ),
  constraint products_slug check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint products_nome check (length(btrim(name)) > 0),
  constraint products_preco check (base_price is null or base_price >= 0),
  constraint products_limite check (max_quantity_per_order is null or max_quantity_per_order > 0),
  constraint products_limite_adicionais check (max_addons is null or max_addons >= 0),
  -- RN-COMBO-006: o preço do combo é PRÓPRIO, nunca a soma dos componentes.
  -- Sem preço próprio o combo não é vendável, então é estado inválido.
  constraint products_combo_tem_preco check (
    product_type <> 'combo' or base_price is not null
  )
);

comment on table public.products is 'Produtos do cardápio. Cada sabor de pizza é uma linha aqui (RN-PIZZA-001).';
comment on column public.products.base_price is 'Preço de produto simples e de combo. Pizza com tamanho usa product_variants.price como autoridade (02 §5.2).';
comment on column public.products.is_featured is 'RN-DEST-001: escolha manual da Shalon, independente do ranking de vendas.';

create trigger products_updated_at before update on public.products
  for each row execute function public.tg_set_updated_at();

-- -------------------------------------------------- variações produto×tamanho
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  size_id uuid not null references public.pizza_sizes (id) on delete restrict,
  price numeric(12, 2) not null,
  is_active boolean not null default true,
  is_temporarily_available boolean not null default true,
  temporary_unavailable_note text,
  sku text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_variants_unica unique (product_id, size_id),
  constraint product_variants_preco check (price >= 0)
);

comment on table public.product_variants is 'Oferta comercial produto × tamanho (RN-PIZZA-003). Nem toda pizza existe em todo tamanho.';

create trigger product_variants_updated_at before update on public.product_variants
  for each row execute function public.tg_set_updated_at();

-- 79.5 e RN-COMBO-006: combo tem preço próprio e composição exata; dar-lhe
-- variação por tamanho criaria uma segunda autoridade de preço.
create or replace function public.tg_variante_produto_compativel()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_tipo text;
begin
  select p.product_type into v_tipo from public.products p where p.id = new.product_id;
  if v_tipo = 'combo' then
    raise exception 'Combo nao usa variacao por tamanho: o preco do combo e proprio (RN-COMBO-006)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger product_variants_tipo_compativel
  before insert or update of product_id on public.product_variants
  for each row execute function public.tg_variante_produto_compativel();
