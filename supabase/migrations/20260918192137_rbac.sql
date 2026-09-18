-- 0003 — RBAC: papéis, permissões e vínculos
-- 02-MODELO-DADOS-SUPABASE.md §4.3 a §4.6 · 03-RLS-RBAC-SEGURANCA.md §3
-- REGRA CENTRAL: o NOME do cargo nunca concede autorização (CLAUDE.md §14,
-- RN-RBAC-004). roles.name é rótulo; nenhuma policy o compara com texto.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_name_nao_vazio check (length(btrim(name)) > 0)
);

comment on table public.roles is 'Papeis atribuiveis. is_system marca os papeis base da V1. O nome e rotulo, nunca mecanismo de autorizacao.';

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function public.tg_set_updated_at();

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  module text not null,
  action text not null,
  description text not null,
  created_at timestamptz not null default now(),
  -- Formato <dominio>.<acao> exigido em 03-RLS-RBAC-SEGURANCA.md §3.2
  constraint permissions_code_formato check (code ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$')
);

comment on table public.permissions is 'Catalogo de permissoes semanticas. Representa capacidade de negocio, nao nome de tela.';

create index permissions_module_idx on public.permissions (module);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete restrict,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.app_users (id) on delete set null,
  primary key (role_id, permission_id)
);

comment on table public.role_permissions is 'Quais permissoes cada papel concede. Alteracoes sao auditadas.';

create index role_permissions_permission_idx on public.role_permissions (permission_id);

create table public.user_roles (
  app_user_id uuid not null references public.app_users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  assigned_by uuid references public.app_users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (app_user_id, role_id)
);

comment on table public.user_roles is 'Atribuicao de papeis. A arquitetura permite mais de um papel por usuario.';

create index user_roles_role_idx on public.user_roles (role_id);
