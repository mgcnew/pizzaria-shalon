-- 0012 — Configuração de pagamentos
-- 02-MODELO-DADOS-SUPABASE.md §10.1 a §10.3 · RN-PGTO-001, 006, 008
-- 01-DOCUMENTO-MESTRE.md §79.12 · 05-PLANO-IMPLEMENTACAO.md §7.1
--
-- Apenas CONFIGURAÇÃO. Pagamento de pedido, intenção, troco e confirmação de
-- Pix são das fases 5 e 7 e não existem aqui.

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  -- Família define o COMPORTAMENTO; o nome exibido é livre e configurável.
  -- Pix na maquininha e Pix por chave são famílias distintas (79.12).
  payment_family text not null,
  is_active boolean not null default true,
  available_for_delivery boolean not null default true,
  available_for_pickup boolean not null default true,
  requires_brand boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_methods_familia check (
    payment_family in ('cash', 'pix_machine', 'pix_key', 'debit', 'credit', 'voucher', 'other')
  ),
  constraint payment_methods_code check (code ~ '^[a-z][a-z0-9_]*$')
);

comment on table public.payment_methods is 'Formas de pagamento aceitas. RN-PGTO-001: o checkout lê daqui, nunca de lista fixa.';
comment on column public.payment_methods.requires_brand is 'RN-PGTO-006: débito, crédito e voucher exigem bandeira ativa.';

create trigger payment_methods_updated_at before update on public.payment_methods
  for each row execute function public.tg_set_updated_at();

-- RN-PGTO-006: bandeiras são DADOS, não enum no código.
create table public.payment_brands (
  id uuid primary key default gen_random_uuid(),
  payment_method_id uuid not null references public.payment_methods (id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_brands_nome_por_forma unique (payment_method_id, name)
);

comment on table public.payment_brands is 'Bandeiras/opções por forma de pagamento (02 §10.2).';

create trigger payment_brands_updated_at before update on public.payment_brands
  for each row execute function public.tg_set_updated_at();

-- ------------------------------------------------------------- Pix chave
-- Tabela sensível: guarda a chave Pix da Shalon. Não há policy para anon
-- nesta fase; a projeção que o checkout precisa é da Fase 5.
create table public.pix_key_settings (
  id uuid primary key default gen_random_uuid(),
  is_enabled boolean not null default false,
  key_type text,
  pix_key text,
  recipient_name text,
  instructions text,
  updated_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pix_key_settings_tipo check (
    key_type is null or key_type in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')
  ),
  -- 02 §23: "pix_key só é exposta quando Pix por chave estiver habilitado".
  -- Habilitar sem chave e sem beneficiário é estado inválido, não detalhe de UI.
  constraint pix_key_settings_habilitado_exige_dados check (
    not is_enabled
    or (key_type is not null
        and pix_key is not null and length(btrim(pix_key)) > 0
        and recipient_name is not null and length(btrim(recipient_name)) > 0)
  )
);

create unique index pix_key_settings_singleton on public.pix_key_settings ((true));

comment on table public.pix_key_settings is 'Chave Pix da Shalon. RN-PGTO-008: a opção só existe para o cliente quando habilitada e completa.';

create trigger pix_key_settings_updated_at before update on public.pix_key_settings
  for each row execute function public.tg_set_updated_at();
