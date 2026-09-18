-- 0005 — Funções auxiliares de autorização | 03-RLS-RBAC-SEGURANCA.md §4
--
-- Regras obedecidas:
--  - identidade deriva SEMPRE de auth.uid(); nenhuma função aceita um user_id
--    vindo do cliente como prova de identidade;
--  - search_path = '' fixo e nomes totalmente qualificados;
--  - SECURITY DEFINER apenas onde necessário para evitar recursão de RLS;
--  - a checagem considera a situação ATUAL: usuário inativo ou funcionário
--    desligado perde acesso mesmo com JWT válido (§5.4).
create or replace function public.current_app_user_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select au.id from public.app_users au
  join public.employees e on e.id = au.employee_id
  where au.auth_user_id = (select auth.uid())
    and au.is_active and e.employment_status = 'active'
  limit 1;
$$;

create or replace function public.is_internal_user()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.current_app_user_id() is not null; $$;

create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select au.employee_id from public.app_users au
  join public.employees e on e.id = au.employee_id
  where au.auth_user_id = (select auth.uid())
    and au.is_active and e.employment_status = 'active'
  limit 1;
$$;

-- ÚNICA porta de autorização usada pelas policies.
create or replace function public.has_permission(permission_code text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users au
    join public.employees e on e.id = au.employee_id
    join public.user_roles ur on ur.app_user_id = au.id
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where au.auth_user_id = (select auth.uid())
      and au.is_active and e.employment_status = 'active'
      and r.is_active and p.code = permission_code
  );
$$;

-- Única via de escrita em audit_logs. SECURITY DEFINER: grava sem policy de
-- INSERT, que é o desejado — ninguém escreve auditoria "à mão" (§33.11).
create or replace function public.log_audit(
  p_action text, p_entity_type text, p_entity_id uuid default null,
  p_before jsonb default null, p_after jsonb default null,
  p_reason text default null, p_metadata jsonb default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_app_user_id uuid; v_employee_id uuid; v_id uuid;
begin
  v_app_user_id := public.current_app_user_id();
  select au.employee_id into v_employee_id from public.app_users au where au.id = v_app_user_id;
  insert into public.audit_logs (
    actor_user_id, actor_employee_id, actor_type,
    action, entity_type, entity_id, before_data, after_data, reason, metadata
  ) values (
    v_app_user_id, v_employee_id,
    case when v_app_user_id is null then 'system' else 'user' end,
    p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason, p_metadata
  ) returning id into v_id;
  return v_id;
end;
$$;

comment on function public.current_app_user_id is 'Id interno do usuario autenticado, ou NULL quando desativado/desligado.';
comment on function public.is_internal_user is 'Verdadeiro somente para usuario interno ativo.';
comment on function public.current_employee_id is 'Id do funcionario vinculado ao usuario autenticado, ou NULL.';
comment on function public.has_permission is 'Autorizacao por permissao semantica efetiva.';
comment on function public.log_audit is 'Registra evento de auditoria. Unica via de escrita em audit_logs.';

revoke execute on function public.log_audit(text, text, uuid, jsonb, jsonb, text, jsonb) from anon, authenticated;
revoke execute on function public.current_app_user_id() from anon;
revoke execute on function public.current_employee_id() from anon;
revoke execute on function public.is_internal_user() from anon;
revoke execute on function public.has_permission(text) from anon;
