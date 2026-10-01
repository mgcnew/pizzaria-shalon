-- =============================================================================
-- O ACERTO DO MOTOBOY SÓ FECHA COM CADA ENTREGA RECEBIDA
--
-- 04 RN-RUN-003 · RN-PGTO-012/014 · D-2026-10-01-111
-- Migration: 20261001120000_acerto_exige_recebimento.sql
--
-- O que esta suíte prova:
--   A1  entrega concluída sem recebimento trava o acerto, e nada é gravado;
--   A2  o recebimento registrado no acerto ("com o motoboy") libera;
--   A3  o acerto recolhe esse dinheiro para a gaveta: esperado = recebido;
--   A4  o dinheiro entrou no caixa, ligado ao pedido;
--   A5  o pedido deixou de estar "a receber".
--
-- Usa o caixa aberto do ambiente, se houver; senão abre um. Fixtures próprias
-- (sufixo F89). Transação com ROLLBACK: nada persiste.
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
values ('89898989-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona89@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a8989898-0000-0000-0000-000000000001','Dona F89','owner',false,'active'),
  ('a8989898-0000-0000-0000-000000000002','Motoboy F89','driver',true,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active)
values ('b8989898-0000-0000-0000-000000000001','89898989-1111-1111-1111-111111111111','a8989898-0000-0000-0000-000000000001',true);
insert into public.user_roles (app_user_id, role_id)
select 'b8989898-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';

-- Caixa: o aberto do ambiente, ou um novo.
insert into public.cash_sessions (cash_register_id, operational_date, opened_by, opening_amount, status)
select (select id from public.cash_registers order by created_at limit 1), current_date,
       'b8989898-0000-0000-0000-000000000001', 0, 'open'
 where not exists (select 1 from public.cash_sessions where status = 'open');

insert into public.orders (id, tracking_token_hash, fulfillment_type, status,
  customer_name_snapshot, customer_whatsapp_snapshot, subtotal, delivery_fee, total,
  delivery_address_snapshot, delivery_route_distance_km, created_at) values
  ('28989898-0000-0000-0000-000000000001','f89-1','delivery','completed','Cliente F89','11990000089',
   51, 3, 54, '{"logradouro":"Rua F89","numero":"1"}'::jsonb, 2.0, now() - interval '1 hour');
insert into public.order_payment_intents (order_id, payment_method_id, payment_method_name_snapshot,
  payment_method_family_snapshot, amount_expected)
select '28989898-0000-0000-0000-000000000001', id, name, payment_family, 54
  from public.payment_methods where code = 'dinheiro';

insert into public.driver_runs (id, driver_employee_id, created_by, status, departed_at, returned_at)
values ('d8989898-0000-0000-0000-000000000001','a8989898-0000-0000-0000-000000000002',
        'b8989898-0000-0000-0000-000000000001','settling', now() - interval '40 minutes', now() - interval '5 minutes');
insert into public.driver_run_orders (driver_run_id, order_id, assigned_by, delivery_status, delivered_at)
values ('d8989898-0000-0000-0000-000000000001','28989898-0000-0000-0000-000000000001',
        'b8989898-0000-0000-0000-000000000001','delivered', now() - interval '20 minutes');

-- -----------------------------------------------------------------------------
-- A. ACERTO
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"89898989-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('A1 entrega sem recebimento trava o acerto', 'false|true|1',
  (select concat_ws('|', r ->> 'ok', r ->> 'sem_recebimento', r ->> 'pedidos_sem_pagamento')
     from (select public.conciliar_corrida('d8989898-0000-0000-0000-000000000001',
             '{"devolvido": 54, "motivo": "teste"}'::jsonb) r) t));

select pg_temp.checar('A2 receber no acerto, com o motoboy, é aceito', 'true',
  (public.registrar_pagamento('28989898-0000-0000-0000-000000000001', jsonb_build_object(
     'idempotency_key', gen_random_uuid(),
     'linhas', jsonb_build_array(jsonb_build_object(
       'forma_id', (select id from public.payment_methods where code = 'dinheiro'),
       'valor', 54, 'na_gaveta', false)))) ->> 'ok'));

select pg_temp.checar('A3 o acerto fecha e recolhe exatamente o recebido', 'true|54.00|54|0.00',
  (select concat_ws('|', r ->> 'ok', r ->> 'esperado', r ->> 'devolvido', r ->> 'diferenca')
     from (select public.conciliar_corrida('d8989898-0000-0000-0000-000000000001',
             '{"devolvido": 54}'::jsonb) r) t));
reset role;

select pg_temp.checar('A4 o dinheiro entrou no caixa, ligado ao pedido', '1|54.00',
  (select count(*) || '|' || sum(amount)::text from public.cash_movements
    where order_id = '28989898-0000-0000-0000-000000000001'
      and movement_type = 'sale_receipt' and direction = 'in'));

select pg_temp.checar('A5 o pedido deixou de estar a receber', 'false',
  (select (payment_status in ('pending', 'reversed'))::text from public.orders
    where id = '28989898-0000-0000-0000-000000000001'));

-- -----------------------------------------------------------------------------
-- RESULTADO
-- -----------------------------------------------------------------------------
select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
