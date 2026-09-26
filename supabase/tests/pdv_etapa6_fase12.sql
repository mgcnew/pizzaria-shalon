-- =============================================================================
-- VENDA DE BALCÃO — FASE 12, ETAPA 6
--
-- 09-PDV-FRENTE-DE-CAIXA.md §1.1, §1.2, §1.8, §4.1 · D-2026-09-26-81
--
-- AS PERGUNTAS QUE ESTE ARQUIVO RESPONDE:
--
-- 1. a venda de balcão sem cliente passa, e nasce do jeito certo? (bloco A)
-- 2. as quatro condições do ramo anônimo SEGURAM? (bloco B — é o bloco que
--    importa: cada condição é testada pela sua negação)
-- 3. o caminho com cliente continua idêntico ao de antes? (bloco C)
-- 4. preço e disponibilidade continuam sendo do servidor? (bloco D)
-- 5. caixa fechado bloqueia montar/salvar venda? (bloco E — não bloqueia)
--
-- NENHUMA CONTAGEM ABSOLUTA: o DEV tem pedidos e clientes reais. Tudo aqui é
-- delta ou pergunta sobre ESTE pedido.
--
-- Transação com ROLLBACK: nada é persistido.
-- =============================================================================

begin;

create temporary table resultado_teste (
  n serial, cenario text, esperado text, obtido text, passou boolean
) on commit drop;
grant all on resultado_teste to anon, authenticated;
grant all on sequence resultado_teste_n_seq to anon, authenticated;

create or replace function pg_temp.checar(p_cenario text, p_esperado text, p_obtido text)
returns void language plpgsql as $h$
begin insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido); end; $h$;

/** Campo do pedido criado. */
create or replace function pg_temp.campo(p_pedido uuid, p_campo text)
returns text language plpgsql security definer as $h$
declare v text;
begin
  execute format('select (%I)::text from public.orders where id = $1', p_campo)
    into v using p_pedido;
  return v;
end; $h$;

create or replace function pg_temp.clientes() returns integer
language sql security definer as $h$ select count(*)::integer from public.customers; $h$;

create or replace function pg_temp.pagamentos(p_pedido uuid) returns integer
language sql security definer as $h$
  select count(*)::integer from public.payments where order_id = p_pedido; $h$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('99999999-6666-1111-1111-111111111111','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','balcao6@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status)
values ('a7a7a7a7-0000-0000-0000-000000000001','Balcao E6','owner',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active)
values ('b7b7b7b7-0000-0000-0000-000000000001','99999999-6666-1111-1111-111111111111',
        'a7a7a7a7-0000-0000-0000-000000000001',true);
insert into public.roles (id, name, description, is_system, is_active)
values ('c7c7c7c7-0000-0000-0000-00000000000a','Balcao E6','lanca venda de balcao',false,true);
insert into public.role_permissions (role_id, permission_id)
select 'c7c7c7c7-0000-0000-0000-00000000000a', id from public.permissions
 -- `payments.register` e permissao de FIXTURE, e so por causa do A16:
 -- `pedidos_a_receber()` a exige no corpo, entao sem ela a fila viria vazia e
 -- o cenario passaria a medir a permissao em vez da venda. Nada na Etapa 6
 -- depende dela -- a venda exige `orders.create_manual`, e receber e a Etapa 7.
 where code in ('orders.view','orders.accept','orders.create_manual','catalog.view',
                'payments.register');
insert into public.user_roles (app_user_id, role_id)
values ('b7b7b7b7-0000-0000-0000-000000000001','c7c7c7c7-0000-0000-0000-00000000000a');

delete from public.cash_movements;
delete from public.cash_session_corrections;
delete from public.cash_sessions;
delete from public.store_settings;
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code, latitude, longitude,
  automatic_delivery_radius_km, delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values ('c7c7c7c7-0000-0000-0000-0000000000f1','Shalon E6','5500000000000','Rua T','1','Centro',
          'Cidade','XX','00000-000', -20.0, -40.0, 10.0, 40, 60, 20, 30, true, 'America/Sao_Paulo');
delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;
delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 10, 5.00, true, 1);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order)
values ('e7e7e7e7-0000-0000-0000-00000000000f','G E6',8,2,1);
insert into public.categories (id, name, slug, sort_order)
values ('d7d7d7d7-0000-0000-0000-00000000000c','Cat E6','cat-e6',1);
insert into public.products (id, category_id, product_type, name, slug, base_price,
                             sort_order, is_active, is_temporarily_available) values
  ('d7d7d7d7-0000-0000-0000-000000000001','d7d7d7d7-0000-0000-0000-00000000000c','drink',
   'Refri E6','refri-e6',10.00,1,true,true),
  ('d7d7d7d7-0000-0000-0000-000000000002','d7d7d7d7-0000-0000-0000-00000000000c','pizza',
   'Pizza E6','pizza-e6',null,2,true,true),
  ('d7d7d7d7-0000-0000-0000-000000000003','d7d7d7d7-0000-0000-0000-00000000000c','drink',
   'Acabou E6','acabou-e6',7.00,3,true,false);
insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available)
values ('f7f7f7f7-0000-0000-0000-000000000001','d7d7d7d7-0000-0000-0000-000000000002',
        'e7e7e7e7-0000-0000-0000-00000000000f', 40.00, true, true);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
select set_config('teste.credito', (select id::text from public.payment_methods where code='credito'), true);
-- BANDEIRA DE FIXTURE, nao a do ambiente. O DEV nao tem NENHUMA bandeira
-- ativa cadastrada hoje, e depender disso faria o cenario D8 medir a ausencia
-- de dado operacional em vez da regra do troco -- foi exatamente o que
-- aconteceu no segundo ensaio.
insert into public.payment_brands (id, payment_method_id, name, is_active, sort_order)
select 'a8a8a8a8-0000-0000-0000-00000000000b', m.id, 'Bandeira E6', true, 1
  from public.payment_methods m where m.code = 'credito';
select set_config('teste.bandeira', 'a8a8a8a8-0000-0000-0000-00000000000b', true);

/**
 * A venda, como o PDV a manda: origem `counter`, retirada, e o bloco `cliente`
 * conforme o cenário. `p_cliente` nulo é o balcão anônimo.
 */
create or replace function pg_temp.venda(
  p_idem text, p_cliente jsonb default null, p_origem text default 'counter',
  p_modalidade text default 'pickup', p_itens jsonb default null,
  p_pagamento jsonb default null)
returns jsonb language plpgsql as $h$
begin
  return public.criar_pedido(jsonb_build_object(
    'idempotency_key', p_idem,
    'tracking_token', md5(p_idem) || md5(p_idem || ':2'),
    'origem', p_origem,
    'modalidade', p_modalidade,
    'cliente', coalesce(p_cliente, '{}'::jsonb),
    'itens', coalesce(p_itens, jsonb_build_array(jsonb_build_object(
      'produto_id','d7d7d7d7-0000-0000-0000-000000000001','quantidade',1))),
    'pagamento', coalesce(p_pagamento,
      jsonb_build_object('forma_id', current_setting('teste.dinheiro', true)))
  ), '');
end; $h$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-6666-1111-1111-111111111111","role":"authenticated"}';

-- =============================================================================
-- BLOCO A — A VENDA DE BALCÃO SEM CLIENTE
-- =============================================================================
select set_config('teste.clientes_antes', pg_temp.clientes()::text, true);
select set_config('teste.a', pg_temp.venda('77000001-0000-0000-0000-000000000001')::text, true);

select pg_temp.checar('A1 venda de balcao SEM cliente e aceita', 'true',
  (current_setting('teste.a')::jsonb ->> 'ok'));
select set_config('teste.pa', current_setting('teste.a')::jsonb ->> 'pedido_id', true);
select pg_temp.checar('A2 e devolve o numero do pedido', 'true',
  ((current_setting('teste.a')::jsonb ->> 'numero')::bigint > 0)::text);
select pg_temp.checar('A3 sem cliente vinculado', 'NULO',
  coalesce(pg_temp.campo(current_setting('teste.pa')::uuid, 'customer_id'), 'NULO'));
select pg_temp.checar('A4 com o snapshot do nome preenchido: Balcao', 'Balcão',
  pg_temp.campo(current_setting('teste.pa')::uuid, 'customer_name_snapshot'));
select pg_temp.checar('A5 e o snapshot do whatsapp vazio, nao inventado', '',
  pg_temp.campo(current_setting('teste.pa')::uuid, 'customer_whatsapp_snapshot'));
select pg_temp.checar('A6 origem counter', 'counter',
  pg_temp.campo(current_setting('teste.pa')::uuid, 'source'));
