-- 0011 — Configurações da loja
-- 02-MODELO-DADOS-SUPABASE.md §3 · 04-REGRAS-NEGOCIO.md RN-LOJA-001 a RN-LOJA-005
-- 01-DOCUMENTO-MESTRE.md §79.1 e §79.2 · 05-PLANO-IMPLEMENTACAO.md §7.1
--
-- Regra operacional NUNCA fica no frontend: horário, pedido mínimo, raio de
-- aprovação automática, faixas de taxa e limites de alerta são dados.

-- btree_gist permite combinar igualdade (uuid) com sobreposição de intervalo
-- na mesma constraint EXCLUDE. Usado aqui e nas promoções.
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------- loja
create table public.store_settings (
  id uuid primary key default gen_random_uuid(),

  store_name text not null,
  display_name text,
  whatsapp text not null,
  phone text,

  address_street text not null,
  address_number text not null,
  address_complement text,
  address_neighborhood text not null,
  address_city text not null,
  address_state text not null,
  address_postal_code text not null,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  -- Qual provedor geocodificou. A regra é agnóstica ao fornecedor
  -- (CLAUDE.md §20); isto é registro, não acoplamento.
  geocode_provider text,
  geocoded_at timestamptz,

  -- RN-LOJA-002: pausar o recebimento NÃO esconde o cardápio.
  is_temporarily_closed boolean not null default false,
  temporary_close_reason text,
  temporary_closed_at timestamptz,
  temporary_closed_by uuid references public.app_users (id) on delete set null,

  -- RN-LOJA-005: mínimo vale só para entrega, sobre o subtotal de produtos.
  delivery_minimum_enabled boolean not null default false,
  delivery_minimum_subtotal numeric(12, 2),

  -- 79.2: raio de aprovação automática. A distância MÁXIMA atendida não é
  -- campo: deriva da maior faixa ativa, para não existirem duas verdades.
  automatic_delivery_radius_km numeric(8, 3) not null default 0,

  -- RN-LOJA-004: entrega e retirada têm estimativas independentes.
  delivery_eta_min_minutes integer not null,
  delivery_eta_max_minutes integer not null,
  pickup_eta_min_minutes integer not null,
  pickup_eta_max_minutes integer not null,
  current_delivery_eta_min_minutes integer,
  current_delivery_eta_max_minutes integer,
  current_pickup_eta_min_minutes integer,
  current_pickup_eta_max_minutes integer,
  eta_override_updated_at timestamptz,
  eta_override_updated_by uuid references public.app_users (id) on delete set null,

  -- RN-ADD-001: adicionais podem ser desligados globalmente.
  addons_enabled boolean not null default true,

  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint store_settings_minimo_coerente check (
    not delivery_minimum_enabled
    or (delivery_minimum_subtotal is not null and delivery_minimum_subtotal >= 0)
  ),
  constraint store_settings_raio_nao_negativo check (automatic_delivery_radius_km >= 0),
  constraint store_settings_eta_entrega check (
    delivery_eta_min_minutes > 0 and delivery_eta_max_minutes >= delivery_eta_min_minutes
  ),
  constraint store_settings_eta_retirada check (
    pickup_eta_min_minutes > 0 and pickup_eta_max_minutes >= pickup_eta_min_minutes
  ),
  constraint store_settings_override_entrega check (
    (current_delivery_eta_min_minutes is null) = (current_delivery_eta_max_minutes is null)
    and (
      current_delivery_eta_min_minutes is null
      or (current_delivery_eta_min_minutes > 0
          and current_delivery_eta_max_minutes >= current_delivery_eta_min_minutes)
    )
  ),
  constraint store_settings_override_retirada check (
    (current_pickup_eta_min_minutes is null) = (current_pickup_eta_max_minutes is null)
    and (
      current_pickup_eta_min_minutes is null
      or (current_pickup_eta_min_minutes > 0
          and current_pickup_eta_max_minutes >= current_pickup_eta_min_minutes)
    )
  ),
  constraint store_settings_coordenadas_em_par check (
    (latitude is null) = (longitude is null)
  ),
  -- Fechamento temporário sem motivo é ruído operacional; com motivo, o
  -- atendimento sabe o que responder ao cliente.
  constraint store_settings_fechamento_coerente check (
    not is_temporarily_closed
    or (temporary_close_reason is not null and temporary_closed_at is not null)
  )
);

-- 79.1: a V1 é de UMA unidade. O singleton é estrutural, não convenção.
create unique index store_settings_singleton on public.store_settings ((true));

comment on table public.store_settings is 'Configuração única da loja (V1 single-store, CLAUDE.md §9).';
comment on column public.store_settings.automatic_delivery_radius_km is 'Raio de aprovação automática. A distância máxima atendida deriva de delivery_fee_bands.';

create trigger store_settings_updated_at before update on public.store_settings
  for each row execute function public.tg_set_updated_at();

-- ------------------------------------------------------------ horários
create table public.store_hours (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null,
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint store_hours_weekday check (weekday between 0 and 6),
  -- Dia aberto exige janela; dia fechado não guarda janela solta.
  constraint store_hours_janela check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null)
  ),
  constraint store_hours_um_por_dia unique (weekday)
);

-- 02 §3.2: a janela PODE atravessar a meia-noite. closes_at < opens_at é
-- válido e significa "fecha no dia seguinte" — nenhuma constraint proíbe.
comment on table public.store_hours is 'Horário semanal. closes_at < opens_at significa virada de meia-noite (02 §3.2).';
comment on column public.store_hours.weekday is '0 = domingo … 6 = sábado.';

create trigger store_hours_updated_at before update on public.store_hours
  for each row execute function public.tg_set_updated_at();

-- ------------------------------------------------ faixas de distância
-- Substitui a taxa por bairro do protótipo (D-2026-09-17-02, 79.2).
create table public.delivery_fee_bands (
  id uuid primary key default gen_random_uuid(),
  min_distance_km numeric(8, 3) not null,
  max_distance_km numeric(8, 3) not null,
  fee numeric(12, 2) not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint delivery_fee_bands_min check (min_distance_km >= 0),
  constraint delivery_fee_bands_ordem check (max_distance_km > min_distance_km),
  constraint delivery_fee_bands_taxa check (fee >= 0)
);

-- 02 §3.3: faixas ativas não podem se sobrepor. Isto é constraint, não
-- validação de tela: a UI pode ser contornada, a constraint não.
-- Fronteira adotada: (min, max]. A faixa que começa em 0 também cobre 0.
alter table public.delivery_fee_bands
  add constraint delivery_fee_bands_sem_sobreposicao
  exclude using gist (
    numrange(min_distance_km, max_distance_km, '(]') with &&
  ) where (is_active);

comment on table public.delivery_fee_bands is 'Faixas de distância de rota e taxa. Fronteira (min, max]; a faixa iniciada em 0 cobre 0.';

create trigger delivery_fee_bands_updated_at before update on public.delivery_fee_bands
  for each row execute function public.tg_set_updated_at();

-- ------------------------------------------------- limites de alerta
create table public.alert_thresholds (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique,
  threshold_minutes integer not null,
  is_active boolean not null default true,
  updated_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint alert_thresholds_minutos check (threshold_minutes > 0),
  constraint alert_thresholds_chave check (alert_key ~ '^[a-z][a-z0-9_]*$')
);

comment on table public.alert_thresholds is 'Limites operacionais de alerta sem hardcode (02 §3.4).';

create trigger alert_thresholds_updated_at before update on public.alert_thresholds
  for each row execute function public.tg_set_updated_at();
