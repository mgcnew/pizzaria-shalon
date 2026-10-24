-- 0172 — Presença do motoboy (veio / faltou), por dia
-- D-2026-10-24-165
--
-- O motoboy não tem login nem app (RN-MOTO-001), então "está trabalhando hoje"
-- é uma informação que a equipe do balcão registra. Modelo escolhido pela dona:
-- uma marca por funcionário por DIA DE TRABALHO — Veio ou Faltou; sem marca é
-- "não marcado". Guarda histórico (quantas faltas no mês), quem marcou e quando.
--
-- REGRAS
--  - O dia de trabalho vira às 5h da manhã, no fuso da loja: a pizzaria passa da
--    meia-noite, e quem foi marcado às 23h50 não pode aparecer "sem marca" às
--    00h30. Quem calcula o dia é o servidor (`dia_de_trabalho()`); a tela não
--    escolhe a data, então não há como marcar presença de outro dia.
--  - "Faltou" tira o motoboy da escolha de quem recebe pedido, e isso vale no
--    SERVIDOR (`atribuir_entrega` e `transferir_entrega` recusam), não só na
--    tela. Sem marca ou "Veio": continua escolhível — esquecer de marcar nunca
--    trava o balcão. Desfazer a marca ("Sem marcação") libera de novo.
--  - Permissão nova `employees.attendance`, para a Proprietária e o Atendente
--    (editável em Permissões, como as demais).
--  - Toda marcação e todo desfazer ficam em `audit_logs`.
--  - A tabela só se LÊ por quem pode ver a equipe (`employees.view`); escrever
--    só pela função `marcar_presenca`. Nenhuma policy de insert/update/delete.

-- 1. Tabela ---------------------------------------------------------------------
create table public.employee_attendance (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id),
  work_date   date not null,
  status      text not null check (status in ('present', 'absent')),
  marked_by   uuid references public.app_users (id),
  marked_at   timestamptz not null default now(),
  constraint employee_attendance_um_por_dia unique (employee_id, work_date)
);

create index employee_attendance_por_data on public.employee_attendance (work_date);

alter table public.employee_attendance enable row level security;

create policy employee_attendance_select on public.employee_attendance
  for select to authenticated
  using (public.has_permission('employees.view'));

revoke all on public.employee_attendance from anon, authenticated;
grant select on public.employee_attendance to authenticated;

comment on table public.employee_attendance is
  'Presença por dia de trabalho (0172). Sem linha = não marcado. Escrita só por marcar_presenca().';

-- 2. Permissão -------------------------------------------------------------------
insert into public.permissions (code, module, action, description)
values ('employees.attendance', 'employees', 'attendance', 'Marcar presença e falta dos funcionários')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r, public.permissions p
 where r.name in ('Owner/Admin', 'Atendente') and p.code = 'employees.attendance'
on conflict do nothing;

-- 3. O dia de trabalho -------------------------------------------------------------
create or replace function public.dia_de_trabalho()
returns date language sql stable security definer set search_path = ''
as $$
  select ((now() at time zone coalesce((select s.timezone from public.store_settings s limit 1),
                                       'America/Sao_Paulo')) - interval '5 hours')::date;
$$;

revoke all on function public.dia_de_trabalho() from public, anon;
grant execute on function public.dia_de_trabalho() to authenticated;

