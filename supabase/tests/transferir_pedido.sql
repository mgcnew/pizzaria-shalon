-- =============================================================================
-- TESTES DO TRANSFERIR PEDIDO — D-2026-11-19-190 (migration 0184)
-- CLAUDE.md §16, §21, §29, §33, §34
-- Transação com ROLLBACK: nada fica gravado.
--
-- NO DEV, OS PEDIDOS SÃO REAIS. `order_number_seq` não volta com o rollback,
-- então o teste guarda onde a sequência estava e a devolve no fim, se nenhum
-- pedido de verdade entrou enquanto ele rodava.
-- =============================================================================
begin;

select set_config('teste.sequencia', (select last_value::text from public.order_number_seq), true);

create temporary table resultado_teste (
  n serial, cenario text, esperado text, obtido text, passou boolean
) on commit drop;
grant all on resultado_teste to authenticated;
grant all on sequence resultado_teste_n_seq to authenticated;

create or replace function pg_temp.checar(p_cenario text, p_esperado text, p_obtido text)
returns void language plpgsql as $$
begin
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido);
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('91919191-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona91@teste.local','x',now(),now(),now()),
  ('91919191-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','observador91@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a9191919-0000-0000-0000-000000000001','Dona T9','owner',false,'active'),
  ('a9191919-0000-0000-0000-000000000003','Observador T9','counter',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b9191919-0000-0000-0000-000000000001','91919191-1111-1111-1111-111111111111','a9191919-0000-0000-0000-000000000001',true),
  ('b9191919-0000-0000-0000-000000000003','91919191-3333-3333-3333-333333333333','a9191919-0000-0000-0000-000000000003',true);
insert into public.user_roles (app_user_id, role_id)
select 'b9191919-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.roles (id, name, description, is_system, is_active)
values ('c9191919-0000-0000-0000-00000000000f','Observador T9','So visualiza', false, true);
insert into public.role_permissions (role_id, permission_id)
select 'c9191919-0000-0000-0000-00000000000f', id from public.permissions where code = 'orders.view';
insert into public.user_roles (app_user_id, role_id)
values ('b9191919-0000-0000-0000-000000000003','c9191919-0000-0000-0000-00000000000f');

update public.store_settings set delivery_minimum_enabled = false;
delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order)
values ('d9191919-0000-0000-0000-000000000001','Grande T9', 8, 2, 891);
insert into public.categories (id, name, slug, sort_order)
values ('c9191919-0000-0000-0000-000000000001','Pizzas T9','pizzas-t9', 891);
insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active)
values ('b9191919-1000-0000-0000-000000000001','c9191919-0000-0000-0000-000000000001','pizza','Calabresa T9','calabresa-t9', 1, true);
insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available)
values ('a9191919-1000-0000-0000-000000000001','b9191919-1000-0000-0000-000000000001','d9191919-0000-0000-0000-000000000001', 50.00, true, true);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);

-- Atalhos do teste: quem roda o cenário não tem (nem deve ter) escrita direta.
create or replace function pg_temp.forcar_status(p_id uuid, p_status text)
returns void language sql security definer as $$
  update public.orders set status = p_status where id = p_id;
$$;
-- Pedido de entrega pronto, com R$ 5 de taxa.
create or replace function pg_temp.virar_entrega(p_id uuid)
returns void language sql security definer as $$
  update public.orders
     set fulfillment_type = 'delivery', status = 'ready_for_delivery',
         delivery_fee = 5, total = subtotal + 5, delivery_route_distance_km = 2,
         delivery_address_snapshot = '{"logradouro":"Rua T","numero":"9"}'::jsonb
   where id = p_id;
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"91919191-1111-1111-1111-111111111111","role":"authenticated"}';
select public.abrir_caixa('{"fundo":0}'::jsonb);

create or replace function pg_temp.pedido()
returns uuid language plpgsql as $$
declare v_idem text := gen_random_uuid()::text; v_r jsonb;
begin
  v_r := public.criar_pedido(jsonb_build_object(
    'idempotency_key', v_idem,
    'tracking_token', md5(v_idem) || md5(v_idem || ':2'),
    'origem', 'counter', 'modalidade', 'pickup',
    'cliente', jsonb_build_object('nome', 'Cliente A T9', 'whatsapp', '11970000001'),
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id','b9191919-1000-0000-0000-000000000001',
      'variacao_id','a9191919-1000-0000-0000-000000000001','quantidade', 2)),
    'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))), '');
  return (v_r ->> 'pedido_id')::uuid;
end;
$$;

