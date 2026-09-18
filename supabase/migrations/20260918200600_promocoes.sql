-- 0017 — Promoções
-- 02-MODELO-DADOS-SUPABASE.md §6.1 · RN-PROMO-001 a RN-PROMO-007
-- 01-DOCUMENTO-MESTRE.md §79.6 · CLAUDE.md §19
--
-- V1 = PREÇO PROMOCIONAL SIMPLES. Sem cupom, sem buy-X-get-Y, sem cashback,
-- sem motor de descontos (CLAUDE.md §19). O alvo é uma variação ou um
-- produto de preço próprio (combo, bebida, fogazza).

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_type text not null,
  product_id uuid references public.products (id) on delete restrict,
  variant_id uuid references public.product_variants (id) on delete restrict,
  promotional_price numeric(12, 2) not null,
  starts_at timestamptz not null,
  -- Nulo = vale até desativação manual (RN-PROMO-002).
  ends_at timestamptz,
  is_active boolean not null default true,
  -- RN-PROMO-006: limite promocional é independente do limite normal do
  -- produto; quando ambos existem, prevalece o mais restritivo.
  max_quantity_per_order integer,
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint promotions_tipo check (target_type in ('product', 'variant')),
  constraint promotions_nome check (length(btrim(name)) > 0),
  constraint promotions_preco check (promotional_price >= 0),
  constraint promotions_periodo check (ends_at is null or ends_at > starts_at),
  constraint promotions_limite check (max_quantity_per_order is null or max_quantity_per_order > 0),
  -- Exatamente um alvo, coerente com target_type (02 §6.1).
  constraint promotions_alvo_unico check (
    (target_type = 'product' and product_id is not null and variant_id is null)
    or (target_type = 'variant' and variant_id is not null and product_id is null)
  )
);

-- RN-PROMO-004: períodos promocionais sobrepostos para o MESMO alvo são
-- proibidos. Isto é constraint de banco porque duas telas abertas ao mesmo
-- tempo passariam por qualquer validação feita só na aplicação.
-- ends_at nulo vira limite superior infinito no intervalo.
alter table public.promotions
  add constraint promotions_sem_sobreposicao_produto
  exclude using gist (
    product_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (is_active and product_id is not null);

alter table public.promotions
  add constraint promotions_sem_sobreposicao_variacao
  exclude using gist (
    variant_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (is_active and variant_id is not null);

comment on table public.promotions is 'Preço promocional simples com período (RN-PROMO-001/002).';
comment on constraint promotions_sem_sobreposicao_variacao on public.promotions is 'RN-PROMO-004: sem períodos conflitantes para o mesmo alvo.';

create trigger promotions_updated_at before update on public.promotions
  for each row execute function public.tg_set_updated_at();

-- Promoção com alvo `product` só faz sentido em produto cujo preço É o
-- base_price. Se o produto tem variações, a autoridade de preço é a variação
-- (02 §5.2) e o alvo correto seria `variant` — deixar passar criaria uma
-- promoção que não se aplica a preço nenhum.
create or replace function public.tg_promocao_alvo_coerente()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_base numeric;
  v_variacoes integer;
begin
  if new.target_type = 'product' then
    select p.base_price into v_base from public.products p where p.id = new.product_id;
    select count(*) into v_variacoes
      from public.product_variants pv where pv.product_id = new.product_id;

    if v_variacoes > 0 then
      raise exception 'Produto com variacao recebe promocao por variacao, nao por produto (RN-PROMO-003)'
        using errcode = '23514';
    end if;
    if v_base is null then
      raise exception 'Promocao por produto exige produto com preco proprio (base_price)'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger promotions_alvo_coerente
  before insert or update on public.promotions
  for each row execute function public.tg_promocao_alvo_coerente();
