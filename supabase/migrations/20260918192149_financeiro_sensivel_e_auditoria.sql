-- 0004 — Dados financeiros sensíveis de funcionário e auditoria
-- 02-MODELO-DADOS-SUPABASE.md §4.7 e §17.1 · 03-RLS-RBAC-SEGURANCA.md §18 e §22
--
-- SEPARAÇÃO FÍSICA por sensibilidade (§18.1): o salário NÃO fica em
-- `employees`. Quem lê dados operacionais do funcionário não lê salário por
-- estar na mesma linha — a fronteira é a tabela, reforçada por policy própria.
create table public.employee_financial_profiles (
  employee_id uuid primary key references public.employees (id) on delete restrict,
  salary_reference numeric(12,2),
  notes text,
  updated_by uuid references public.app_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint employee_financial_salario_nao_negativo check (salary_reference is null or salary_reference >= 0)
);

comment on table public.employee_financial_profiles is 'Salario de referencia e notas financeiras. NAO e folha de pagamento (RN-EMPFIN-002). Exige employees.finance.view, que o Atendente nao possui por padrao.';

create trigger employee_financial_set_updated_at
  before update on public.employee_financial_profiles
  for each row execute function public.tg_set_updated_at();

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users (id) on delete set null,
  actor_employee_id uuid references public.employees (id) on delete set null,
  actor_type text not null default 'user',
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_actor_type_valido check (actor_type in ('user', 'system', 'customer')),
  constraint audit_logs_action_nao_vazio check (length(btrim(action)) > 0)
);

comment on table public.audit_logs is 'Registro append-only de acoes sensiveis. Usuario comum nao pode atualizar nem apagar (RN-AUD-004).';

create index audit_logs_entidade_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_ator_idx on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_criado_idx on public.audit_logs (created_at desc);
