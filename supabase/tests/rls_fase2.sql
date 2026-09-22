-- =============================================================================
-- TESTES DE AUTORIZAÇÃO — FASE 2
--
-- 03-RLS-RBAC-SEGURANCA.md §34 · 05-PLANO-IMPLEMENTACAO.md §6.6 · §14.2
--
-- Não basta a policy existir: cada cenário exercita o caminho PERMITIDO e o
-- caminho NEGADO, incluindo acesso horizontal (um usuário lendo dado de outro)
-- e escalada de privilégio (usuário tentando se dar permissões).
--
-- Roda inteiro dentro de uma transação e termina em ROLLBACK: o banco fica
-- exatamente como estava. Nenhum dado de teste é persistido.
--
-- Simula sessões com `set local role authenticated` +
-- `set local request.jwt.claims`, que é como o PostgREST apresenta o usuário
-- ao Postgres. É o mesmo caminho que uma requisição real percorre.
-- =============================================================================

begin;

create temporary table resultado_teste (
  n serial,
  cenario text,
  esperado text,
  obtido text,
  passou boolean
) on commit drop;

-- A tabela de resultados é infraestrutura do teste, não dado do domínio.
-- Precisa ser gravável pelos papéis que o teste assume ao simular sessões.
grant all on resultado_teste to anon, authenticated;
grant all on sequence resultado_teste_n_seq to anon, authenticated;

create or replace function pg_temp.checar(
  p_cenario text, p_esperado text, p_obtido text
) returns void language plpgsql as $$
begin
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido);
end;
$$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
-- Três identidades:
--   dona      → papel Owner/Admin
--   atendente → papel Atendente
--   motoboy   → funcionário SEM login (não existe em app_users)
-- E uma quarta, `desligada`, para testar revogação de acesso.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona@teste.local','x',now(),now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','atendente@teste.local','x',now(),now(),now()),
  ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','desligada@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status, ended_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Dona Teste','owner',false,'active',null),
  ('aaaaaaaa-0000-0000-0000-000000000002','Atendente Teste','counter',false,'active',null),
  ('aaaaaaaa-0000-0000-0000-000000000003','Motoboy Sem Login','driver',true,'active',null),
  ('aaaaaaaa-0000-0000-0000-000000000004','Desligada Teste','counter',false,'inactive','2026-09-01');

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001',true),
  ('bbbbbbbb-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000002',true),
  ('bbbbbbbb-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444','aaaaaaaa-0000-0000-0000-000000000004',true);

insert into public.user_roles (app_user_id, role_id)
select 'bbbbbbbb-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
select 'bbbbbbbb-0000-0000-0000-000000000002', id from public.roles where name = 'Atendente';
insert into public.user_roles (app_user_id, role_id)
select 'bbbbbbbb-0000-0000-0000-000000000004', id from public.roles where name = 'Atendente';

-- Salário apenas da atendente, para testar a fronteira financeira.
insert into public.employee_financial_profiles (employee_id, salary_reference)
values ('aaaaaaaa-0000-0000-0000-000000000002', 2100.00);

-- =============================================================================
-- 1. ANÔNIMO — não enxerga absolutamente nada (§34, testes 1 e 2)
-- =============================================================================
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select pg_temp.checar('1.1 anonimo NAO lista funcionarios', '0',
  (select count(*)::text from public.employees));
select pg_temp.checar('1.2 anonimo NAO lista usuarios internos', '0',
  (select count(*)::text from public.app_users));
select pg_temp.checar('1.3 anonimo NAO lista papeis', '0',
  (select count(*)::text from public.roles));
select pg_temp.checar('1.4 anonimo NAO le salarios', '0',
  (select count(*)::text from public.employee_financial_profiles));
select pg_temp.checar('1.5 anonimo NAO le auditoria', '0',
  (select count(*)::text from public.audit_logs));

do $$ begin
  begin
    perform public.has_permission('orders.view');
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('1.6 anonimo NAO executa has_permission', 'negado', 'PERMITIDO', false);
  exception when insufficient_privilege or undefined_function then
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('1.6 anonimo NAO executa has_permission', 'negado', 'negado', true);
  end;
