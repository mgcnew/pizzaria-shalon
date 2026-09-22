-- 0083 — §12.3/§12.4: manutenção de funcionários, acesso e papéis
-- 04-REGRAS-NEGOCIO.md RN-FUNC-001/002/003, RN-RBAC-001..005
-- 03-RLS-RBAC-SEGURANCA.md §18.4, §19.7 · CLAUDE.md §10.1, §12, §14, §33
--
-- TRÊS COISAS DIFERENTES, e o sistema não pode confundi-las:
--
--   funcionário  — a pessoa que trabalha. Pode não ter login nenhum.
--   app_user     — o acesso ao sistema. Só existe se a pessoa precisar entrar.
--   papel        — o que esse acesso pode fazer.
--
-- O motoboy é o caso que prova a separação: ele é funcionário, recebe
-- entregas, presta contas, tem histórico financeiro — e normalmente não tem
-- usuário (CLAUDE.md §10.1, RN-MOTO-001/002).

-- ================================================== cadastro de funcionário
create or replace function public.salvar_funcionario(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_id uuid := nullif(p_dados ->> 'id', '')::uuid;
  v_nome text := nullif(btrim(coalesce(p_dados ->> 'nome', '')), '');
  v_tipo text := coalesce(nullif(p_dados ->> 'tipo', ''), 'other');
  v_entregador boolean := coalesce((p_dados ->> 'entregador')::boolean, false);
  v_antes record;
  v_novo boolean;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('employees.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para gerenciar funcionários.');
  end if;

  if v_nome is null or length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'erro', 'Informe o nome completo.');
  end if;
  if v_tipo not in ('owner', 'counter', 'driver', 'other') then
    return jsonb_build_object('ok', false, 'erro', 'Tipo de funcionário inválido.');
  end if;

  v_novo := v_id is null;

  if v_novo then
    insert into public.employees (
      full_name, phone, employee_type, is_driver, started_at, notes)
    values (
      v_nome,
      nullif(btrim(coalesce(p_dados ->> 'telefone', '')), ''),
      v_tipo, v_entregador,
      nullif(p_dados ->> 'admitido_em', '')::date,
      nullif(btrim(coalesce(p_dados ->> 'observacao', '')), ''))
    returning id into v_id;
  else
    select * into v_antes from public.employees e where e.id = v_id for update;
    if v_antes.id is null then
      return jsonb_build_object('ok', false, 'erro', 'Funcionário não encontrado.');
    end if;

    -- Desligamento e reativação têm rotina própria, com motivo e data. Editar
    -- o cadastro não muda a situação de ninguém por acidente (RN-FUNC-001).
    update public.employees
       set full_name = v_nome,
           phone = nullif(btrim(coalesce(p_dados ->> 'telefone', '')), ''),
           employee_type = v_tipo,
           is_driver = v_entregador,
           started_at = nullif(p_dados ->> 'admitido_em', '')::date,
           notes = nullif(btrim(coalesce(p_dados ->> 'observacao', '')), '')
     where id = v_id;
  end if;

  perform public.log_audit(
    case when v_novo then 'funcionario_criar' else 'funcionario_editar' end,
    'employees', v_id,
    case when v_novo then null else jsonb_build_object(
      'nome', v_antes.full_name, 'tipo', v_antes.employee_type,
      'entregador', v_antes.is_driver) end,
    jsonb_build_object('nome', v_nome, 'tipo', v_tipo, 'entregador', v_entregador),
    null);

  return jsonb_build_object('ok', true, 'funcionario_id', v_id, 'criado', v_novo);
end;
$$;

comment on function public.salvar_funcionario is
  'RN-FUNC-001: cadastro e edição. Situação (ativo/desligado) tem rotina própria.';

revoke all on function public.salvar_funcionario(jsonb) from public, anon;
grant execute on function public.salvar_funcionario(jsonb) to authenticated;

