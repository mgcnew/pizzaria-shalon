-- 0016 — Combos fixos
-- 02-MODELO-DADOS-SUPABASE.md §5.11 · RN-COMBO-001 a RN-COMBO-008
-- 01-DOCUMENTO-MESTRE.md §79.5 · D-2026-09-17-03
--
-- V1 = COMBO FIXO. O cliente não substitui componente, não escolhe entre
-- opções e não transforma a pizza do combo em meio a meio. Por isso NÃO
-- existe tabela de grupos de escolha: a estrutura não permite o que a regra
-- proíbe, em vez de depender da interface para impedir.

create table public.combo_components (
  id uuid primary key default gen_random_uuid(),
  combo_product_id uuid not null references public.products (id) on delete restrict,
  component_product_id uuid not null references public.products (id) on delete restrict,
  component_variant_id uuid references public.product_variants (id) on delete restrict,
  quantity integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint combo_components_quantidade check (quantity > 0),
  constraint combo_components_nao_recursivo check (combo_product_id <> component_product_id),
  constraint combo_components_unico
    unique nulls not distinct (combo_product_id, component_product_id, component_variant_id)
);

comment on table public.combo_components is 'Composição exata do combo (RN-COMBO-002). Sem grupos de escolha na V1.';

create trigger combo_components_updated_at before update on public.combo_components
  for each row execute function public.tg_set_updated_at();

-- As invariantes abaixo dependem de outras tabelas: CHECK não alcança, e
-- deixá-las só na aplicação seria confiar no frontend (CLAUDE.md §16).
create or replace function public.tg_combo_componente_valido()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_tipo_combo text;
  v_tipo_componente text;
  v_variant_product uuid;
begin
  select p.product_type into v_tipo_combo
    from public.products p where p.id = new.combo_product_id;
  if v_tipo_combo is distinct from 'combo' then
    raise exception 'combo_product_id deve apontar para um produto do tipo combo'
      using errcode = '23514';
  end if;

  select p.product_type into v_tipo_componente
    from public.products p where p.id = new.component_product_id;

  -- Combo dentro de combo criaria disponibilidade e preço em cascata, que a
  -- V1 não modela (79.5).
  if v_tipo_componente = 'combo' then
    raise exception 'Combo nao pode conter outro combo na V1 (RN-COMBO-001)'
      using errcode = '23514';
  end if;

  if new.component_variant_id is not null then
    select pv.product_id into v_variant_product
      from public.product_variants pv where pv.id = new.component_variant_id;
    if v_variant_product is distinct from new.component_product_id then
      raise exception 'A variacao informada nao pertence ao produto componente'
        using errcode = '23514';
    end if;
  elsif v_tipo_componente = 'pizza' then
    -- RN-COMBO-003: a pizza do combo é EXATA. Sem variação definida, o
    -- tamanho ficaria em aberto e o cliente poderia escolher — proibido.
    raise exception 'Pizza em combo exige variacao (tamanho) exata (RN-COMBO-003)'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger combo_components_valido
  before insert or update on public.combo_components
  for each row execute function public.tg_combo_componente_valido();
