-- 0037 — Clientes públicos, endereços e dispositivos
-- 02-MODELO-DADOS-SUPABASE.md §8 · 04-REGRAS-NEGOCIO.md RN-CLI-001 a RN-CLI-008
-- 03-RLS-RBAC-SEGURANCA.md §11 e §12 · 01-DOCUMENTO-MESTRE.md §79.10
--
-- O cliente público NÃO tem conta, senha nem Supabase Auth (RN-CLI-001).
-- O que existe é:
--   · um cadastro interno com id próprio (o WhatsApp é identificador
--     operacional, nunca chave primária nem credencial — RN-CLI-003);
--   · endereços reutilizáveis, SEM taxa nem distância guardadas;
--   · uma credencial de dispositivo, guardada como HASH, que no futuro
--     permite "Meus pedidos" sem login.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Só dígitos: é por este campo que se reconhece o mesmo cliente.
  whatsapp_normalized text not null,
  whatsapp_display text,
  -- RN-CLI-007: consentimento é separado da execução do pedido e nasce falso.
  marketing_consent boolean not null default false,
  marketing_consent_updated_at timestamptz,
  -- RN-CLI-008: bloqueio impede novos pedidos; o motivo é INTERNO.
  is_blocked boolean not null default false,
  blocked_reason_internal text,
  blocked_at timestamptz,
  blocked_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customers_nome check (length(btrim(name)) > 0),
  constraint customers_whatsapp check (whatsapp_normalized ~ '^[0-9]{10,15}$'),
  constraint customers_bloqueio_coerente check (
    not is_blocked or blocked_at is not null
  )
);

-- Duplicar cliente pelo mesmo número seria pior que impedir: o atendimento
-- perderia o histórico. Trocar de número continua permitido — o que a
-- unicidade impede é DOIS cadastros com o mesmo número (02 §8.1).
create unique index customers_whatsapp_unico on public.customers (whatsapp_normalized);

comment on table public.customers is 'Cliente público sem conta. WhatsApp é identificador operacional, não PK nem credencial (RN-CLI-003).';
comment on column public.customers.blocked_reason_internal is 'RN-CLI-008: motivo interno, nunca exposto ao cliente.';

create trigger customers_updated_at before update on public.customers
  for each row execute function public.tg_set_updated_at();

-- ------------------------------------------------------------- endereços
create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  label text,
  is_preferred boolean not null default false,

  street text not null,
  number text not null,
  -- RN-ENT-004: complemento e referência NÃO participam do cálculo
  -- geográfico. Ficam em colunas próprias justamente para que a consulta de
  -- geocodificação não os inclua por engano.
  complement text,
  neighborhood text not null,
  city text not null,
  state text not null,
  postal_code text,
  reference_point text,

  latitude numeric(10, 7),
  longitude numeric(10, 7),
  geocode_provider text,
  geocode_confidence text,
  was_map_adjusted boolean not null default false,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customer_addresses_coordenadas_em_par check (
    (latitude is null) = (longitude is null)
  ),
  constraint customer_addresses_confianca check (
    geocode_confidence is null
    or geocode_confidence in ('exata', 'aproximada', 'ambigua', 'ajustada_no_mapa')
  ),
  constraint customer_addresses_logradouro check (length(btrim(street)) > 0)
);

-- 02 §8.2: "Taxa/distância NÃO pertencem ao endereço salvo. Devem ser
-- recalculadas a cada novo pedido." Por isso não existe coluna de taxa nem
-- de distância aqui — a ausência é a regra (RN-ENT-008).
comment on table public.customer_addresses is 'Endereço reutilizável. NÃO guarda taxa nem distância: recalculadas a cada pedido (RN-ENT-008).';

-- RN-CLI-006: um preferido por cliente, no máximo.
create unique index customer_addresses_um_preferido
  on public.customer_addresses (customer_id) where is_preferred and is_active;

create index customer_addresses_do_cliente
  on public.customer_addresses (customer_id, is_active);

create trigger customer_addresses_updated_at before update on public.customer_addresses
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------- dispositivos
-- 03 §11: credencial local persistente do navegador. Imprevisível e tratada
-- COMO CREDENCIAL, não como id público adivinhável.
create table public.public_devices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  -- O navegador guarda o segredo; o banco guarda só o hash. Vazamento de
  -- banco não entrega acesso aos pedidos de ninguém.
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,

  constraint public_devices_hash check (token_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.public_devices is 'Credencial do navegador para "Meus pedidos" sem login. Guarda HASH, nunca o segredo (03 §11).';

create index public_devices_do_cliente on public.public_devices (customer_id);

-- ------------------------------------------------- utilidades de credencial
-- Um lugar só para gerar e conferir segredo, para que nenhum caminho invente
-- o seu próprio formato.
create or replace function public.gerar_token_publico()
returns text language sql volatile set search_path = ''
as $$
  -- 32 bytes de aleatoriedade criptográfica: imprevisível e não sequencial
  -- (03 §10.1). Conhecer o número do pedido não ajuda em nada.
  select encode(extensions.gen_random_bytes(32), 'hex');
$$;

create or replace function public.hash_token(p_token text)
returns text language sql immutable set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

comment on function public.gerar_token_publico is '03 §10.1: token criptograficamente imprevisível, não sequencial.';
comment on function public.hash_token is 'O banco guarda o hash; o segredo fica só com o cliente.';

revoke all on function public.gerar_token_publico() from public, anon, authenticated;
revoke all on function public.hash_token(text) from public, anon, authenticated;

-- Normalização do WhatsApp em um lugar só (RN-CLI-003).
create or replace function public.normalizar_whatsapp(p_bruto text)
returns text language sql immutable set search_path = ''
as $$
  select regexp_replace(coalesce(p_bruto, ''), '[^0-9]', '', 'g');
$$;

revoke all on function public.normalizar_whatsapp(text) from public;
grant execute on function public.normalizar_whatsapp(text) to anon, authenticated;
