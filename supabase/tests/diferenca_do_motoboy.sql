-- =============================================================================
-- A DIFERENÇA DO ACERTO DO MOTOBOY: NO CAIXA E NA DECISÃO DA DONA
--
-- 04 RN-RUN-004/005/006 · RN-CAIXA-011 · D-2026-10-01-112
-- Migration: 20261001140000_diferenca_do_motoboy.sql
--
-- O que esta suíte prova:
--   C1–C4  falta: o cliente pagou 54, o motoboy trouxe 50 — a gaveta espera
--          +50 (54 de venda, −4 de falta ligada ao acerto) e o fechamento
--          mostra a linha própria;
--   C5     sobra: trouxe 32 de 30 — entra +2, ligado ao acerto;
--   L1–L2  a lista mostra as diferenças como pendentes, e só para quem vê o
--          financeiro do funcionário;
--   L3–L6  lançar no funcionário: só para o dono da corrida, uma vez só;
--   L7–L9  dispensar ("não lançar"): exige motivo, vale uma vez, e depois
--          disso também não se lança.
--
-- Usa o caixa aberto do ambiente, se houver; senão abre um. Fixtures próprias
-- (sufixo F88). Transação com ROLLBACK: nada persiste.
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
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('88888888-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona88@teste.local','x',now(),now(),now()),
  ('88888888-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','atendente88@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a8888888-0000-0000-0000-000000000001','Dona F88','owner',false,'active'),
  ('a8888888-0000-0000-0000-000000000002','Motoboy F88','driver',true,'active'),
  ('a8888888-0000-0000-0000-000000000003','Atendente F88','counter',false,'active'),
  ('a8888888-0000-0000-0000-000000000004','Outro Motoboy F88','driver',true,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b8888888-0000-0000-0000-000000000001','88888888-1111-1111-1111-111111111111','a8888888-0000-0000-0000-000000000001',true),
  ('b8888888-0000-0000-0000-000000000002','88888888-2222-2222-2222-222222222222','a8888888-0000-0000-0000-000000000003',true);
insert into public.user_roles (app_user_id, role_id)
select 'b8888888-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
select 'b8888888-0000-0000-0000-000000000002', id from public.roles where name = 'Atendente';

insert into public.cash_sessions (cash_register_id, operational_date, opened_by, opening_amount, status)
select (select id from public.cash_registers order by created_at limit 1), current_date,
       'b8888888-0000-0000-0000-000000000001', 0, 'open'
 where not exists (select 1 from public.cash_sessions where status = 'open');
select set_config('teste.sessao', (select id::text from public.cash_sessions where status = 'open'), true);
select set_config('teste.dinheiro', (select id::text from public.payment_methods where code = 'dinheiro'), true);

-- Duas entregas concluídas, cada uma numa corrida "a acertar" do Motoboy F88.
insert into public.orders (id, tracking_token_hash, fulfillment_type, status,
  customer_name_snapshot, customer_whatsapp_snapshot, subtotal, delivery_fee, total,
  delivery_address_snapshot, delivery_route_distance_km) values
  ('28888888-0000-0000-0000-000000000001','f88-1','delivery','completed','Cliente F88','11990000088',
   51, 3, 54, '{"logradouro":"Rua F88","numero":"1"}'::jsonb, 2.0),
  ('28888888-0000-0000-0000-000000000002','f88-2','delivery','completed','Cliente F88','11990000088',
   27, 3, 30, '{"logradouro":"Rua F88","numero":"2"}'::jsonb, 2.0);
insert into public.order_payment_intents (order_id, payment_method_id, payment_method_name_snapshot,
  payment_method_family_snapshot, amount_expected)
select o.id, m.id, m.name, m.payment_family, o.total
  from public.orders o, public.payment_methods m
 where o.id in ('28888888-0000-0000-0000-000000000001','28888888-0000-0000-0000-000000000002')
   and m.code = 'dinheiro';

-- Uma corrida ativa por motoboy: a segunda nasce depois do primeiro acerto.
insert into public.driver_runs (id, driver_employee_id, created_by, status, departed_at, returned_at) values
  ('d8888888-0000-0000-0000-000000000001','a8888888-0000-0000-0000-000000000002',
   'b8888888-0000-0000-0000-000000000001','settling', now() - interval '40 minutes', now() - interval '5 minutes');
insert into public.driver_run_orders (driver_run_id, order_id, assigned_by, delivery_status, delivered_at) values
  ('d8888888-0000-0000-0000-000000000001','28888888-0000-0000-0000-000000000001',
   'b8888888-0000-0000-0000-000000000001','delivered', now() - interval '20 minutes');

create or replace function pg_temp.receber_com_o_motoboy(p_pedido uuid, p_valor numeric) returns void
language plpgsql as $$
begin
  perform public.registrar_pagamento(p_pedido, jsonb_build_object(
    'idempotency_key', gen_random_uuid(),
    'linhas', jsonb_build_array(jsonb_build_object(
      'forma_id', current_setting('teste.dinheiro'), 'valor', p_valor, 'na_gaveta', false))));
end;
$$;

-- -----------------------------------------------------------------------------
-- C. CAIXA
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.receber_com_o_motoboy('28888888-0000-0000-0000-000000000001', 54);
select pg_temp.receber_com_o_motoboy('28888888-0000-0000-0000-000000000002', 30);
select set_config('teste.antes', public.esperado_em_caixa(current_setting('teste.sessao')::uuid)::text, true);

select pg_temp.checar('C1 falta: trouxe 50 de 54, com motivo, o acerto fecha', 'true|-4.00',
  (select concat_ws('|', r ->> 'ok', r ->> 'diferenca')
     from (select public.conciliar_corrida('d8888888-0000-0000-0000-000000000001',
             '{"devolvido": 50, "motivo": "Perdeu R$ 4 no troco"}'::jsonb) r) t));
select pg_temp.checar('C2 a gaveta espera o que entrou: +50', '50.00',
  (public.esperado_em_caixa(current_setting('teste.sessao')::uuid)
   - current_setting('teste.antes')::numeric)::text);
select pg_temp.checar('C3 a falta é um movimento próprio, de saída, ligado ao acerto', 'out|4.00|1',
  (select concat_ws('|', min(m.direction), min(m.amount)::text, count(*)::text)
     from public.cash_movements m
     join public.driver_run_settlements s on s.id = m.driver_run_settlement_id
    where s.driver_run_id = 'd8888888-0000-0000-0000-000000000001'
      and m.movement_type = 'driver_difference'));
select pg_temp.checar('C4 o fechamento mostra a linha da diferença', '-4.00',
  (public.resumo_do_fechamento(current_setting('teste.sessao')::uuid) ->> 'diferencas_de_motoboy'));

reset role;
insert into public.driver_runs (id, driver_employee_id, created_by, status, departed_at, returned_at) values
  ('d8888888-0000-0000-0000-000000000002','a8888888-0000-0000-0000-000000000002',
   'b8888888-0000-0000-0000-000000000001','settling', now() - interval '30 minutes', now() - interval '2 minutes');
insert into public.driver_run_orders (driver_run_id, order_id, assigned_by, delivery_status, delivered_at) values
  ('d8888888-0000-0000-0000-000000000002','28888888-0000-0000-0000-000000000002',
   'b8888888-0000-0000-0000-000000000001','delivered', now() - interval '10 minutes');
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('C5 sobra: trouxe 32 de 30, com motivo, o acerto fecha', 'true|2.00',
  (select concat_ws('|', r ->> 'ok', r ->> 'diferenca')
     from (select public.conciliar_corrida('d8888888-0000-0000-0000-000000000002',
             '{"devolvido": 32, "motivo": "Cliente deixou o troco"}'::jsonb) r) t));
select pg_temp.checar('C5b a sobra entra, ligada ao acerto', 'in|2.00',
  (select m.direction || '|' || m.amount::text from public.cash_movements m
     join public.driver_run_settlements s on s.id = m.driver_run_settlement_id
    where s.driver_run_id = 'd8888888-0000-0000-0000-000000000002'));

-- -----------------------------------------------------------------------------
-- L. A DECISÃO DA DONA
-- -----------------------------------------------------------------------------
select pg_temp.checar('L1 a lista mostra as duas diferenças, pendentes', 'pendente:-4.00,pendente:2.00',
  (select string_agg((d ->> 'situacao') || ':' || (d ->> 'diferenca'), ',' order by (d ->> 'diferenca')::numeric)
     from jsonb_array_elements(public.diferencas_de_acerto('a8888888-0000-0000-0000-000000000002')) d));
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-2222-2222-2222-222222222222","role":"authenticated"}';
select pg_temp.checar('L2 quem não vê o financeiro do funcionário não vê a lista', '[]',
  public.diferencas_de_acerto('a8888888-0000-0000-0000-000000000002')::text);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-1111-1111-1111-111111111111","role":"authenticated"}';
select set_config('teste.acerto1', (select id::text from public.driver_run_settlements
  where driver_run_id = 'd8888888-0000-0000-0000-000000000001'), true);
select set_config('teste.acerto2', (select id::text from public.driver_run_settlements
  where driver_run_id = 'd8888888-0000-0000-0000-000000000002'), true);

select pg_temp.checar('L3 lançar a falta em OUTRO funcionário é recusado', 'false',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id', 'a8888888-0000-0000-0000-000000000004', 'tipo', 'discrepancy',
     'valor', 4, 'motivo', 'Falta no acerto', 'corrida_id', 'd8888888-0000-0000-0000-000000000001',
     'idempotency_key', gen_random_uuid())) ->> 'ok'));
