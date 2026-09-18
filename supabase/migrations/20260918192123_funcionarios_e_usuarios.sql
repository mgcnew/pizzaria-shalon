-- 0002 — Funcionários e usuários internos
-- 02-MODELO-DADOS-SUPABASE.md §4.1 e §4.2
-- Princípio 7: funcionário e usuário autenticado são conceitos DIFERENTES.
-- Um motoboy pode existir como funcionário sem nunca ter login.
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  employee_type text not null default 'other',
  is_driver boolean not null default false,
  employment_status text not null default 'active',
  started_at date,
  ended_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_full_name_nao_vazio check (length(btrim(full_name)) > 0),
  constraint employees_tipo_valido check (employee_type in ('owner', 'counter', 'driver', 'other')),
  constraint employees_situacao_valida check (employment_status in ('active', 'inactive')),
  -- RN-FUNC-001: desligamento é data, não exclusão física.
  constraint employees_periodo_coerente check (ended_at is null or started_at is null or ended_at >= started_at),
  constraint employees_inativo_tem_data check (employment_status = 'active' or ended_at is not null)
);

comment on table public.employees is 'Pessoa vinculada operacionalmente a pizzaria, com ou sem login. Nunca excluida fisicamente quando houver historico (RN-FUNC-001).';

create index employees_situacao_idx on public.employees (employment_status);
create index employees_motoboy_idx on public.employees (is_driver) where is_driver;

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.tg_set_updated_at();

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete restrict,
  employee_id uuid not null unique references public.employees (id) on delete restrict,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_users is 'Ponte entre Supabase Auth (equipe interna) e o funcionario. Cliente publico NUNCA tem app_user (03-RLS-RBAC-SEGURANCA.md 2.1).';

create index app_users_auth_idx on public.app_users (auth_user_id);
create index app_users_employee_idx on public.app_users (employee_id);
create index app_users_ativos_idx on public.app_users (is_active) where is_active;

create trigger app_users_set_updated_at
  before update on public.app_users
  for each row execute function public.tg_set_updated_at();
