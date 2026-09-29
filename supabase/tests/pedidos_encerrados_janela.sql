-- =============================================================================
-- ABA ENCERRADOS POR JANELA — regressão da 0132
--
-- CLAUDE.md §12, §25, §39 · D-2026-09-29-93
-- Migration: 20260929130000_pedidos_encerrados_por_janela.sql
--
-- A regra: com caixa aberto, a janela começa na abertura do caixa; sem caixa,
-- no começo do dia de calendário no fuso da loja; "dias anteriores" recua a
-- janela até o começo de um dia de calendário, e ela nunca encolhe.
--
-- A suíte não cria pedido. Ela confere a JANELA que a função escolheu e se a
-- lista devolvida é exatamente a contagem independente, feita sob o RLS da
-- própria dona com o mesmo `desde`. Os caixas do banco são fechados DENTRO da
-- transação para controlar a abertura; o ROLLBACK os devolve como estavam.
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

-- Começo do dia de calendário da loja, N dias atrás.
create or replace function pg_temp.inicio_do_dia(p_dias integer) returns timestamptz
language sql stable as $$
  select ((public.dia_da_loja(now()) - p_dias)::timestamp at time zone public.fuso_da_loja());
$$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('93939393-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona93@teste.local','x',now(),now(),now()),
  ('93939393-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sempedido93@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a9393939-0000-0000-0000-000000000001','Dona F93','owner',false,'active'),
  ('a9393939-0000-0000-0000-000000000003','Sem pedido F93','counter',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b9393939-0000-0000-0000-000000000001','93939393-1111-1111-1111-111111111111','a9393939-0000-0000-0000-000000000001',true),
  ('b9393939-0000-0000-0000-000000000003','93939393-3333-3333-3333-333333333333','a9393939-0000-0000-0000-000000000003',true);
insert into public.roles (id, name, is_system, is_active)
values ('c9393939-0000-0000-0000-000000000001','Sem pedidos F93', false, true);
insert into public.user_roles (app_user_id, role_id)
select 'b9393939-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
values ('b9393939-0000-0000-0000-000000000003','c9393939-0000-0000-0000-000000000001');

-- Nenhum caixa aberto: a janela tem de cair no dia de calendário.
update public.cash_sessions
   set status = 'closed', closed_at = now(), closed_by = 'b9393939-0000-0000-0000-000000000001',
       expected_cash_amount = 0, counted_cash_amount = 0, difference_amount = 0
 where status = 'open';

create temporary table leitura (cenario text, r jsonb) on commit drop;
grant all on leitura to authenticated;

-- -----------------------------------------------------------------------------
-- SEM CAIXA ABERTO
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"93939393-1111-1111-1111-111111111111","role":"authenticated"}';
insert into leitura values ('sem caixa, hoje', public.pedidos_encerrados(0));
insert into leitura values ('sem caixa, 7 dias', public.pedidos_encerrados(7));
insert into leitura values ('negativo', public.pedidos_encerrados(-5));
insert into leitura values ('exagerado', public.pedidos_encerrados(999999));
reset role;

select pg_temp.checar('J1 sem caixa: janela começa no dia de calendário',
  pg_temp.inicio_do_dia(0)::text,
  (select (r->>'desde')::timestamptz::text from leitura where cenario = 'sem caixa, hoje'));
select pg_temp.checar('J2 sem caixa: origem "dia"', 'dia',
  (select r->>'origem' from leitura where cenario = 'sem caixa, hoje'));
select pg_temp.checar('J3 7 dias: recua ao começo do dia de 7 dias atrás',
  pg_temp.inicio_do_dia(7)::text,
  (select (r->>'desde')::timestamptz::text from leitura where cenario = 'sem caixa, 7 dias'));
select pg_temp.checar('J4 dias negativos saturam em 0', '0',
  (select r->>'dias_anteriores' from leitura where cenario = 'negativo'));
select pg_temp.checar('J5 dias exagerados saturam em 3650', '3650',
  (select r->>'dias_anteriores' from leitura where cenario = 'exagerado'));

-- -----------------------------------------------------------------------------
-- CAIXA ABERTO HÁ 4 DIAS
-- -----------------------------------------------------------------------------
insert into public.cash_sessions (cash_register_id, operational_date, opened_at, opened_by, opening_amount, status)
select id, public.dia_da_loja(now() - interval '4 days'), now() - interval '4 days',
       'b9393939-0000-0000-0000-000000000001', 0, 'open'
  from public.cash_registers order by id limit 1;
select set_config('teste.abertura', (select opened_at::text from public.cash_sessions where status = 'open'), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"93939393-1111-1111-1111-111111111111","role":"authenticated"}';
insert into leitura values ('caixa, hoje', public.pedidos_encerrados(0));
insert into leitura values ('caixa, 7 dias', public.pedidos_encerrados(7));
insert into leitura values ('caixa, 1 dia', public.pedidos_encerrados(1));
-- Contagens independentes, sob o RLS da dona, com o `desde` que a função devolveu.
insert into leitura
select 'contagem ' || l.cenario,
       jsonb_build_object(
         'dentro', (select count(*) from public.orders o
                     where o.status in ('completed','rejected','cancelled')
                       and o.created_at >= (l.r->>'desde')::timestamptz),
         'antes', (select count(*) from public.orders o
                     where o.status in ('completed','rejected','cancelled')
                       and o.created_at < (l.r->>'desde')::timestamptz))
  from leitura l where l.cenario in ('caixa, hoje', 'caixa, 7 dias', 'sem caixa, 7 dias', 'sem caixa, hoje');
