-- 0018 — Banners
-- 02-MODELO-DADOS-SUPABASE.md §6.2 · RN-BANNER-001 a RN-BANNER-004
-- 01-DOCUMENTO-MESTRE.md §79.7

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text,
  image_asset_id uuid not null references public.media_assets (id) on delete restrict,
  destination_type text not null default 'none',
  destination_product_id uuid references public.products (id) on delete restrict,
  destination_category_id uuid references public.categories (id) on delete restrict,
  destination_promotion_id uuid references public.promotions (id) on delete restrict,
  external_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint banners_destino_tipo check (
    destination_type in ('product', 'category', 'promotion', 'external', 'none')
  ),
  constraint banners_periodo check (
    starts_at is null or ends_at is null or ends_at > starts_at
  ),
  -- RN-BANNER-002: destino interno REFERENCIA entidade. Não existe campo para
  -- digitar uma URL interna à mão, e a coerência é estrutural.
  constraint banners_destino_coerente check (
    case destination_type
      when 'product' then destination_product_id is not null
        and destination_category_id is null and destination_promotion_id is null and external_url is null
      when 'category' then destination_category_id is not null
        and destination_product_id is null and destination_promotion_id is null and external_url is null
      when 'promotion' then destination_promotion_id is not null
        and destination_product_id is null and destination_category_id is null and external_url is null
      when 'external' then external_url is not null
        and destination_product_id is null and destination_category_id is null and destination_promotion_id is null
      else destination_product_id is null and destination_category_id is null
        and destination_promotion_id is null and external_url is null
    end
  ),
  constraint banners_url_externa check (
    external_url is null or external_url ~ '^https?://[^\s]+$'
  )
);

comment on table public.banners is 'Banners administráveis. Visibilidade final também depende do destino (RN-BANNER-003/004) e é derivada, nunca gravada.';

create trigger banners_updated_at before update on public.banners
  for each row execute function public.tg_set_updated_at();