end $$;

reset role;

-- =============================================================================
-- 2. OWNER/ADMIN — caminho permitido
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('2.1 dona TEM employees.view', 'true',
  public.has_permission('employees.view')::text);
select pg_temp.checar('2.2 dona TEM employees.finance.view', 'true',
  public.has_permission('employees.finance.view')::text);
select pg_temp.checar('2.3 dona TEM roles.manage', 'true',
  public.has_permission('roles.manage')::text);
select pg_temp.checar('2.4 dona TEM audit.view', 'true',
  public.has_permission('audit.view')::text);
-- Conta as FIXTURES deste arquivo, não a tabela inteira: o banco de
-- desenvolvimento tem funcionários reais, e um count global mediria o
-- ambiente em vez da policy.
select pg_temp.checar('2.5 dona LE os 4 funcionarios do teste', '4',
  (select count(*)::text from public.employees
    where id::text like 'aaaaaaaa-0000-0000-0000-%'));
select pg_temp.checar('2.6 dona LE salario da atendente', '2100.00',
  (select salary_reference::text from public.employee_financial_profiles
   where employee_id = 'aaaaaaaa-0000-0000-0000-000000000002'));
select pg_temp.checar('2.7 dona LE auditoria', 'true',
  (select (count(*) > 0)::text from public.audit_logs));

reset role;

-- =============================================================================
-- 3. ATENDENTE — a fronteira mais importante da fase
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- 3a. O que ela PODE
select pg_temp.checar('3.1 atendente TEM orders.view', 'true',
  public.has_permission('orders.view')::text);
select pg_temp.checar('3.2 atendente TEM employees.view', 'true',
  public.has_permission('employees.view')::text);
select pg_temp.checar('3.3 atendente LE dados operacionais dos funcionarios', '4',
  (select count(*)::text from public.employees
    where id::text like 'aaaaaaaa-0000-0000-0000-%'));

-- 3b. O que ela NAO PODE — §18.2: registrar ocorrencia nao concede ver salario
select pg_temp.checar('3.4 atendente NAO tem employees.finance.view', 'false',
  public.has_permission('employees.finance.view')::text);
select pg_temp.checar('3.5 atendente NAO le salario NENHUM (nem o proprio)', '0',
  (select count(*)::text from public.employee_financial_profiles));
select pg_temp.checar('3.6 atendente NAO tem audit.view', 'false',
  public.has_permission('audit.view')::text);
select pg_temp.checar('3.7 atendente NAO le auditoria', '0',
  (select count(*)::text from public.audit_logs));
select pg_temp.checar('3.8 atendente NAO tem roles.manage', 'false',
  public.has_permission('roles.manage')::text);
select pg_temp.checar('3.9 atendente NAO tem cash.reopen', 'false',
  public.has_permission('cash.reopen')::text);
select pg_temp.checar('3.10 atendente NAO tem finance.reverse', 'false',
  public.has_permission('finance.reverse')::text);
select pg_temp.checar('3.11 atendente NAO tem customers.block', 'false',
  public.has_permission('customers.block')::text);
select pg_temp.checar('3.12 atendente NAO tem settings.manage', 'false',
  public.has_permission('settings.manage')::text);
select pg_temp.checar('3.13 atendente NAO tem orders.override_delivery_fee', 'false',
  public.has_permission('orders.override_delivery_fee')::text);