reset role;

select pg_temp.checar('J6 caixa aberto: janela começa na abertura do caixa',
  current_setting('teste.abertura')::timestamptz::text,
  (select (r->>'desde')::timestamptz::text from leitura where cenario = 'caixa, hoje'));
select pg_temp.checar('J7 caixa aberto: origem "caixa"', 'caixa',
  (select r->>'origem' from leitura where cenario = 'caixa, hoje'));
select pg_temp.checar('J8 caixa + 7 dias: recua além da abertura, origem "dia"',
  pg_temp.inicio_do_dia(7)::text || ' dia',
  (select (r->>'desde')::timestamptz::text || ' ' || (r->>'origem') from leitura where cenario = 'caixa, 7 dias'));
select pg_temp.checar('J9 caixa há 4 dias + 1 dia: a janela não encolhe',
  current_setting('teste.abertura')::timestamptz::text,
  (select (r->>'desde')::timestamptz::text from leitura where cenario = 'caixa, 1 dia'));

select pg_temp.checar('J10 lista = contagem independente (caixa, hoje)',
  (select r->>'dentro' from leitura where cenario = 'contagem caixa, hoje'),
  (select jsonb_array_length(r->'pedidos')::text from leitura where cenario = 'caixa, hoje'));
select pg_temp.checar('J11 lista = contagem independente (caixa, 7 dias)',
  (select r->>'dentro' from leitura where cenario = 'contagem caixa, 7 dias'),
  (select jsonb_array_length(r->'pedidos')::text from leitura where cenario = 'caixa, 7 dias'));
select pg_temp.checar('J12 ha_mais = existe encerrado antes da janela (7 dias)',
  ((select (r->>'antes')::int from leitura where cenario = 'contagem sem caixa, 7 dias') > 0)::text,
  (select r->>'ha_mais' from leitura where cenario = 'sem caixa, 7 dias'));
-- A janela de hoje, sem caixa, costuma deixar pedidos dos dias anteriores de
-- fora: é onde a exclusão e o `ha_mais` verdadeiro são exercitados de fato.
select pg_temp.checar('J12b lista = contagem independente (sem caixa, hoje)',
  (select r->>'dentro' from leitura where cenario = 'contagem sem caixa, hoje'),
  (select jsonb_array_length(r->'pedidos')::text from leitura where cenario = 'sem caixa, hoje'));
select pg_temp.checar('J12c ha_mais = existe encerrado antes da janela (sem caixa, hoje)',
  ((select (r->>'antes')::int from leitura where cenario = 'contagem sem caixa, hoje') > 0)::text,
  (select r->>'ha_mais' from leitura where cenario = 'sem caixa, hoje'));
select pg_temp.checar('J13 lista em ordem do mais novo para o mais antigo', 'true',
  (select coalesce(bool_and(a >= b), true)::text from (
     select (e->>'criado_em')::timestamptz a,
            lead((e->>'criado_em')::timestamptz) over (order by ord) b
       from leitura, jsonb_array_elements(r->'pedidos') with ordinality as t(e, ord)
      where cenario = 'caixa, 7 dias') x where b is not null));
select pg_temp.checar('J14 só encerrados na lista', 'true',
  (select coalesce(bool_and((e->>'status') in ('completed','rejected','cancelled')), true)::text
     from leitura, jsonb_array_elements(r->'pedidos') e where cenario = 'caixa, 7 dias'));

-- -----------------------------------------------------------------------------
-- PERMISSÃO — a mesma guarda da 0131
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"93939393-3333-3333-3333-333333333333","role":"authenticated"}';
insert into leitura values ('sem permissão', public.pedidos_encerrados(3650));
reset role;

select pg_temp.checar('J15 sem orders.view: lista vazia', '0',
  (select jsonb_array_length(r->'pedidos')::text from leitura where cenario = 'sem permissão'));
select pg_temp.checar('J16 sem orders.view: ha_mais falso', 'false',
  (select r->>'ha_mais' from leitura where cenario = 'sem permissão'));
select pg_temp.checar('J17 anon não executa', 'false',
  has_function_privilege('anon', 'public.pedidos_encerrados(integer)', 'execute')::text);
select pg_temp.checar('J18 a guarda de orders.view está no corpo', 'true',
  (select prosrc ~ 'has_permission\(''orders\.view''\)'
     from pg_proc where oid = 'public.pedidos_encerrados(integer)'::regprocedure)::text);

-- -----------------------------------------------------------------------------
-- RESULTADO
-- -----------------------------------------------------------------------------
select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