-- 4. Marcar presença ---------------------------------------------------------------
create or replace function public.marcar_presenca(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator   uuid := public.current_app_user_id();
  v_func   record;
  v_status text := nullif(btrim(coalesce(p_dados ->> 'status', '')), '');
  v_dia    date := public.dia_de_trabalho();
  v_antes  record;
  v_id     uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('employees.attendance') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para marcar presença.');
  end if;
  if v_status is not null and v_status not in ('present', 'absent') then
    return jsonb_build_object('ok', false, 'erro', 'Situação de presença inválida.');
  end if;

  select * into v_func from public.employees e
    where e.id = nullif(p_dados ->> 'funcionario_id', '')::uuid;
  if v_func.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Funcionário não encontrado.');
  end if;
  if v_func.employment_status <> 'active' then
    return jsonb_build_object('ok', false, 'erro',
      format('%s não está ativo.', v_func.full_name));
  end if;

  select * into v_antes from public.employee_attendance a
    where a.employee_id = v_func.id and a.work_date = v_dia for update;

  -- Sem situação: desfaz a marca do dia.
  if v_status is null then
    if v_antes.id is not null then
      delete from public.employee_attendance where id = v_antes.id;
      perform public.log_audit('presenca_desfazer', 'employee_attendance', v_antes.id,
        jsonb_build_object('funcionario', v_func.full_name, 'dia', v_dia, 'situacao', v_antes.status),
        null, null);
    end if;
    return jsonb_build_object('ok', true, 'status', null, 'dia', v_dia);
  end if;

  insert into public.employee_attendance (employee_id, work_date, status, marked_by)
  values (v_func.id, v_dia, v_status, v_ator)
  on conflict (employee_id, work_date)
  do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now()
  returning id into v_id;

  if v_antes.status is distinct from v_status then
    perform public.log_audit('presenca_marcar', 'employee_attendance', v_id,
      case when v_antes.id is null then null
           else jsonb_build_object('situacao', v_antes.status) end,
      jsonb_build_object('funcionario', v_func.full_name, 'dia', v_dia, 'situacao', v_status),
      null);
  end if;

  return jsonb_build_object('ok', true, 'status', v_status, 'dia', v_dia);
end;
$$;

revoke all on function public.marcar_presenca(jsonb) from public, anon;
grant execute on function public.marcar_presenca(jsonb) to authenticated;

-- 5. Resumo do mês -------------------------------------------------------------------
-- INVOKER: quem não pode ver a equipe não recebe linha nenhuma.
create or replace function public.presenca_do_mes(p_mes date default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with mes as (
    select date_trunc('month', coalesce(p_mes, public.dia_de_trabalho()))::date as ini
  ), reg as (
    select a.employee_id, a.work_date, a.status
      from public.employee_attendance a, mes
     where a.work_date >= mes.ini and a.work_date < (mes.ini + interval '1 month')
  )
  select jsonb_build_object(
    'mes', (select ini from mes),
    'funcionarios', coalesce((
      select jsonb_agg(jsonb_build_object(
               'funcionario_id', e.id,
               'nome', e.full_name,
               'ativo', e.employment_status = 'active',
               'veio', (select count(*) from reg r where r.employee_id = e.id and r.status = 'present'),
               'faltou', (select count(*) from reg r where r.employee_id = e.id and r.status = 'absent'),
               'dias', coalesce((select jsonb_agg(jsonb_build_object('data', r.work_date, 'status', r.status)
                                                  order by r.work_date)
                                   from reg r where r.employee_id = e.id), '[]'::jsonb))
             order by e.full_name)
        from public.employees e
       where e.is_driver
         and (e.employment_status = 'active'
              or exists (select 1 from reg r where r.employee_id = e.id))
    ), '[]'::jsonb));
$$;

revoke all on function public.presenca_do_mes(date) from public, anon;
grant execute on function public.presenca_do_mes(date) to authenticated;

-- 6. A central de entregas devolve a presença de hoje -------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.central_de_entregas()'::regprocedure);
  v_novo text := v_def;
begin
  if v_def like '%0172: presença de hoje%' then
    return;
  end if;

  v_novo := replace(v_novo,
    E'                                     and r.status <> ''settled''))\n             order by e.full_name)',
    E'                                     and r.status <> ''settled''),\n               -- 0172: presença de hoje (null = não marcado).\n               ''presenca'', (select a.status from public.employee_attendance a\n                              where a.employee_id = e.id\n                                and a.work_date = public.dia_de_trabalho()))\n             order by e.full_name)');

  if v_novo not like '%0172: presença de hoje%' then
    raise exception 'central_de_entregas mudou: patch da presença do motoboy';
  end if;
  execute v_novo;
end;
$$;

-- 7. Quem faltou hoje não recebe entrega (no servidor) --------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.atribuir_entrega(uuid,jsonb)'::regprocedure);
  v_novo text := v_def;
begin
  if v_def like '%0172: motoboy que faltou hoje%' then
    return;
  end if;

  v_novo := replace(v_novo,
    E'      format(''%s não está ativo e não pode receber entregas.'', v_motoboy.full_name));\n  end if;\n',
    E'      format(''%s não está ativo e não pode receber entregas.'', v_motoboy.full_name));\n  end if;\n  -- 0172: motoboy que faltou hoje não recebe entrega. Desfazer a marca libera.\n  if exists (select 1 from public.employee_attendance a\n              where a.employee_id = v_motoboy.id\n                and a.work_date = public.dia_de_trabalho()\n                and a.status = ''absent'') then\n    return jsonb_build_object(''ok'', false, ''erro'',\n      format(''%s está marcado como ausente hoje e não pode receber entregas. Se ele veio, desfaça a marcação em Entregas.'', v_motoboy.full_name));\n  end if;\n');

  if v_novo not like '%0172: motoboy que faltou hoje%' then
    raise exception 'atribuir_entrega mudou: patch da presença do motoboy';
  end if;
  execute v_novo;
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.transferir_entrega(uuid,jsonb)'::regprocedure);
  v_novo text := v_def;
begin
  if v_def like '%0172: motoboy que faltou hoje%' then
    return;
  end if;

  v_novo := replace(v_novo,
    E'      format(''%s não está ativo e não pode assumir entregas.'', v_destino.full_name));\n  end if;\n',
    E'      format(''%s não está ativo e não pode assumir entregas.'', v_destino.full_name));\n  end if;\n  -- 0172: motoboy que faltou hoje não assume entrega. Desfazer a marca libera.\n  if exists (select 1 from public.employee_attendance a\n              where a.employee_id = v_destino.id\n                and a.work_date = public.dia_de_trabalho()\n                and a.status = ''absent'') then\n    return jsonb_build_object(''ok'', false, ''erro'',\n      format(''%s está marcado como ausente hoje e não pode assumir entregas. Se ele veio, desfaça a marcação em Entregas.'', v_destino.full_name));\n  end if;\n');

  if v_novo not like '%0172: motoboy que faltou hoje%' then
    raise exception 'transferir_entrega mudou: patch da presença do motoboy';
  end if;
  execute v_novo;
end;
$$;

-- 8. Postcondição ----------------------------------------------------------------------
do $$
declare
  v_dona int;
  v_atendente int;
begin
  select count(*) into v_dona
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
   where r.name = 'Owner/Admin' and p.code = 'employees.attendance';
  select count(*) into v_atendente
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
   where r.name = 'Atendente' and p.code = 'employees.attendance';
  if v_dona <> 1 or v_atendente <> 1 then
    raise exception 'employees.attendance deveria estar na Proprietária e no Atendente (% / %)', v_dona, v_atendente;
  end if;
end;
$$;