-- 3c. ESCALADA DE PRIVILEGIO — tentativas diretas de se promover
do $$
declare v_role uuid; v_perm uuid; v_erro text;
begin
  select id into v_role from public.roles where name = 'Owner/Admin';
  select id into v_perm from public.permissions where code = 'employees.finance.view';

  -- Tenta atribuir o papel Owner/Admin a si mesma
  begin
    insert into public.user_roles (app_user_id, role_id)
    values ('bbbbbbbb-0000-0000-0000-000000000002', v_role);
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('3.14 atendente NAO se promove a Owner/Admin', 'negado', 'PERMITIDO', false);
  exception when insufficient_privilege then
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('3.14 atendente NAO se promove a Owner/Admin', 'negado', 'negado', true);
  end;

  -- Tenta conceder a permissão de salário ao próprio papel
  begin
    insert into public.role_permissions (role_id, permission_id)
    select r.id, v_perm from public.roles r where r.name = 'Atendente';
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('3.15 atendente NAO concede permissao ao proprio papel', 'negado', 'PERMITIDO', false);
  exception when insufficient_privilege then
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('3.15 atendente NAO concede permissao ao proprio papel', 'negado', 'negado', true);
  end;

  -- Tenta criar um papel novo com tudo
  begin
    insert into public.roles (name, description) values ('Papel Forjado', 'escalada');
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('3.16 atendente NAO cria papel', 'negado', 'PERMITIDO', false);
  exception when insufficient_privilege then
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('3.16 atendente NAO cria papel', 'negado', 'negado', true);
  end;

  -- Tenta escrever salário
  begin
    insert into public.employee_financial_profiles (employee_id, salary_reference)
    values ('aaaaaaaa-0000-0000-0000-000000000003', 9999);
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('3.17 atendente NAO escreve salario', 'negado', 'PERMITIDO', false);
  exception when insufficient_privilege then
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('3.17 atendente NAO escreve salario', 'negado', 'negado', true);
  end;

  -- Tenta gerenciar funcionários
  begin
    insert into public.employees (full_name, employee_type) values ('Forjado', 'other');
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('3.18 atendente NAO cria funcionario', 'negado', 'PERMITIDO', false);
  exception when insufficient_privilege then
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('3.18 atendente NAO cria funcionario', 'negado', 'negado', true);
  end;

  -- Tenta ativar acesso de si mesma em outro usuário (acesso horizontal)
  begin
    update public.app_users set is_active = false
    where id = 'bbbbbbbb-0000-0000-0000-000000000001';
    if not found then
      insert into resultado_teste (cenario, esperado, obtido, passou)
      values ('3.19 atendente NAO desativa acesso da dona', 'negado', 'negado', true);
    else
      insert into resultado_teste (cenario, esperado, obtido, passou)
      values ('3.19 atendente NAO desativa acesso da dona', 'negado', 'PERMITIDO', false);
    end if;
  exception when insufficient_privilege then
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('3.19 atendente NAO desativa acesso da dona', 'negado', 'negado', true);
  end;
end $$;

reset role;

-- =============================================================================
-- 4. AUDITORIA — append-only (§34 teste 20, RN-AUD-004)
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ATENÇÃO: RLS nega UPDATE/DELETE silenciosamente — a instrução afeta 0 linhas
-- em vez de lançar exceção. Testar só exceção daria falso negativo. Aqui
-- verificamos o NÚMERO DE LINHAS AFETADAS e a integridade do registro.
do $$
declare v_id uuid; v_acao_antes text; v_n int;
begin
  select id, action into v_id, v_acao_antes from public.audit_logs limit 1;

  update public.audit_logs set action = 'adulterado' where id = v_id;
  get diagnostics v_n = row_count;
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values ('4.1 nem o Owner/Admin ALTERA auditoria', '0 linhas', v_n || ' linhas', v_n = 0);

  delete from public.audit_logs where id = v_id;
  get diagnostics v_n = row_count;
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values ('4.2 nem o Owner/Admin APAGA auditoria', '0 linhas', v_n || ' linhas', v_n = 0);

  insert into resultado_teste (cenario, esperado, obtido, passou)
  select '4.2b registro de auditoria continua integro', v_acao_antes, action, action = v_acao_antes
  from public.audit_logs where id = v_id;

  -- Ninguém forja registro chamando log_audit pela API
  begin
    perform public.log_audit('forjado', 'teste');
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('4.3 usuario NAO chama log_audit direto', 'negado', 'PERMITIDO', false);
  exception when insufficient_privilege then
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('4.3 usuario NAO chama log_audit direto', 'negado', 'negado', true);
  end;