select pg_temp.checar('A7 modalidade pickup', 'pickup',
  pg_temp.campo(current_setting('teste.pa')::uuid, 'fulfillment_type'));
-- O CENTRO DESTA ETAPA: a venda nasce devendo.
select pg_temp.checar('A8 nasce com pagamento PENDENTE', 'pending',
  pg_temp.campo(current_setting('teste.pa')::uuid, 'payment_status'));
select pg_temp.checar('A9 e NENHUM pagamento foi criado', '0',
  pg_temp.pagamentos(current_setting('teste.pa')::uuid)::text);
-- RN-MAN-004: lancar internamente ja e aceitar. O que NAO pode e o PDV
-- empurrar o status por conta propria.
select pg_temp.checar('A10 status operacional e o do lancamento interno', 'confirmed',
  pg_temp.campo(current_setting('teste.pa')::uuid, 'status'));
select pg_temp.checar('A11 total calculado pelo SERVIDOR', '10.00',
  pg_temp.campo(current_setting('teste.pa')::uuid, 'total'));
select pg_temp.checar('A12 sem taxa de entrega', '0.00',
  pg_temp.campo(current_setting('teste.pa')::uuid, 'delivery_fee'));
-- A razao de ser da decisao 81: `customers` nao engorda a cada venda.
select pg_temp.checar('A13 NENHUM cliente novo foi criado',
  current_setting('teste.clientes_antes'), pg_temp.clientes()::text);
select pg_temp.checar('A14 a intencao de pagamento foi registrada', '1',
  (select count(*)::text from public.order_payment_intents
    where order_id = current_setting('teste.pa')::uuid));
select pg_temp.checar('A15 com a forma ESPERADA', 'Dinheiro',
  (select payment_method_name_snapshot from public.order_payment_intents
    where order_id = current_setting('teste.pa')::uuid));
-- E fecha o circuito com a Etapa 5.
select pg_temp.checar('A16 e ela JA aparece em pedidos a receber', 'true',
  (select exists (select 1 from public.pedidos_a_receber()
     where id = current_setting('teste.pa')::uuid))::text);

-- =============================================================================
-- BLOCO B — AS QUATRO CONDIÇÕES, TESTADAS PELA NEGAÇÃO
--
-- Cada cenário aqui remove UMA condição e exige que a porta feche. É o bloco
-- que impede a decisão 81 de virar "qualquer um cria pedido sem cliente".
-- =============================================================================

-- 1. origem diferente de counter
select pg_temp.checar('B1 origem whatsapp SEM cliente e recusada', 'false',
  (pg_temp.venda('77000002-0000-0000-0000-000000000002', null, 'whatsapp') ->> 'ok'));
select pg_temp.checar('B2 e com a mensagem de sempre', 'Informe seu nome.',
  (pg_temp.venda('77000003-0000-0000-0000-000000000003', null, 'phone') ->> 'erro'));
select pg_temp.checar('B3 ifood tambem', 'false',
  (pg_temp.venda('77000004-0000-0000-0000-000000000004', null, 'ifood') ->> 'ok'));

-- 2. modalidade diferente de pickup
select pg_temp.checar('B4 balcao com ENTREGA e sem cliente e recusado', 'false',
  (pg_temp.venda('77000005-0000-0000-0000-000000000005', null, 'counter', 'delivery') ->> 'ok'));
select pg_temp.checar('B5 pelo cliente, nao pelo endereco', 'Informe seu nome.',
  (pg_temp.venda('77000006-0000-0000-0000-000000000006', null, 'counter', 'delivery') ->> 'erro'));

-- 3. os DOIS campos vazios; um só não basta
select pg_temp.checar('B6 nome sem telefone continua ERRO',
  'Informe um WhatsApp válido com DDD.',
  (pg_temp.venda('77000007-0000-0000-0000-000000000007',
     '{"nome":"Fulano"}'::jsonb) ->> 'erro'));
select pg_temp.checar('B7 telefone sem nome continua ERRO', 'Informe seu nome.',
  (pg_temp.venda('77000008-0000-0000-0000-000000000008',
     '{"whatsapp":"(11) 96000-0009"}'::jsonb) ->> 'erro'));
