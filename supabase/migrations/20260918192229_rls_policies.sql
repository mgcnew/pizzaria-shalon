-- 0006 — RLS: deny by default + aberturas explícitas
-- 03-RLS-RBAC-SEGURANCA.md §5 e §33 · CLAUDE.md §12
--
-- Nenhuma tabela fica aberta "para proteger depois". Como não existe policy
-- para o papel `anon` em nenhuma tabela, o público anônimo não lê nem escreve
-- absolutamente nada aqui.
alter table public.employees enable row level security;
alter table public.app_users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.employee_financial_profiles enable row level security;
alter table public.audit_logs enable row level security;

-- FORCE: nem o dono da tabela escapa das policies.
alter table public.employees force row level security;
alter table public.app_users force row level security;
alter table public.roles force row level security;
alter table public.permissions force row level security;
alter table public.role_permissions force row level security;
alter table public.user_roles force row level security;
alter table public.employee_financial_profiles force row level security;
alter table public.audit_logs force row level security;

-- employees — §33.8. Sem DELETE: RN-FUNC-001 proíbe exclusão física.
create policy employees_select on public.employees for select to authenticated
  using (public.has_permission('employees.view') or id = public.current_employee_id());
create policy employees_insert on public.employees for insert to authenticated
  with check (public.has_permission('employees.manage'));
create policy employees_update on public.employees for update to authenticated
  using (public.has_permission('employees.manage'))
  with check (public.has_permission('employees.manage'));

-- app_users — sem DELETE: revogar acesso é is_active = false (§18.4).
create policy app_users_select on public.app_users for select to authenticated
  using (public.has_permission('employees.view') or id = public.current_app_user_id());
create policy app_users_insert on public.app_users for insert to authenticated
  with check (public.has_permission('employees.manage'));
create policy app_users_update on public.app_users for update to authenticated
  using (public.has_permission('employees.manage'))
  with check (public.has_permission('employees.manage'));

-- roles/permissions/vínculos — leitura para usuário interno ativo (a UI precisa
-- saber o que esconder); escrita exige roles.manage.
create policy roles_select on public.roles for select to authenticated
  using (public.is_internal_user());
create policy roles_insert on public.roles for insert to authenticated
  with check (public.has_permission('roles.manage'));
create policy roles_update on public.roles for update to authenticated
  using (public.has_permission('roles.manage'))
  with check (public.has_permission('roles.manage'));
create policy roles_delete on public.roles for delete to authenticated
  using (public.has_permission('roles.manage') and not is_system);

-- O catálogo de permissões é estrutural: muda por migration, nunca pela
-- aplicação. Por isso só existe policy de SELECT.
create policy permissions_select on public.permissions for select to authenticated
  using (public.is_internal_user());

create policy role_permissions_select on public.role_permissions for select to authenticated
  using (public.is_internal_user());
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (public.has_permission('roles.manage'));
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using (public.has_permission('roles.manage'));

create policy user_roles_select on public.user_roles for select to authenticated
  using (public.has_permission('employees.view') or app_user_id = public.current_app_user_id());
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check (public.has_permission('roles.manage'));
create policy user_roles_delete on public.user_roles for delete to authenticated
  using (public.has_permission('roles.manage'));

-- employee_financial_profiles — a fronteira mais sensível desta fase (§18.2).
-- NÃO há cláusula "ou é o próprio funcionário": ler o próprio salário também
-- exige a permissão. Nada vaza por caminho lateral. Sem DELETE.
create policy employee_financial_select on public.employee_financial_profiles for select to authenticated
  using (public.has_permission('employees.finance.view'));
create policy employee_financial_insert on public.employee_financial_profiles for insert to authenticated
  with check (public.has_permission('employees.finance.manage'));
create policy employee_financial_update on public.employee_financial_profiles for update to authenticated
  using (public.has_permission('employees.finance.manage'))
  with check (public.has_permission('employees.finance.manage'));

-- audit_logs — append-only (§22.3, RN-AUD-004). Só SELECT: a escrita acontece
-- exclusivamente por log_audit(), que é SECURITY DEFINER e não passa por RLS.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_permission('audit.view'));
