-- =============================================================================
-- LIMPEZA DA MASSA DA FASE 9 — remove exatamente o que `massa_fase9.sql` criou
--
-- Tudo que a massa cria é nomeado com o prefixo `DEV `, e é por ele que este
-- script encontra o que apagar. A ordem das remoções segue as chaves
-- estrangeiras, que são todas `RESTRICT`: filho primeiro, pai depois.
--
-- O QUE ESTE SCRIPT **NÃO** APAGA, e não deve apagar:
--
--   `audit_logs` — CLAUDE.md §33 proíbe que a auditoria seja apagada por
--   conveniência, e uma massa de teste não é motivo para abrir exceção. As
--   linhas de auditoria da massa permanecem, referenciando entidades que
--   deixaram de existir. Isso é uma consequência honesta: a auditoria
--   registra o que ACONTECEU, e essas operações aconteceram mesmo.
--
-- A sessão de caixa que já existia no ambiente NÃO é removida: ela é
-- anterior à massa. Removendo os `cash_movements`, ela volta ao valor
-- esperado que tinha antes.
-- =============================================================================

begin;

create temporary table alvo_pedido on commit drop as
select o.id from public.orders o
  left join public.customers c on c.id = o.customer_id
 where c.name like 'DEV %' or o.customer_name_snapshot like 'DEV %';

create temporary table alvo_corrida on commit drop as
select distinct r.id from public.driver_runs r
  join public.employees e on e.id = r.driver_employee_id
 where e.full_name like 'DEV %';

delete from public.cash_movements
 where order_id in (select id from alvo_pedido)
    or payment_id in (select id from public.payments where order_id in (select id from alvo_pedido));

delete from public.payments where order_id in (select id from alvo_pedido);

delete from public.driver_run_settlements where driver_run_id in (select id from alvo_corrida);
delete from public.delivery_transfers
 where from_run_id in (select id from alvo_corrida)
    or to_run_id in (select id from alvo_corrida)
    or order_id in (select id from alvo_pedido);
delete from public.employee_ledger_entries
 where related_driver_run_id in (select id from alvo_corrida)
    or employee_id in (select id from public.employees where full_name like 'DEV %');
delete from public.driver_run_orders where driver_run_id in (select id from alvo_corrida);
delete from public.driver_runs where id in (select id from alvo_corrida);

delete from public.remarketing_contacts
 where customer_id in (select id from public.customers where name like 'DEV %');

delete from public.order_status_history where order_id in (select id from alvo_pedido);
delete from public.order_payment_intents where order_id in (select id from alvo_pedido);
delete from public.order_item_flavors
 where order_item_id in (select id from public.order_items
                          where order_id in (select id from alvo_pedido));
delete from public.order_items where order_id in (select id from alvo_pedido);
delete from public.orders where id in (select id from alvo_pedido);

delete from public.marketing_consent_history
 where customer_id in (select id from public.customers where name like 'DEV %');
delete from public.customer_addresses
 where customer_id in (select id from public.customers where name like 'DEV %');
delete from public.customers where name like 'DEV %';

delete from public.internal_product_movements
 where reason like 'Massa DEV:%';

delete from public.remarketing_templates where name like 'DEV %';

delete from public.product_variants
 where product_id in (select id from public.products where name like 'DEV %');
delete from public.products where name like 'DEV %';

delete from public.employees where full_name like 'DEV %';

-- Configuração temporária: o ambiente volta a NÃO ter loja configurada, que
-- era o estado anterior medido antes da massa.
delete from public.delivery_fee_bands;
delete from public.store_hours;
delete from public.store_settings where id = 'deadbeef-0000-0000-0000-0000000000d0';

commit;