select pg_temp.checar('B8 telefone invalido NAO vira venda anonima',
  'Informe um WhatsApp válido com DDD.',
  (pg_temp.venda('77000009-0000-0000-0000-000000000009',
     '{"nome":"Fulano","whatsapp":"123"}'::jsonb) ->> 'erro'));
select pg_temp.checar('B9 nome de uma letra continua recusado', 'Informe seu nome.',
  (pg_temp.venda('7700000a-0000-0000-0000-00000000000a',
     '{"nome":"F","whatsapp":"(11) 96000-0010"}'::jsonb) ->> 'erro'));

-- 4. caminho interno
select pg_temp.checar('B10 o corpo exige o caminho interno para o ramo anonimo', 'true',
  (select prosrc like '%v_interno is not null%' || chr(10) || '%v_origem = ''counter''%'
     from pg_proc where proname='criar_pedido' and pronamespace='public'::regnamespace)::text);
select pg_temp.checar('B11 e o ramo anonimo existe mesmo', 'true',
  (select prosrc like '%v_balcao_anonimo%' from pg_proc
    where proname='criar_pedido' and pronamespace='public'::regnamespace)::text);

-- =============================================================================
-- BLOCO C — O CAMINHO COM CLIENTE NÃO MUDOU
-- =============================================================================
select set_config('teste.c_antes', pg_temp.clientes()::text, true);
select set_config('teste.c', pg_temp.venda('7700000b-0000-0000-0000-00000000000b',
  '{"nome":"Cliente E6","whatsapp":"(11) 96000-0011"}'::jsonb)::text, true);
select pg_temp.checar('C1 balcao COM cliente continua funcionando', 'true',
  (current_setting('teste.c')::jsonb ->> 'ok'));
select set_config('teste.pc', current_setting('teste.c')::jsonb ->> 'pedido_id', true);
select pg_temp.checar('C2 e AGORA sim existe cliente vinculado', 'true',
  (pg_temp.campo(current_setting('teste.pc')::uuid, 'customer_id') is not null)::text);
select pg_temp.checar('C3 com o nome real no snapshot', 'Cliente E6',
  pg_temp.campo(current_setting('teste.pc')::uuid, 'customer_name_snapshot'));
select pg_temp.checar('C4 e o whatsapp normalizado', '11960000011',
  pg_temp.campo(current_setting('teste.pc')::uuid, 'customer_whatsapp_snapshot'));
select pg_temp.checar('C5 o cliente foi criado, como sempre foi',
  (current_setting('teste.c_antes')::integer + 1)::text, pg_temp.clientes()::text);
select pg_temp.checar('C6 e tambem nasce pendente', 'pending',
  pg_temp.campo(current_setting('teste.pc')::uuid, 'payment_status'));

-- =============================================================================
-- BLOCO D — PREÇO E DISPONIBILIDADE CONTINUAM SENDO DO SERVIDOR
-- =============================================================================
select set_config('teste.d1', pg_temp.venda('7700000c-0000-0000-0000-00000000000c', null,
  'counter', 'pickup',
  jsonb_build_array(jsonb_build_object(
    'produto_id','d7d7d7d7-0000-0000-0000-000000000002',
    'variacao_id','f7f7f7f7-0000-0000-0000-000000000001','quantidade',2)))::text, true);
select pg_temp.checar('D1 produto com variante entra pela variante', 'true',
  (current_setting('teste.d1')::jsonb ->> 'ok'));
-- 2 x 40,00: quem multiplicou foi o banco, e e esse numero que vale.
select pg_temp.checar('D2 e o total e do SERVIDOR, nao da tela', '80.00',
  pg_temp.campo((current_setting('teste.d1')::jsonb ->> 'pedido_id')::uuid, 'total'));
select pg_temp.checar('D3 produto indisponivel e recusado', 'false',
  (pg_temp.venda('7700000d-0000-0000-0000-00000000000d', null, 'counter', 'pickup',
    jsonb_build_array(jsonb_build_object(
      'produto_id','d7d7d7d7-0000-0000-0000-000000000003','quantidade',1))) ->> 'ok'));
select pg_temp.checar('D4 carrinho vazio e recusado', 'Seu carrinho está vazio.',
  (pg_temp.venda('7700000e-0000-0000-0000-00000000000e', null, 'counter', 'pickup',
    '[]'::jsonb) ->> 'erro'));