select pg_temp.checar('L4 lançar no motoboy da corrida é aceito', 'true',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id', 'a8888888-0000-0000-0000-000000000002', 'tipo', 'discrepancy',
     'valor', 4, 'motivo', 'Falta no acerto', 'corrida_id', 'd8888888-0000-0000-0000-000000000001',
     'idempotency_key', gen_random_uuid())) ->> 'ok'));
select pg_temp.checar('L5 ...e não se lança duas vezes', 'true',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id', 'a8888888-0000-0000-0000-000000000002', 'tipo', 'discrepancy',
     'valor', 4, 'motivo', 'Falta no acerto', 'corrida_id', 'd8888888-0000-0000-0000-000000000001',
     'idempotency_key', gen_random_uuid())) ->> 'ja_decidida'));
select pg_temp.checar('L6 lançada, não se dispensa', 'true',
  (public.dispensar_diferenca_do_acerto(current_setting('teste.acerto1')::uuid, 'Mudei de ideia') ->> 'ja_decidida'));

select pg_temp.checar('L7 dispensar exige motivo', 'false',
  (public.dispensar_diferenca_do_acerto(current_setting('teste.acerto2')::uuid, ' ') ->> 'ok'));
select pg_temp.checar('L8 dispensar com motivo é aceito', 'true',
  (public.dispensar_diferenca_do_acerto(current_setting('teste.acerto2')::uuid, 'Sobra a favor da loja') ->> 'ok'));
select pg_temp.checar('L8b a lista diz o que foi decidido', 'dispensada:2.00,lancada:-4.00',
  (select string_agg((d ->> 'situacao') || ':' || (d ->> 'diferenca'), ',' order by d ->> 'situacao')
     from jsonb_array_elements(public.diferencas_de_acerto('a8888888-0000-0000-0000-000000000002')) d));
select pg_temp.checar('L9 dispensada, não se lança', 'true',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id', 'a8888888-0000-0000-0000-000000000002', 'tipo', 'discrepancy',
     'valor', 2, 'motivo', 'Tentativa', 'corrida_id', 'd8888888-0000-0000-0000-000000000002',
     'idempotency_key', gen_random_uuid())) ->> 'ja_decidida'));
reset role;

-- -----------------------------------------------------------------------------
-- RESULTADO
-- -----------------------------------------------------------------------------
select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