end $$;

reset role;

-- Segunda barreira: como superusuário (que IGNORA RLS), a trigger precisa ser
-- quem impede a alteração. Defesa em profundidade.
do $$
declare v_id uuid;
begin
  select id into v_id from public.audit_logs limit 1;
  begin
    update public.audit_logs set action = 'adulterado' where id = v_id;
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('4.1b trigger bloqueia UPDATE ignorando RLS', 'bloqueado', 'NAO BLOQUEOU', false);
  exception when others then
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('4.1b trigger bloqueia UPDATE ignorando RLS', 'bloqueado', 'bloqueado', true);
  end;
  begin
    delete from public.audit_logs where id = v_id;
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('4.2c trigger bloqueia DELETE ignorando RLS', 'bloqueado', 'NAO BLOQUEOU', false);
  exception when others then
    insert into resultado_teste (cenario, esperado, obtido, passou)
    values ('4.2c trigger bloqueia DELETE ignorando RLS', 'bloqueado', 'bloqueado', true);
  end;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

reset role;

-- A trigger registrou as mudanças de papel/permissão feitas nas fixtures?
select pg_temp.checar('4.4 trigger auditou atribuicao de papel', 'true',
  (select (count(*) > 0)::text from public.audit_logs
   where entity_type = 'user_roles' and action = 'insert_user_roles'));
select pg_temp.checar('4.5 trigger auditou escrita de salario', 'true',
  (select (count(*) > 0)::text from public.audit_logs
   where entity_type = 'employee_financial_profiles'));

-- =============================================================================
-- 5. REVOGAÇÃO DE ACESSO (§5.4, §34 teste 13)
-- =============================================================================
-- A usuária 'desligada' tem funcionário com employment_status = 'inactive'.
-- Mesmo com JWT válido e papel atribuído, deve perder todo o acesso.
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select pg_temp.checar('5.1 desligada NAO e usuario interno', 'false',
  public.is_internal_user()::text);
select pg_temp.checar('5.2 desligada perde permissao apesar do papel', 'false',
  public.has_permission('orders.view')::text);
select pg_temp.checar('5.3 desligada NAO le funcionarios', '0',
  (select count(*)::text from public.employees));

reset role;

-- Agora o outro mecanismo: usuário ativo mas com app_users.is_active = false.
update public.app_users set is_active = false
where id = 'bbbbbbbb-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('5.4 acesso revogado derruba is_internal_user', 'false',
  public.is_internal_user()::text);
select pg_temp.checar('5.5 acesso revogado derruba permissoes', 'false',
  public.has_permission('orders.view')::text);
select pg_temp.checar('5.6 acesso revogado NAO le funcionarios', '0',
  (select count(*)::text from public.employees));

reset role;

-- =============================================================================
-- 6. FUNCIONÁRIO SEM LOGIN (§34 teste 14)
-- =============================================================================
select pg_temp.checar('6.1 motoboy existe como funcionario', 'true',
  (select (count(*) = 1)::text from public.employees
   where id = 'aaaaaaaa-0000-0000-0000-000000000003'));
select pg_temp.checar('6.2 motoboy NAO tem usuario de autenticacao', '0',
  (select count(*)::text from public.app_users
   where employee_id = 'aaaaaaaa-0000-0000-0000-000000000003'));

-- =============================================================================
-- RESULTADO
-- =============================================================================
select
  case when passou then 'OK    ' else 'FALHOU' end
    || ' | ' || lpad(n::text, 2)
    || ' | ' || rpad(cenario, 52)
    || ' | esperado=' || coalesce(esperado,'(null)')
    || ' obtido=' || coalesce(obtido,'(null)') as resultado
from resultado_teste
union all
select '---------------------------------------------------------------'
union all
select 'TOTAL: ' || count(*) || ' cenarios | PASSARAM: '
  || count(*) filter (where passou) || ' | FALHARAM: '
  || count(*) filter (where not passou)
from resultado_teste;

rollback;