create or replace function pg_temp.transferir(p_id uuid, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select public.transferir_pedido(p_id,
    jsonb_build_object('nome', 'Cliente B T9', 'whatsapp', '11970000002',
                       'motivo', 'Cliente A desistiu') || p_extra);
$$;

do $$
declare
  v_id uuid; v_r jsonb; v_o record; v_token text; v_cliente_a uuid;
begin
  -- RECUSAS ------------------------------------------------------------------
  v_id := pg_temp.pedido();
  perform pg_temp.checar('pedido não pronto recusa', 'false',
    pg_temp.transferir(v_id) ->> 'ok');

  perform pg_temp.forcar_status(v_id, 'ready_for_pickup');
  perform pg_temp.checar('sem motivo recusa', 'false',
    pg_temp.transferir(v_id, '{"motivo":""}') ->> 'ok');
  perform pg_temp.checar('sem nome recusa', 'false',
    pg_temp.transferir(v_id, '{"nome":" "}') ->> 'ok');
  perform pg_temp.checar('mesmo cliente recusa', 'false',
    pg_temp.transferir(v_id, '{"whatsapp":"(11) 97000-0001"}') ->> 'ok');

  -- RETIRADA PRONTA ------------------------------------------------------------
  select customer_id, tracking_token_hash into v_cliente_a, v_token from public.orders where id = v_id;
  v_r := pg_temp.transferir(v_id);
  perform pg_temp.checar('retirada pronta transfere', 'true', v_r ->> 'ok');
  select * into v_o from public.orders where id = v_id;
  perform pg_temp.checar('nome passa a ser de B', 'Cliente B T9', v_o.customer_name_snapshot);
  perform pg_temp.checar('WhatsApp passa a ser de B', '11970000002', v_o.customer_whatsapp_snapshot);
  perform pg_temp.checar('cadastro passa a ser o de B', 'true',
    (v_o.customer_id is not null and v_o.customer_id <> v_cliente_a
     and v_o.customer_id = (select id from public.customers where whatsapp_normalized = '11970000002'))::text);
  perform pg_temp.checar('link de A deixa de abrir o pedido', 'true', (v_o.tracking_token_hash <> v_token)::text);
  perform pg_temp.checar('continua pronto para retirada', 'ready_for_pickup', v_o.status);
  perform pg_temp.checar('total não muda na retirada', '100.00', v_o.total::text);
  perform pg_temp.checar('auditoria guarda quem era', 'Cliente A T9',
    (select a.before_data ->> 'nome' from public.audit_logs a
      where a.entity_id = v_id and a.action = 'pedido_transferir'));

  -- ENTREGA PRONTA -------------------------------------------------------------
  v_id := pg_temp.pedido();
  perform pg_temp.virar_entrega(v_id);
  v_r := pg_temp.transferir(v_id, '{"whatsapp":""}');
  perform pg_temp.checar('entrega pronta transfere', 'true', v_r ->> 'ok');
  select * into v_o from public.orders where id = v_id;
  perform pg_temp.checar('entrega vira retirada', 'pickup', v_o.fulfillment_type);
  perform pg_temp.checar('status vira pronto para retirada', 'ready_for_pickup', v_o.status);
  perform pg_temp.checar('taxa sai', '0.00', v_o.delivery_fee::text);
  perform pg_temp.checar('total sem a taxa', '100.00', v_o.total::text);
  perform pg_temp.checar('endereço sai', 'true', (v_o.delivery_address_snapshot is null)::text);
  perform pg_temp.checar('sem WhatsApp fica sem cadastro', 'true', (v_o.customer_id is null)::text);
  perform pg_temp.checar('histórico registra a mudança de status', '1',
    (select count(*)::text from public.order_status_history h
      where h.order_id = v_id and h.from_status = 'ready_for_delivery' and h.to_status = 'ready_for_pickup'));

  -- PAGO ---------------------------------------------------------------------
  v_id := pg_temp.pedido();
  perform pg_temp.forcar_status(v_id, 'ready_for_pickup');
  perform public.registrar_pagamento(v_id, jsonb_build_object(
    'idempotency_key', gen_random_uuid()::text,
    'linhas', jsonb_build_array(jsonb_build_object(
      'forma_id', current_setting('teste.dinheiro', true), 'valor', 100))));
  v_r := pg_temp.transferir(v_id);
  perform pg_temp.checar('pago recusa', 'pagamento_confirmado', v_r ->> 'bloqueio');
  perform pg_temp.checar('pago continua de A', 'Cliente A T9',
    (select customer_name_snapshot from public.orders where id = v_id));
end;
$$;

set local request.jwt.claims = '{"sub":"91919191-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_id uuid;
begin
  select id into v_id from public.orders where customer_name_snapshot = 'Cliente B T9' limit 1;
  perform pg_temp.checar('sem permissão recusa', 'false',
    pg_temp.transferir(v_id, '{"nome":"Outro"}') ->> 'ok');
end;
$$;

reset role;
do $$
declare v_inicio bigint := current_setting('teste.sequencia')::bigint;
begin
  if not exists (select 1 from public.orders o
                  where o.order_number > v_inicio
                    and o.customer_name_snapshot not like '%T9%') then
    perform setval('public.order_number_seq', v_inicio, true);
  end if;
end;
$$;

select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select case when count(*) filter (where not passou) = 0 then 'TUDO PASSOU' else 'FALHOU' end as resumo from resultado_teste;

rollback;
