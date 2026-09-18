-- 0008 — Gatilhos de auditoria
-- 03-RLS-RBAC-SEGURANCA.md §22.2 · RN-AUD-001 e RN-AUD-003
--
-- A auditoria é gravada no BANCO, por trigger, não pela aplicação: assim não
-- depende de o código lembrar de chamá-la e nenhum caminho de escrita escapa.
create or replace function public.tg_audit_generico()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_entity_id uuid; v_before jsonb; v_after jsonb;
begin
  if (tg_op = 'DELETE') then
    v_before := to_jsonb(old); v_after := null;
  elsif (tg_op = 'INSERT') then
    v_before := null; v_after := to_jsonb(new);
  else
    v_before := to_jsonb(old); v_after := to_jsonb(new);
    -- Update que não mudou nada não vira ruído de auditoria.
    if v_before = v_after then return new; end if;
  end if;

  begin
    v_entity_id := (coalesce(v_after, v_before) ->> tg_argv[0])::uuid;
  exception when others then
    v_entity_id := null;
  end;

  perform public.log_audit(
    lower(tg_op) || '_' || tg_table_name, tg_table_name, v_entity_id, v_before, v_after
  );

  if (tg_op = 'DELETE') then return old; end if;
  return new;
end;
$$;

comment on function public.tg_audit_generico is 'Trigger de auditoria. Argumento: nome da coluna identificadora da entidade.';

create trigger roles_audit after insert or update or delete on public.roles
  for each row execute function public.tg_audit_generico('id');
create trigger role_permissions_audit after insert or delete on public.role_permissions
  for each row execute function public.tg_audit_generico('role_id');
create trigger user_roles_audit after insert or delete on public.user_roles
  for each row execute function public.tg_audit_generico('app_user_id');
create trigger app_users_audit after insert or update on public.app_users
  for each row execute function public.tg_audit_generico('id');
create trigger employees_audit after insert or update on public.employees
  for each row execute function public.tg_audit_generico('id');
-- Toda leitura é permissionada; toda ESCRITA fica registrada.
create trigger employee_financial_audit after insert or update on public.employee_financial_profiles
  for each row execute function public.tg_audit_generico('employee_id');

-- Segunda barreira do append-only: bloqueia UPDATE/DELETE mesmo que alguém
-- contorne a policy (por exemplo, com uma conexão privilegiada).
create or replace function public.tg_audit_imutavel()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  raise exception 'audit_logs e append-only: % nao e permitido (RN-AUD-004)', tg_op
    using errcode = '42501';
end;
$$;

create trigger audit_logs_sem_update before update on public.audit_logs
  for each row execute function public.tg_audit_imutavel();
create trigger audit_logs_sem_delete before delete on public.audit_logs
  for each row execute function public.tg_audit_imutavel();