-- ------------------------------------------------------------ desligamento
-- RN-FUNC-001: desligar é DATA, nunca exclusão. O histórico do funcionário —
-- entregas, acertos, consumo, adiantamento — continua inteiro.
create or replace function public.desligar_funcionario(p_id uuid, p_dados jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_func record;
  v_data date := coalesce(nullif(p_dados ->> 'data', '')::date, current_date);
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_acessos integer := 0;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('employees.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para gerenciar funcionários.');
  end if;

  select * into v_func from public.employees e where e.id = p_id for update;
  if v_func.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Funcionário não encontrado.');
  end if;
  if v_func.employment_status = 'inactive' then
    return jsonb_build_object('ok', false, 'ja_desligado', true,
      'erro', 'Este funcionário já está desligado.');
  end if;
  if v_func.started_at is not null and v_data < v_func.started_at then
    return jsonb_build_object('ok', false, 'erro',
      'A data de desligamento é anterior à de admissão.');
  end if;

  -- Motoboy com dinheiro na rua não se desliga: alguém precisa prestar contas
  -- daquela corrida antes (CLAUDE.md §26).
  if exists (select 1 from public.driver_runs r
              where r.driver_employee_id = p_id and r.status <> 'settled') then
    return jsonb_build_object('ok', false, 'tem_corrida_aberta', true, 'erro',
      'Este entregador tem corrida em aberto. Faça o acerto antes de desligá-lo.');
  end if;

  update public.employees
     set employment_status = 'inactive', ended_at = v_data
   where id = p_id;

  -- §18.4: revogar acesso NÃO apaga o usuário nem o vínculo histórico. E
  -- `has_permission` já exige funcionário ativo, então o acesso cai de
  -- qualquer forma; desativar o `app_user` torna isso explícito no cadastro.
  update public.app_users set is_active = false
   where employee_id = p_id and is_active;
  get diagnostics v_acessos = row_count;

  perform public.log_audit('funcionario_desligar', 'employees', p_id,
    jsonb_build_object('situacao', 'active'),
    jsonb_build_object('situacao', 'inactive', 'desligado_em', v_data,
                       'acessos_desativados', v_acessos),
    v_motivo);

  return jsonb_build_object('ok', true, 'acessos_desativados', v_acessos);
end;
$$;

comment on function public.desligar_funcionario is
  'RN-FUNC-001/002: desligamento é data e revoga acesso. Nunca apaga histórico.';

revoke all on function public.desligar_funcionario(uuid, jsonb) from public, anon;
grant execute on function public.desligar_funcionario(uuid, jsonb) to authenticated;

create or replace function public.reativar_funcionario(p_id uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_func record;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('employees.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para gerenciar funcionários.');
  end if;

  select * into v_func from public.employees e where e.id = p_id for update;
  if v_func.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Funcionário não encontrado.');
  end if;
  if v_func.employment_status = 'active' then
    return jsonb_build_object('ok', false, 'erro', 'Este funcionário já está ativo.');
  end if;

  update public.employees
     set employment_status = 'active', ended_at = null
   where id = p_id;

  -- O ACESSO NÃO VOLTA SOZINHO. Reativar a pessoa é uma decisão; devolver a
  -- ela a chave do sistema é outra, e fica com quem administra acesso.
  perform public.log_audit('funcionario_reativar', 'employees', p_id,
    jsonb_build_object('situacao', 'inactive', 'desligado_em', v_func.ended_at),
    jsonb_build_object('situacao', 'active'),
    nullif(btrim(coalesce(p_motivo, '')), ''));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.reativar_funcionario(uuid, text) from public, anon;
grant execute on function public.reativar_funcionario(uuid, text) to authenticated;

-- ========================================================== acesso ao sistema
-- O vínculo entre uma pessoa e uma conta que já existe no Auth.
--
-- O QUE ESTA FUNÇÃO NÃO FAZ: criar a conta. Criar usuário no Auth exige a
-- chave `service_role`, que este projeto não usa em lugar nenhum (CLAUDE.md
-- §13), e definir senha inicial exigiria política de senha e de recuperação
-- que ainda não estão normatizadas (A-15, hardening da Fase 10). Inventar
-- uma aqui seria decidir segurança por conveniência.
create or replace function public.vincular_acesso(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_func record;
  v_email text := lower(nullif(btrim(coalesce(p_dados ->> 'email', '')), ''));
  v_auth uuid;
  v_id uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  -- Dar acesso é transformar uma pessoa em usuária do sistema: exige tanto
  -- gerir funcionário quanto administrar acesso. Uma permissão não abre a
  -- outra (CLAUDE.md §14).
  if not (public.has_permission('employees.manage') and public.has_permission('roles.manage')) then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para conceder acesso ao sistema.');
  end if;

  select * into v_func from public.employees e
    where e.id = nullif(p_dados ->> 'funcionario_id', '')::uuid for update;
  if v_func.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Funcionário não encontrado.');
  end if;
  if v_func.employment_status <> 'active' then
    return jsonb_build_object('ok', false, 'erro',
      'Funcionário desligado não recebe acesso.');
  end if;
  if exists (select 1 from public.app_users a where a.employee_id = v_func.id) then
    return jsonb_build_object('ok', false, 'ja_tem_acesso', true,
      'erro', 'Este funcionário já tem acesso ao sistema.');
  end if;

  if v_email is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o e-mail da conta.');
  end if;

  select u.id into v_auth from auth.users u where lower(u.email) = v_email;
  if v_auth is null then
    return jsonb_build_object('ok', false, 'conta_inexistente', true, 'erro',
      'Não existe conta com esse e-mail. A conta precisa ser criada antes de ser vinculada.');
  end if;
  if exists (select 1 from public.app_users a where a.auth_user_id = v_auth) then
    return jsonb_build_object('ok', false, 'erro',
      'Essa conta já está vinculada a outro funcionário.');
  end if;

  insert into public.app_users (auth_user_id, employee_id, is_active)
  values (v_auth, v_func.id, true)
  returning id into v_id;

  -- Nasce SEM PAPEL. Entrar no sistema e poder fazer algo são coisas
  -- diferentes: o papel é um segundo ato, deliberado.
  perform public.log_audit('acesso_vincular', 'app_users', v_id, null,
    jsonb_build_object('funcionario_id', v_func.id, 'email', v_email), null);

  return jsonb_build_object('ok', true, 'app_user_id', v_id);
end;
$$;

comment on function public.vincular_acesso is
  'Vincula conta EXISTENTE do Auth a um funcionário. Não cria conta nem define senha (A-20).';

revoke all on function public.vincular_acesso(jsonb) from public, anon;
grant execute on function public.vincular_acesso(jsonb) to authenticated;

-- ------------------------------------------------------- ligar/desligar acesso
create or replace function public.definir_acesso(p_app_user_id uuid, p_ativo boolean, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_usuario record;
  v_func record;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not (public.has_permission('employees.manage') and public.has_permission('roles.manage')) then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para administrar acesso.');
  end if;

  select * into v_usuario from public.app_users a where a.id = p_app_user_id for update;
  if v_usuario.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Acesso não encontrado.');
  end if;

  -- Ninguém se desliga sozinho por engano e fica de fora do próprio sistema.
  if v_usuario.id = v_ator and not p_ativo then
    return jsonb_build_object('ok', false, 'erro',
      'Você não pode desativar o próprio acesso.');
  end if;

  if p_ativo then
    select * into v_func from public.employees e where e.id = v_usuario.employee_id;
    if v_func.employment_status <> 'active' then
      return jsonb_build_object('ok', false, 'erro',
        'Funcionário desligado não pode ter o acesso reativado.');
    end if;
  end if;

  update public.app_users set is_active = p_ativo where id = p_app_user_id;

  perform public.log_audit(
    case when p_ativo then 'acesso_ativar' else 'acesso_desativar' end,
    'app_users', p_app_user_id,
    jsonb_build_object('ativo', v_usuario.is_active),
    jsonb_build_object('ativo', p_ativo),
    nullif(btrim(coalesce(p_motivo, '')), ''));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.definir_acesso(uuid, boolean, text) from public, anon;
grant execute on function public.definir_acesso(uuid, boolean, text) to authenticated;

-- ============================================================ papéis
-- RN-RBAC-005: NINGUÉM CONCEDE O QUE NÃO TEM. Quem atribui um papel precisa
-- possuir, ele próprio, todas as permissões que aquele papel carrega. Sem
-- isso, `roles.manage` seria a chave de todas as portas: bastaria atribuir a
-- si mesmo um papel mais forte.
--
-- Por isso `user_roles` deixa de ter policy de escrita: a checagem não pode
-- morar só aqui se /rest/v1 aceitar o INSERT direto.
drop policy user_roles_insert on public.user_roles;
drop policy user_roles_delete on public.user_roles;

create or replace function public.definir_papeis(p_app_user_id uuid, p_papeis uuid[], p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_usuario record;
  v_papeis uuid[] := coalesce(p_papeis, array[]::uuid[]);
  v_antes text;
  v_depois text;
  v_falta text;
  v_inativo text;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('roles.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para administrar papéis.');
  end if;

  select * into v_usuario from public.app_users a where a.id = p_app_user_id for update;
  if v_usuario.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Acesso não encontrado.');
  end if;

  -- Papel inativo não se atribui.
  select string_agg(r.name, ', ' order by r.name) into v_inativo
    from public.roles r where r.id = any(v_papeis) and not r.is_active;
  if v_inativo is not null then
    return jsonb_build_object('ok', false, 'erro',
      format('Papel inativo: %s.', v_inativo));
  end if;
  if (select count(*) from public.roles r where r.id = any(v_papeis)) <> cardinality(v_papeis) then
    return jsonb_build_object('ok', false, 'erro', 'Algum papel informado não existe.');
  end if;

  -- RN-RBAC-005: o que os papéis pedidos concedem e o ator NÃO possui.
  select string_agg(distinct p.code, ', ') into v_falta
    from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
   where rp.role_id = any(v_papeis)
     and not public.has_permission(p.code);

  if v_falta is not null then
    return jsonb_build_object('ok', false, 'escalada', true, 'faltam', v_falta,
      'erro', 'Você não pode conceder permissões que você mesmo não possui.');
  end if;

  select string_agg(r.name, ', ' order by r.name) into v_antes
    from public.user_roles ur join public.roles r on r.id = ur.role_id
   where ur.app_user_id = p_app_user_id;

  delete from public.user_roles where app_user_id = p_app_user_id;

  insert into public.user_roles (app_user_id, role_id, assigned_by)
  select p_app_user_id, r.id, v_ator from public.roles r where r.id = any(v_papeis);

  select string_agg(r.name, ', ' order by r.name) into v_depois
    from public.user_roles ur join public.roles r on r.id = ur.role_id
   where ur.app_user_id = p_app_user_id;

  perform public.log_audit('acesso_definir_papeis', 'app_users', p_app_user_id,
    jsonb_build_object('papeis', v_antes),
    jsonb_build_object('papeis', v_depois),
    nullif(btrim(coalesce(p_motivo, '')), ''));

  return jsonb_build_object('ok', true, 'papeis', coalesce(v_depois, ''));
end;
$$;

comment on function public.definir_papeis is
  'RN-RBAC-005: substitui os papéis do acesso. Ninguém concede permissão que não possui.';

revoke all on function public.definir_papeis(uuid, uuid[], text) from public, anon;
grant execute on function public.definir_papeis(uuid, uuid[], text) to authenticated;

-- ======================================================== projeção da equipe
-- SEM SALÁRIO. Nem a coluna, nem um join, nem um campo derivado. A listagem
-- da equipe é lida por quem tem `employees.view` — que o Atendente possui —
-- e salário exige `employees.finance.view`, que ele não possui (§15).
create or replace function public.equipe()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(t.linha order by t.ativo desc, t.nome), '[]'::jsonb)
    from (
      select (e.employment_status = 'active') as ativo, e.full_name as nome,
             jsonb_build_object(
               'funcionario_id', e.id,
               'nome', e.full_name,
               'telefone', e.phone,
               'tipo', e.employee_type,
               'entregador', e.is_driver,
               'ativo', e.employment_status = 'active',
               'admitido_em', e.started_at,
               'desligado_em', e.ended_at,
               'observacao', e.notes,
               -- O acesso, quando existe. `null` é a resposta certa para o
               -- motoboy: ele trabalha e não entra no sistema.
               'acesso', (
                 select jsonb_build_object(
                          'app_user_id', a.id,
                          'ativo', a.is_active,
                          'ultimo_acesso', a.last_login_at,
                          'papeis', coalesce((
                            select jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.name)
                                   order by r.name)
                              from public.user_roles ur
                              join public.roles r on r.id = ur.role_id
                             where ur.app_user_id = a.id), '[]'::jsonb))
                   from public.app_users a where a.employee_id = e.id)
             ) as linha
        from public.employees e
    ) t;
$$;

comment on function public.equipe is
  'Funcionários com acesso e papéis quando existirem. NUNCA salário (§15, RN-FUNC-003).';

revoke all on function public.equipe() from public, anon;
grant execute on function public.equipe() to authenticated;

-- Papéis que a interface pode oferecer. Leitura já é de usuário interno.
create or replace function public.papeis_atribuiveis()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'nome', r.name, 'descricao', r.description,
           -- RN-RBAC-005: a interface já mostra o que este usuário não pode
           -- conceder, em vez de deixar a RPC recusar depois.
           'pode_conceder', not exists (
             select 1 from public.role_permissions rp
               join public.permissions p on p.id = rp.permission_id
              where rp.role_id = r.id and not public.has_permission(p.code)))
         order by r.name), '[]'::jsonb)
    from public.roles r where r.is_active;
$$;

revoke all on function public.papeis_atribuiveis() from public, anon;
grant execute on function public.papeis_atribuiveis() to authenticated;