select pg_temp.checar('D5 pizza SEM escolher a variante e recusada', 'false',
  (pg_temp.venda('7700000f-0000-0000-0000-00000000000f', null, 'counter', 'pickup',
    jsonb_build_array(jsonb_build_object(
      'produto_id','d7d7d7d7-0000-0000-0000-000000000002','quantidade',1))) ->> 'ok'));
-- A forma de pagamento e obrigatoria, e e por isso que o PDV pergunta (§24).
select pg_temp.checar('D6 sem forma de pagamento a venda e recusada',
  'Escolha uma forma de pagamento disponível.',
  (pg_temp.venda('77000010-0000-0000-0000-000000000010', null, 'counter', 'pickup',
    null, '{}'::jsonb) ->> 'erro'));
select pg_temp.checar('D7 forma que exige bandeira sem bandeira e recusada', 'false',
  (pg_temp.venda('77000011-0000-0000-0000-000000000011', null, 'counter', 'pickup', null,
    jsonb_build_object('forma_id', current_setting('teste.credito', true))) ->> 'ok'));
-- Troco continua sendo so do dinheiro, e continua sendo da Etapa 7.
-- COM a bandeira: sem ela o erro que volta e o da bandeira, e o cenario
-- passaria falando de outra regra (foi o que aconteceu no primeiro ensaio).
select pg_temp.checar('D8 troco em credito continua recusado',
  'Troco só se aplica a pagamento em dinheiro.',
  (pg_temp.venda('77000012-0000-0000-0000-000000000012', null, 'counter', 'pickup', null,
    jsonb_build_object('forma_id', current_setting('teste.credito', true),
                       'bandeira_id', current_setting('teste.bandeira', true),
                       'precisa_troco', true, 'troco_para', 50)) ->> 'erro'));
-- Idempotencia: o duplo clique do balcao nao cria dois pedidos (§34).
select pg_temp.checar('D9 a mesma tentativa NAO cria segundo pedido', 'true',
  (pg_temp.venda('77000001-0000-0000-0000-000000000001') ->> 'ja_existia'));
select pg_temp.checar('D10 e devolve o mesmo pedido', current_setting('teste.pa'),
  (pg_temp.venda('77000001-0000-0000-0000-000000000001') ->> 'pedido_id'));

-- =============================================================================
-- BLOCO E — CAIXA FECHADO NÃO IMPEDE MONTAR NEM SALVAR (§1.8)
-- =============================================================================
select pg_temp.checar('E1 nao ha caixa aberto', '0',
  (select count(*)::text from public.cash_sessions where status = 'open'));
select set_config('teste.e', pg_temp.venda('77000013-0000-0000-0000-000000000013')::text, true);
select pg_temp.checar('E2 e a venda de balcao e salva assim mesmo', 'true',
  (current_setting('teste.e')::jsonb ->> 'ok'));
select pg_temp.checar('E3 pendente, como manda o fluxo 1.2', 'pending',
  pg_temp.campo((current_setting('teste.e')::jsonb ->> 'pedido_id')::uuid, 'payment_status'));
select pg_temp.checar('E4 e sem pagamento nenhum', '0',
  pg_temp.pagamentos((current_setting('teste.e')::jsonb ->> 'pedido_id')::uuid)::text);
-- Nao e contorno: a funcao nunca olhou caixa.
select pg_temp.checar('E5 criar_pedido nao le cash_sessions', 'false',
  (select prosrc ilike '%cash_session%' from pg_proc
    where proname='criar_pedido' and pronamespace='public'::regnamespace)::text);
select pg_temp.checar('E6 e nao escreve em payments', 'false',
  (select prosrc ilike '%into public.payments%' from pg_proc
    where proname='criar_pedido' and pronamespace='public'::regnamespace)::text);
select pg_temp.checar('E7 nenhuma sessao de caixa foi aberta pela venda', '0',
  (select count(*)::text from public.cash_sessions));

reset role;

select
  case when passou then 'OK    ' else 'FALHOU' end
    || ' | ' || lpad(n::text, 3) || ' | ' || rpad(cenario, 58)
    || ' | esperado=' || coalesce(esperado,'(null)') || ' obtido=' || coalesce(obtido,'(null)') as resultado
from resultado_teste where not passou
union all
select 'TOTAL: ' || count(*) || ' cenarios | PASSARAM: ' || count(*) filter (where passou)
  || ' | FALHARAM: ' || count(*) filter (where not passou)
from resultado_teste;

rollback;
