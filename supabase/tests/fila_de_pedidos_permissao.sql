-- =============================================================================
-- FILA DE PEDIDOS EXIGE `orders.view` — regressão da 0131
--
-- 03-RLS-RBAC-SEGURANCA.md §5 · CLAUDE.md §12 · D-2026-09-29-92
-- Migration: 20260929120000_fila_de_pedidos_exige_orders_view.sql
--
-- A 0108 recriou `fila_de_pedidos` como SECURITY DEFINER sem nenhuma checagem,
-- e ela passou a entregar a fila a qualquer sessão `authenticated`, por cima
-- do RLS. Esta suíte prova que a fila responde EXATAMENTE como as policies de
-- leitura de pedido: quem não tem `orders.view` recebe `[]`; quem tem recebe
-- o mesmo conjunto que o RLS mostra em `orders`.
--
-- Os pedidos são os que já existem no banco (a suíte não cria pedido). O
-- cenário F0 registra a massa: com zero pedidos encerrados, F7/F8 passariam
-- sem provar nada, e F0 falha para avisar.
--
-- Transação com ROLLBACK: nada persiste.
-- =============================================================================

begin;

create temporary table resultado_teste (
  n serial, cenario text, esperado text, obtido text, passou boolean
) on commit drop;
grant all on resultado_teste to anon, authenticated;
grant all on sequence resultado_teste_n_seq to anon, authenticated;

create or replace function pg_temp.checar(p_cenario text, p_esperado text, p_obtido text)
returns void language plpgsql as $$
begin
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido);
end;
$$;

-- -----------------------------------------------------------------------------
-- FIXTURES — quatro identidades, um papel sem permissão nenhuma
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('92929292-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona92@teste.local','x',now(),now(),now()),
  ('92929292-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','desligada92@teste.local','x',now(),now(),now()),
  ('92929292-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sempedido92@teste.local','x',now(),now(),now()),
  ('92929292-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sointerno92@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a9a9a9a9-0000-0000-0000-000000000001','Dona F92','owner',false,'active'),
  ('a9a9a9a9-0000-0000-0000-000000000002','Desligada F92','counter',false,'active'),
  ('a9a9a9a9-0000-0000-0000-000000000003','Sem pedido F92','counter',false,'active');

-- A desligada tem o MESMO papel da dona, mas o acesso está revogado: é o caso
-- da sessão que continua válida depois do desligamento.
insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b9b9b9b9-0000-0000-0000-000000000001','92929292-1111-1111-1111-111111111111','a9a9a9a9-0000-0000-0000-000000000001',true),
  ('b9b9b9b9-0000-0000-0000-000000000002','92929292-2222-2222-2222-222222222222','a9a9a9a9-0000-0000-0000-000000000002',false),
  ('b9b9b9b9-0000-0000-0000-000000000003','92929292-3333-3333-3333-333333333333','a9a9a9a9-0000-0000-0000-000000000003',true);

insert into public.roles (id, name, is_system, is_active)
values ('c9c9c9c9-0000-0000-0000-000000000001','Sem pedidos F92', false, true);

insert into public.user_roles (app_user_id, role_id)
select 'b9b9b9b9-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
select 'b9b9b9b9-0000-0000-0000-000000000002', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
values ('b9b9b9b9-0000-0000-0000-000000000003','c9c9c9c9-0000-0000-0000-000000000001');
-- 92929292-4444… tem conta de login e nenhum usuário interno.

-- -----------------------------------------------------------------------------
-- F0 — a massa existe
-- -----------------------------------------------------------------------------
select pg_temp.checar('F0 há pedido encerrado no banco para a suíte provar algo', 'true',
  ((select count(*) from public.orders where status in ('completed','rejected','cancelled')) > 0)::text);

-- -----------------------------------------------------------------------------
-- F1–F2 — usuário interno DESLIGADO (o defeito medido)
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"92929292-2222-2222-2222-222222222222","role":"authenticated"}';
select pg_temp.checar('F1 desligada: fila de encerrados vazia', '0',
  jsonb_array_length(public.fila_de_pedidos(true))::text);
select pg_temp.checar('F2 desligada: fila de abertos vazia', '0',
  jsonb_array_length(public.fila_de_pedidos(false))::text);
reset role;

-- -----------------------------------------------------------------------------
-- F3–F4 — conta de login sem usuário interno
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"92929292-4444-4444-4444-444444444444","role":"authenticated"}';
select pg_temp.checar('F3 só login: encerrados vazia', '0',
  jsonb_array_length(public.fila_de_pedidos(true))::text);
select pg_temp.checar('F4 só login: abertos vazia', '0',
  jsonb_array_length(public.fila_de_pedidos(false))::text);
reset role;

-- -----------------------------------------------------------------------------
-- F5–F6 — interno ATIVO, papel ativo, sem `orders.view`
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"92929292-3333-3333-3333-333333333333","role":"authenticated"}';
select pg_temp.checar('F5 sem orders.view: encerrados vazia', '0',
  jsonb_array_length(public.fila_de_pedidos(true))::text);
select pg_temp.checar('F6 sem orders.view: abertos vazia', '0',
  jsonb_array_length(public.fila_de_pedidos(false))::text);
reset role;

-- -----------------------------------------------------------------------------
-- F7–F8 — a dona vê exatamente o que o RLS mostra
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"92929292-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('F7 dona: encerrados = pedidos encerrados visíveis pelo RLS',
  (select count(*) from public.orders where status in ('completed','rejected','cancelled'))::text,
  jsonb_array_length(public.fila_de_pedidos(true))::text);
select pg_temp.checar('F8 dona: abertos = pedidos abertos visíveis pelo RLS',
  (select count(*) from public.orders where status not in ('completed','rejected','cancelled'))::text,
  jsonb_array_length(public.fila_de_pedidos(false))::text);
reset role;

-- -----------------------------------------------------------------------------
-- F9–F11 — contrato da função
-- -----------------------------------------------------------------------------
select pg_temp.checar('F9 anon não executa', 'false',
  has_function_privilege('anon', 'public.fila_de_pedidos(boolean)', 'execute')::text);
select pg_temp.checar('F10 continua DEFINER (desempenho da 0108)', 'true',
  (select prosecdef from pg_proc where oid = 'public.fila_de_pedidos(boolean)'::regprocedure)::text);
select pg_temp.checar('F11 a guarda de orders.view está no corpo', 'true',
  (select prosrc ~ 'has_permission\(''orders\.view''\)'
     from pg_proc where oid = 'public.fila_de_pedidos(boolean)'::regprocedure)::text);

-- -----------------------------------------------------------------------------
-- RESULTADO
-- -----------------------------------------------------------------------------
select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
