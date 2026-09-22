-- =============================================================================
-- TESTES DE CAIXA, PAGAMENTO REALIZADO E FINANCEIRO — FASE 7
--
-- 04-REGRAS-NEGOCIO.md RN-CAIXA-001..016, RN-FIN-001..005, RN-PGTO-002..006
-- 03-RLS-RBAC-SEGURANCA.md §16, §17, §33 · CLAUDE.md §24, §25, §27, §28, §34
--
-- AS TRÊS PERGUNTAS DESTE ARQUIVO:
--   1. o dinheiro que o sistema diz que está na gaveta é o que estaria lá?
--   2. alguma coisa confirmada consegue desaparecer?
--   3. alguém faz operação financeira sem a permissão correspondente?
--
-- A primeira é a que mais importa. Cartão e Pix NÃO são papel na gaveta;
-- troco não é receita; dinheiro com quem entregou não está no caixa. Cada um
-- desses tem cenário próprio, porque cada um seria um jeito diferente de
-- fechar o caixa com um número falso.
--
-- Transação com ROLLBACK. Nada é persistido.
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
  ('88888888-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona8@teste.local','x',now(),now(),now()),
  ('88888888-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','atendente8@teste.local','x',now(),now(),now()),
  ('88888888-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','observador8@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a8a8a8a8-0000-0000-0000-000000000001','Dona F7','owner',false,'active'),
  ('a8a8a8a8-0000-0000-0000-000000000002','Atendente F7','counter',false,'active'),
  ('a8a8a8a8-0000-0000-0000-000000000003','Observador F7','counter',false,'active');

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b8b8b8b8-0000-0000-0000-000000000001','88888888-1111-1111-1111-111111111111','a8a8a8a8-0000-0000-0000-000000000001',true),
  ('b8b8b8b8-0000-0000-0000-000000000002','88888888-2222-2222-2222-222222222222','a8a8a8a8-0000-0000-0000-000000000002',true),
  ('b8b8b8b8-0000-0000-0000-000000000003','88888888-3333-3333-3333-333333333333','a8a8a8a8-0000-0000-0000-000000000003',true);

insert into public.user_roles (app_user_id, role_id)
select 'b8b8b8b8-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
select 'b8b8b8b8-0000-0000-0000-000000000002', id from public.roles where name = 'Atendente';

-- Papel que só ENXERGA dinheiro. Prova que ver não é poder mexer.
insert into public.roles (id, name, description, is_system, is_active)
values ('c8c8c8c8-0000-0000-0000-00000000000f','Observador F7','So visualiza', false, true);
insert into public.role_permissions (role_id, permission_id)
select 'c8c8c8c8-0000-0000-0000-00000000000f', id from public.permissions
 where code in ('orders.view','cash.view','finance.view','employees.view');
insert into public.user_roles (app_user_id, role_id)
values ('b8b8b8b8-0000-0000-0000-000000000003','c8c8c8c8-0000-0000-0000-00000000000f');

-- Um papel que enxerga CATÁLOGO e não enxerga financeiro. Serve para provar
-- que metadado de comprovante não vaza pela policy antiga de `media_assets`,
-- que falava só de catálogo.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('88888888-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','catalogo8@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status)
values ('a8a8a8a8-0000-0000-0000-000000000004','Catalogo F7','counter',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active)
values ('b8b8b8b8-0000-0000-0000-000000000004','88888888-4444-4444-4444-444444444444',
        'a8a8a8a8-0000-0000-0000-000000000004',true);
insert into public.roles (id, name, description, is_system, is_active)
values ('c8c8c8c8-0000-0000-0000-00000000000c','Catalogo F7','So catalogo', false, true);
insert into public.role_permissions (role_id, permission_id)
select 'c8c8c8c8-0000-0000-0000-00000000000c', id from public.permissions
 where code in ('catalog.view','catalog.manage');
insert into public.user_roles (app_user_id, role_id)
values ('b8b8b8b8-0000-0000-0000-000000000004','c8c8c8c8-0000-0000-0000-00000000000c');

-- O banco de desenvolvimento pode ter uma sessão de caixa aberta de verdade
-- (alguém operando o painel). Dentro desta transação ela sai do caminho, e o
-- ROLLBACK a devolve intacta: sem isso, `abrir_caixa` encontraria a sessão
-- da pessoa e o teste mediria o estado do ambiente, não a regra.
delete from public.cash_movements;
delete from public.cash_session_corrections;
delete from public.cash_sessions;

delete from public.store_settings;
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code, latitude, longitude,
  automatic_delivery_radius_km,
  delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values (
  'ccccccc8-0000-0000-0000-000000000001','Shalon F7','5500000000000','Rua T','1','Centro',
  'Cidade','XX','00000-000', -23.5, -46.6, 4.0, 40, 60, 20, 30, true, 'America/Sao_Paulo'
);

delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 4, 0.00, true, 1);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d8d8d8d8-0000-0000-0000-000000000001','Grande F7', 8, 2, 801);

insert into public.categories (id, name, slug, sort_order) values
  ('c8c8c8c8-0000-0000-0000-000000000001','Pizzas F7','pizzas-f7', 801);

insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active) values
  ('b8b8b8b8-1000-0000-0000-000000000001','c8c8c8c8-0000-0000-0000-000000000001','pizza','Calabresa F7','calabresa-f7', 1, true);

-- Pizza de R$ 50,00: todo total deste arquivo é múltiplo de 50.
insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available) values
  ('a8a8a8a8-1000-0000-0000-000000000001','b8b8b8b8-1000-0000-0000-000000000001','d8d8d8d8-0000-0000-0000-000000000001', 50.00, true, true);

-- RN-PGTO-006: bandeira é CADASTRO, não enum de domínio. Por isso elas
-- nascem aqui, como linha de tabela.
insert into public.payment_brands (id, payment_method_id, name, is_active, sort_order)
select 'e8e8e8e8-0000-0000-0000-000000000001', m.id, 'Bandeira Debito F7', true, 1
  from public.payment_methods m where m.code = 'debito';
insert into public.payment_brands (id, payment_method_id, name, is_active, sort_order)
select 'e8e8e8e8-0000-0000-0000-000000000002', m.id, 'Bandeira Credito F7', true, 1
  from public.payment_methods m where m.code = 'credito';
insert into public.payment_brands (id, payment_method_id, name, is_active, sort_order)
select 'e8e8e8e8-0000-0000-0000-000000000003', m.id, 'Vale F7', true, 1
  from public.payment_methods m where m.code = 'voucher';

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
select set_config('teste.debito',   (select id::text from public.payment_methods where code='debito'), true);
select set_config('teste.credito',  (select id::text from public.payment_methods where code='credito'), true);
select set_config('teste.voucher',  (select id::text from public.payment_methods where code='voucher'), true);
select set_config('teste.pixmaq',   (select id::text from public.payment_methods where code='pix_maquininha'), true);
select set_config('teste.pixchave', (select id::text from public.payment_methods where code='pix_chave'), true);

-- Pedido manual: nasce `confirmed` (RN-MAN-004) e não precisa do segredo de
-- origem. É o caminho mais curto até um pedido pagável.
create or replace function pg_temp.pedido(p jsonb default '{}'::jsonb)
returns uuid language plpgsql as $$
declare v_idem text := coalesce(p ->> 'idem', gen_random_uuid()::text); v_r jsonb;
begin
  v_r := public.criar_pedido(
    jsonb_build_object(
      'idempotency_key', v_idem,
      'tracking_token', md5(v_idem) || md5(v_idem || ':2'),
      'origem', 'counter',
      'modalidade', coalesce(p ->> 'modalidade', 'pickup'),
      'cliente', jsonb_build_object('nome', 'Cliente F7',
                 'whatsapp', coalesce(p ->> 'whatsapp', '(11) 98000-0001')),
      'endereco', case when coalesce(p ->> 'modalidade','pickup') = 'pickup' then null
                       else jsonb_build_object('logradouro','Rua F','numero','7','bairro','Centro',
                         'cidade','Cidade','uf','XX','latitude',-23.51,'longitude',-46.61,
                         'confianca','exata','provedor','teste') end,
      'rota', case when coalesce(p ->> 'modalidade','pickup') = 'pickup' then null
                   else jsonb_build_object('distancia_km', 2.0, 'provedor','teste') end,
      'itens', jsonb_build_array(jsonb_build_object(
                 'produto_id','b8b8b8b8-1000-0000-0000-000000000001',
                 'variacao_id','a8a8a8a8-1000-0000-0000-000000000001',
                 'quantidade', coalesce((p ->> 'quantidade')::integer, 1))),
      'pagamento', jsonb_build_object('forma_id',
        coalesce(p ->> 'forma', current_setting('teste.dinheiro', true)))
    ), '');
  return (v_r ->> 'pedido_id')::uuid;
end;
$$;

-- Guarda o esperado atual para o próximo cenário comparar a VARIAÇÃO.
-- Asserção por valor absoluto obrigaria recalcular a mão toda a cadeia a
-- cada cenário novo — e o que cada operação precisa provar é o seu efeito.
create or replace function pg_temp.marcar()
returns void language sql as $$
  select set_config('teste.antes',
    coalesce(public.esperado_em_caixa(current_setting('teste.sessao', true)::uuid), 0)::text, true);
  select null::void;
$$;

create or replace function pg_temp.variacao()
returns text language sql as $$
  select (coalesce(public.esperado_em_caixa(current_setting('teste.sessao', true)::uuid), 0)
          - current_setting('teste.antes', true)::numeric)::text;
$$;

create or replace function pg_temp.pagar(p_pedido uuid, p_linhas jsonb, p_idem text default null)
returns jsonb language sql as $$
  select public.registrar_pagamento(p_pedido, jsonb_build_object(
    'linhas', p_linhas,
    'idempotency_key', coalesce(p_idem, gen_random_uuid()::text)));
$$;

-- =============================================================================
-- A. ABERTURA — RN-CAIXA-001/002/006
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-2222-2222-2222-222222222222","role":"authenticated"}';

-- RN-CAIXA-002: R$ 0,00 é fundo válido. Zero é um valor, não ausência.
select pg_temp.checar('abre caixa com fundo zero', 'true',
  (public.abrir_caixa('{"fundo":0}'::jsonb) ->> 'ok'));

select pg_temp.checar('fundo zero fica gravado como 0.00', '0.00',
  (select opening_amount::text from public.cash_sessions where status = 'open'));

select pg_temp.checar('data operacional e a data local de hoje', 'true',
  (select (operational_date = (now() at time zone 'America/Sao_Paulo')::date)::text
     from public.cash_sessions where status = 'open'));

-- RN-CAIXA-006: uma ativa por ponto de caixa.
select pg_temp.checar('segunda abertura e recusada', 'true',
  (public.abrir_caixa('{"fundo":100}'::jsonb) ->> 'ja_aberto'));

select pg_temp.checar('caixa_atual diz que esta aberto', 'true',
  (public.caixa_atual() ->> 'aberto'));

select pg_temp.checar('esperado comeca igual ao fundo', '0.00',
  (public.caixa_atual() ->> 'esperado_em_dinheiro'));

-- Fecha o de fundo zero e abre o de trabalho, com fundo.
select set_config('teste.s0', (select id::text from public.cash_sessions where status='open'), true);
select pg_temp.checar('fecha o caixa de fundo zero sem diferenca', '0.00',
  (public.fechar_caixa('{"contado":0}'::jsonb) ->> 'diferenca'));

select pg_temp.checar('abre caixa com fundo de 200', 'true',
  (public.abrir_caixa('{"fundo":200}'::jsonb) ->> 'ok'));

select set_config('teste.sessao', (select id::text from public.cash_sessions where status='open'), true);

select pg_temp.checar('duas sessoes no mesmo dia sao permitidas', '2',
  (select count(*)::text from public.cash_sessions));

reset role;

-- Sem `cash.open` não abre — e ver o caixa não dá esse direito.
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-3333-3333-3333-333333333333","role":"authenticated"}';

select pg_temp.checar('observador NAO abre caixa', 'Você não tem permissão para abrir o caixa.',
  (public.abrir_caixa('{"fundo":10}'::jsonb) ->> 'erro'));

select pg_temp.checar('observador NAO fecha caixa', 'Você não tem permissão para fechar o caixa.',
  (public.fechar_caixa('{"contado":10}'::jsonb) ->> 'erro'));

select pg_temp.checar('observador ENXERGA o caixa', 'true',
  (public.caixa_atual() ->> 'aberto'));

reset role;

-- =============================================================================
-- B. MEIA-NOITE — RN-CAIXA-004/005/007
-- =============================================================================
-- Simula a sessão aberta ONTEM. A meia-noite não pode ter fechado, criado
-- nem trocado nada: o que muda é só o alerta.
update public.cash_sessions set operational_date = operational_date - 1
 where id = current_setting('teste.sessao', true)::uuid;

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('meia-noite NAO fecha a sessao', 'open',
  (select status from public.cash_sessions where id = current_setting('teste.sessao', true)::uuid));

select pg_temp.checar('meia-noite NAO cria outra sessao', '2',
  (select count(*)::text from public.cash_sessions));

select pg_temp.checar('caixa de ontem ainda aberto gera alerta', 'true',
  (public.caixa_atual() ->> 'alerta_caixa_antigo'));

reset role;

update public.cash_sessions set operational_date = operational_date + 1
 where id = current_setting('teste.sessao', true)::uuid;

-- =============================================================================
-- C. PAGAMENTO REALIZADO — RN-PGTO-002..006
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-2222-2222-2222-222222222222","role":"authenticated"}';

-- ---- dinheiro exato
select set_config('teste.p_dinheiro', pg_temp.pedido('{"idem":"88000001-0000-0000-0000-000000000001"}'::jsonb)::text, true);

select pg_temp.marcar();

select pg_temp.checar('venda em dinheiro e registrada', 'true',
  (pg_temp.pagar(current_setting('teste.p_dinheiro', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.dinheiro', true), 'valor', 50))) ->> 'ok'));

select pg_temp.checar('dinheiro gera movimento de caixa', 'sale_receipt',
  (select movement_type from public.cash_movements
    where order_id = current_setting('teste.p_dinheiro', true)::uuid));

select pg_temp.checar('venda em dinheiro soma 50 ao esperado', '50.00', pg_temp.variacao());

-- ---- dinheiro com troco: a venda NÃO é o que veio na mão
select set_config('teste.p_troco', pg_temp.pedido('{"idem":"88000002-0000-0000-0000-000000000002"}'::jsonb)::text, true);

select pg_temp.marcar();

select pg_temp.checar('troco calculado a partir do recebido', '50.00',
  ((pg_temp.pagar(current_setting('teste.p_troco', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.dinheiro', true),
       'valor', 50, 'recebido', 100))) -> 'linhas' -> 0 ->> 'troco')));

select pg_temp.checar('a venda continua sendo 50, nao 100', '50.00',
  (select amount::text from public.payments
    where order_id = current_setting('teste.p_troco', true)::uuid));

select pg_temp.checar('o caixa recebe o liquido, nao o que veio na mao', '50.00',
  (select amount::text from public.cash_movements
    where order_id = current_setting('teste.p_troco', true)::uuid));

select pg_temp.checar('o esperado somou 50, e nao os 100 recebidos', '50.00', pg_temp.variacao());

-- ---- cartão: NÃO é papel na gaveta
select set_config('teste.p_debito', pg_temp.pedido('{"idem":"88000003-0000-0000-0000-000000000003"}'::jsonb)::text, true);

select pg_temp.marcar();

select pg_temp.checar('debito com bandeira valida e aceito', 'true',
  (pg_temp.pagar(current_setting('teste.p_debito', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.debito', true),
       'bandeira_id', 'e8e8e8e8-0000-0000-0000-000000000001', 'valor', 50))) ->> 'ok'));

select pg_temp.checar('debito NAO gera movimento de caixa', '0',
  (select count(*)::text from public.cash_movements
    where order_id = current_setting('teste.p_debito', true)::uuid));

select pg_temp.checar('cartao NAO muda o dinheiro esperado', '0.00', pg_temp.variacao());

select pg_temp.checar('cartao aparece nos recebimentos por metodo', 'true',
  (select (count(*) > 0)::text
     from jsonb_array_elements(public.caixa_atual() -> 'recebimentos_por_metodo') r
    where r ->> 'familia' = 'debit'));

-- ---- bandeira: validação dinâmica, nunca hardcode
select set_config('teste.p_semband', pg_temp.pedido('{"idem":"88000004-0000-0000-0000-000000000004"}'::jsonb)::text, true);

select pg_temp.checar('debito sem bandeira e recusado', 'true',
  ((pg_temp.pagar(current_setting('teste.p_semband', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.debito', true), 'valor', 50))) ->> 'erro')
   ilike '%bandeira%')::text);

select pg_temp.checar('bandeira de outra forma e recusada', 'true',
  ((pg_temp.pagar(current_setting('teste.p_semband', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.debito', true),
       'bandeira_id', 'e8e8e8e8-0000-0000-0000-000000000002', 'valor', 50))) ->> 'erro')
   ilike '%bandeira%')::text);

select pg_temp.checar('metodo inativo e recusado', 'Forma de pagamento inválida ou inativa.',
  (pg_temp.pagar(current_setting('teste.p_semband', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.pixchave', true), 'valor', 50))) ->> 'erro'));

-- ---- crédito, voucher e Pix na maquininha
select set_config('teste.p_credito', pg_temp.pedido('{"idem":"88000005-0000-0000-0000-000000000005"}'::jsonb)::text, true);
select pg_temp.checar('credito com bandeira e aceito', 'true',
  (pg_temp.pagar(current_setting('teste.p_credito', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.credito', true),
       'bandeira_id', 'e8e8e8e8-0000-0000-0000-000000000002', 'valor', 50))) ->> 'ok'));

select set_config('teste.p_voucher', pg_temp.pedido('{"idem":"88000006-0000-0000-0000-000000000006"}'::jsonb)::text, true);
select pg_temp.checar('voucher com bandeira e aceito', 'true',
  (pg_temp.pagar(current_setting('teste.p_voucher', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.voucher', true),
       'bandeira_id', 'e8e8e8e8-0000-0000-0000-000000000003', 'valor', 50))) ->> 'ok'));

select set_config('teste.p_pix', pg_temp.pedido('{"idem":"88000007-0000-0000-0000-000000000007"}'::jsonb)::text, true);
select pg_temp.marcar();

select pg_temp.checar('pix na maquininha e aceito', 'true',
  (pg_temp.pagar(current_setting('teste.p_pix', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.pixmaq', true), 'valor', 50))) ->> 'ok'));

select pg_temp.checar('pix NAO entra no dinheiro fisico', '0.00', pg_temp.variacao());

-- ---- split
select set_config('teste.p_split', pg_temp.pedido('{"idem":"88000008-0000-0000-0000-000000000008","quantidade":2}'::jsonb)::text, true);

select pg_temp.marcar();

select pg_temp.checar('split de dinheiro mais debito fecha o total', 'true',
  (pg_temp.pagar(current_setting('teste.p_split', true)::uuid,
     jsonb_build_array(
       jsonb_build_object('forma_id', current_setting('teste.dinheiro', true), 'valor', 60),
       jsonb_build_object('forma_id', current_setting('teste.debito', true),
                          'bandeira_id', 'e8e8e8e8-0000-0000-0000-000000000001', 'valor', 40))) ->> 'ok'));

select pg_temp.checar('split grava duas linhas de pagamento', '2',
  (select count(*)::text from public.payments
    where order_id = current_setting('teste.p_split', true)::uuid));

select pg_temp.checar('do split, so os 60 em dinheiro entraram na gaveta', '60.00', pg_temp.variacao());

select set_config('teste.p_split2', pg_temp.pedido('{"idem":"88000009-0000-0000-0000-000000000009","quantidade":2}'::jsonb)::text, true);

select pg_temp.checar('split que nao fecha o total e recusado', 'true',
  (pg_temp.pagar(current_setting('teste.p_split2', true)::uuid,
     jsonb_build_array(
       jsonb_build_object('forma_id', current_setting('teste.dinheiro', true), 'valor', 60),
       jsonb_build_object('forma_id', current_setting('teste.debito', true),
                          'bandeira_id', 'e8e8e8e8-0000-0000-0000-000000000001', 'valor', 30)))
   ->> 'soma_divergente'));

select pg_temp.checar('split recusado NAO grava nada', '0',
  (select count(*)::text from public.payments
    where order_id = current_setting('teste.p_split2', true)::uuid));

select pg_temp.checar('mesma forma duas vezes no split e recusada', 'true',
  ((pg_temp.pagar(current_setting('teste.p_split2', true)::uuid,
     jsonb_build_array(
       jsonb_build_object('forma_id', current_setting('teste.dinheiro', true), 'valor', 50),
       jsonb_build_object('forma_id', current_setting('teste.dinheiro', true), 'valor', 50)))
   ->> 'erro') ilike '%duas vezes%')::text);

-- §24: sem tolerância de arredondamento.
select pg_temp.checar('valor com tres decimais e recusado', 'Valor com mais de dois decimais.',
  (pg_temp.pagar(current_setting('teste.p_split2', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.dinheiro', true), 'valor', 100.005))) ->> 'erro'));

select pg_temp.checar('troco em cartao e recusado', 'Troco só se aplica a pagamento em dinheiro.',
  (pg_temp.pagar(current_setting('teste.p_split2', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.debito', true),
       'bandeira_id', 'e8e8e8e8-0000-0000-0000-000000000001',
       'valor', 100, 'recebido', 120))) ->> 'erro'));

-- ---- esperado × realizado (RN-PGTO-002)
select pg_temp.checar('pagar diferente do esperado e sinalizado', 'true',
  (pg_temp.pagar(current_setting('teste.p_split2', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.debito', true),
       'bandeira_id', 'e8e8e8e8-0000-0000-0000-000000000001', 'valor', 100)))
   ->> 'divergiu_do_esperado'));

select pg_temp.checar('a INTENCAO do checkout continua dizendo dinheiro', 'Dinheiro',
  (select payment_method_name_snapshot from public.order_payment_intents
    where order_id = current_setting('teste.p_split2', true)::uuid));

select pg_temp.checar('o REALIZADO diz cartao de debito', 'Cartão de débito',
  (select payment_method_name_snapshot from public.payments
    where order_id = current_setting('teste.p_split2', true)::uuid));

select pg_temp.checar('projecao mostra esperado e realizado lado a lado', 'true',
  ((public.pagamento_do_pedido(current_setting('teste.p_split2', true)::uuid) -> 'esperado' ->> 'metodo') = 'Dinheiro'
   and (public.pagamento_do_pedido(current_setting('teste.p_split2', true)::uuid) -> 'realizado' -> 0 ->> 'metodo') = 'Cartão de débito')::text);

-- ---- idempotência e repetição
select set_config('teste.p_idem', pg_temp.pedido('{"idem":"88000010-0000-0000-0000-000000000010"}'::jsonb)::text, true);

select pg_temp.checar('primeiro envio do pagamento registra', 'false',
  (pg_temp.pagar(current_setting('teste.p_idem', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.dinheiro', true), 'valor', 50)),
     '88000010-0000-0000-0000-0000000000aa') ->> 'ja_existia'));

select pg_temp.checar('reenvio do mesmo pagamento nao duplica', 'true',
  (pg_temp.pagar(current_setting('teste.p_idem', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.dinheiro', true), 'valor', 50)),
     '88000010-0000-0000-0000-0000000000aa') ->> 'ja_existia'));

select pg_temp.checar('o pedido continua com uma linha de pagamento', '1',
  (select count(*)::text from public.payments
    where order_id = current_setting('teste.p_idem', true)::uuid));

select pg_temp.checar('pedido ja pago recusa novo pagamento', 'true',
  (pg_temp.pagar(current_setting('teste.p_idem', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.dinheiro', true), 'valor', 50))) ->> 'ja_pago'));

-- ---- invariante 13: retirada não conclui sem pagamento
select set_config('teste.p_conclui', pg_temp.pedido('{"idem":"88000011-0000-0000-0000-000000000011"}'::jsonb)::text, true);
select public.comando_pedido(current_setting('teste.p_conclui', true)::uuid, 'iniciar_producao');
select public.comando_pedido(current_setting('teste.p_conclui', true)::uuid, 'marcar_pronto');

select pg_temp.checar('retirada NAO conclui sem pagamento registrado', 'pagamento',
  (public.comando_pedido(current_setting('teste.p_conclui', true)::uuid, 'concluir') ->> 'bloqueio'));

select public.registrar_pagamento(current_setting('teste.p_conclui', true)::uuid,
  jsonb_build_object('linhas', jsonb_build_array(jsonb_build_object(
    'forma_id', current_setting('teste.dinheiro', true), 'valor', 50))));

select pg_temp.checar('com o pagamento registrado a retirada conclui', 'completed',
  (public.comando_pedido(current_setting('teste.p_conclui', true)::uuid, 'concluir') ->> 'status'));

-- ---- dinheiro que NÃO entrou na gaveta (RN-CAIXA-014)
select set_config('teste.p_fora', pg_temp.pedido('{"idem":"88000012-0000-0000-0000-000000000012","modalidade":"delivery","whatsapp":"(11) 98000-0002"}'::jsonb)::text, true);

select pg_temp.marcar();

select pg_temp.checar('recebimento fora da gaveta e aceito', 'true',
  (pg_temp.pagar(current_setting('teste.p_fora', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.dinheiro', true),
       'valor', 50, 'na_gaveta', false))) ->> 'ok'));

select pg_temp.checar('dinheiro fora da gaveta NAO entra no esperado', '0.00', pg_temp.variacao());

select pg_temp.checar('dinheiro fora da gaveta e contabilizado a parte', '50.00',
  public.dinheiro_fora_da_gaveta()::text);

reset role;

-- Sem `payments.register` não registra recebimento.
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-3333-3333-3333-333333333333","role":"authenticated"}';

select pg_temp.checar('observador NAO registra pagamento',
  'Você não tem permissão para registrar pagamento.',
  (pg_temp.pagar(current_setting('teste.p_semband', true)::uuid,
     jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.dinheiro', true), 'valor', 50))) ->> 'erro'));

reset role;

-- =============================================================================
-- D. SANGRIA, REFORÇO E AJUSTE — RN-CAIXA-008/009
-- =============================================================================
-- O Atendente padrão NÃO tem `cash.adjust` (03 §32): sangria é do Dono.
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('atendente NAO faz sangria',
  'Você não tem permissão para movimentar o caixa.',
  (public.movimentar_caixa('{"tipo":"withdrawal","valor":50,"motivo":"tentativa"}'::jsonb) ->> 'erro'));

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.marcar();

select pg_temp.checar('sangria e registrada', 'true',
  (public.movimentar_caixa('{"tipo":"withdrawal","valor":100,"motivo":"Deposito no cofre"}'::jsonb) ->> 'ok'));

select pg_temp.checar('sangria REDUZ o esperado em 100', '-100.00', pg_temp.variacao());

select pg_temp.checar('sangria sem motivo e recusada', 'Informe o motivo.',
  (public.movimentar_caixa('{"tipo":"withdrawal","valor":10}'::jsonb) ->> 'erro'));

select pg_temp.checar('sangria maior que o caixa e recusada', 'true',
  ((public.movimentar_caixa('{"tipo":"withdrawal","valor":99999,"motivo":"tentativa"}'::jsonb)
    ->> 'erro') ilike '%maior que o dinheiro%')::text);

select pg_temp.marcar();

select pg_temp.checar('reforco e registrado', 'true',
  (public.movimentar_caixa('{"tipo":"supply","valor":40}'::jsonb) ->> 'ok'));

select pg_temp.checar('reforco AUMENTA o esperado em 40', '40.00', pg_temp.variacao());

-- CLAUDE.md §34: dupla sangria.
select pg_temp.marcar();

select pg_temp.checar('primeira sangria com chave registra', 'false',
  (public.movimentar_caixa(jsonb_build_object('tipo','withdrawal','valor',20,
     'motivo','Troco para o balcao',
     'idempotency_key','88000020-0000-0000-0000-000000000020')) ->> 'ja_existia'));

select pg_temp.checar('reenvio da mesma sangria nao duplica', 'true',
  (public.movimentar_caixa(jsonb_build_object('tipo','withdrawal','valor',20,
     'motivo','Troco para o balcao',
     'idempotency_key','88000020-0000-0000-0000-000000000020')) ->> 'ja_existia'));

select pg_temp.checar('a sangria de 20 saiu do caixa uma vez so', '-20.00', pg_temp.variacao());

-- ---- reversão de movimento
select set_config('teste.mov', (select id::text from public.cash_movements
  where movement_type = 'supply' order by created_at desc limit 1), true);

select pg_temp.marcar();

select pg_temp.checar('reverter reforco cria compensatorio', 'true',
  (public.reverter_movimento_caixa(current_setting('teste.mov', true)::uuid,
     'Reforco lancado em duplicidade') ->> 'ok'));

select pg_temp.checar('o original NAO foi apagado', 'true',
  (select (count(*) = 1)::text from public.cash_movements
    where id = current_setting('teste.mov', true)::uuid));

select pg_temp.checar('o original guarda quem reverteu', 'true',
  (select (reversed_by is not null and reversed_at is not null)::text
     from public.cash_movements where id = current_setting('teste.mov', true)::uuid));

select pg_temp.checar('o compensatorio aponta para o original', 'true',
  (select (count(*) = 1)::text from public.cash_movements
    where reverses_movement_id = current_setting('teste.mov', true)::uuid));

select pg_temp.checar('o compensatorio desfez os 40 do reforco', '-40.00', pg_temp.variacao());

select pg_temp.checar('dupla reversao e recusada', 'true',
  (public.reverter_movimento_caixa(current_setting('teste.mov', true)::uuid,
     'De novo') ->> 'ja_revertido'));

-- =============================================================================
-- E. FINANCEIRO — RN-FIN-001..004, RN-CAIXA-010
-- =============================================================================
select pg_temp.checar('cria categoria de despesa', 'true',
  (public.salvar_categoria_financeira('{"nome":"Fornecedores F7","tipo":"expense"}'::jsonb) ->> 'ok'));

select pg_temp.checar('cria categoria de entrada', 'true',
  (public.salvar_categoria_financeira('{"nome":"Outras entradas F7","tipo":"income"}'::jsonb) ->> 'ok'));

select pg_temp.checar('categoria com nome repetido e recusada', 'Já existe uma categoria com esse nome.',
  (public.salvar_categoria_financeira('{"nome":"Fornecedores F7","tipo":"expense"}'::jsonb) ->> 'erro'));

select set_config('teste.cat_desp',
  (select id::text from public.financial_categories where name = 'Fornecedores F7'), true);
select set_config('teste.cat_ent',
  (select id::text from public.financial_categories where name = 'Outras entradas F7'), true);

-- RN-CAIXA-010: despesa PAGA PELO CAIXA reduz o físico.
select pg_temp.marcar();

select pg_temp.checar('despesa paga pelo caixa e registrada', 'true',
  (public.registrar_lancamento(jsonb_build_object(
     'tipo','expense','categoria_id', current_setting('teste.cat_desp', true),
     'valor', 30, 'descricao','Gas de cozinha', 'pelo_caixa', true)) ->> 'ok'));

select pg_temp.checar('despesa pelo caixa REDUZ o esperado em 30', '-30.00', pg_temp.variacao());

-- Despesa NÃO é sangria: o movimento tem tipo próprio.
select pg_temp.checar('despesa gera movimento do tipo expense, nao withdrawal', 'expense',
  (select movement_type from public.cash_movements
    where financial_entry_id is not null order by created_at desc limit 1));

select pg_temp.marcar();

select pg_temp.checar('despesa fora do caixa NAO gera movimento', 'true',
  (select (public.registrar_lancamento(jsonb_build_object(
     'tipo','expense','categoria_id', current_setting('teste.cat_desp', true),
     'valor', 500, 'descricao','Conta de luz por transferencia', 'pelo_caixa', false))
   ->> 'movimento_id') is null)::text);

select pg_temp.checar('despesa por transferencia NAO mexe no caixa', '0.00', pg_temp.variacao());

select pg_temp.marcar();

select pg_temp.checar('entrada pelo caixa AUMENTA o esperado', 'true',
  (public.registrar_lancamento(jsonb_build_object(
     'tipo','income','categoria_id', current_setting('teste.cat_ent', true),
     'valor', 10, 'descricao','Venda de caixas vazias', 'pelo_caixa', true)) ->> 'ok'));

select pg_temp.checar('entrada pelo caixa somou 10', '10.00', pg_temp.variacao());

select pg_temp.checar('categoria de despesa NAO aceita entrada', 'true',
  ((public.registrar_lancamento(jsonb_build_object(
     'tipo','income','categoria_id', current_setting('teste.cat_desp', true),
     'valor', 10, 'descricao','Teste de categoria')) ->> 'erro')
   ilike '%não aceita%')::text);

-- ---- estorno de lançamento
select set_config('teste.lanc',
  (select id::text from public.financial_entries
    where description = 'Gas de cozinha'), true);

select pg_temp.marcar();

select pg_temp.checar('estorna o lancamento', 'true',
  (public.reverter_lancamento(current_setting('teste.lanc', true)::uuid,
     'Valor lancado errado') ->> 'ok'));

select pg_temp.checar('o lancamento original continua existindo', 'reversed',
  (select status from public.financial_entries
    where id = current_setting('teste.lanc', true)::uuid));

select pg_temp.checar('o valor original NAO foi alterado', '30.00',
  (select amount::text from public.financial_entries
    where id = current_setting('teste.lanc', true)::uuid));

select pg_temp.checar('o dinheiro da despesa estornada voltou ao caixa', '30.00', pg_temp.variacao());

select pg_temp.checar('duplo estorno do lancamento e recusado', 'true',
  (public.reverter_lancamento(current_setting('teste.lanc', true)::uuid, 'De novo')
   ->> 'ja_revertido'));

-- RN-FIN-004: o lançamento correto é NOVO e aponta para o estornado.
select pg_temp.checar('o lancamento corrigido se vincula ao estornado', 'true',
  (public.registrar_lancamento(jsonb_build_object(
     'tipo','expense','categoria_id', current_setting('teste.cat_desp', true),
     'valor', 35, 'descricao','Gas de cozinha (valor correto)', 'pelo_caixa', true,
     'corrige_lancamento_id', current_setting('teste.lanc', true))) ->> 'ok'));

select pg_temp.checar('o vinculo entre original e correcao existe', 'true',
  (select (count(*) = 1)::text from public.financial_entries
    where reverses_entry_id = current_setting('teste.lanc', true)::uuid));

reset role;

-- Sem `finance.create` não lança.
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('atendente NAO lanca despesa',
  'Você não tem permissão para lançar movimentação financeira.',
  (public.registrar_lancamento(jsonb_build_object(
     'tipo','expense','categoria_id', current_setting('teste.cat_desp', true),
     'valor', 10, 'descricao','tentativa')) ->> 'erro'));

select pg_temp.checar('atendente NAO estorna',
  'Você não tem permissão para estornar.',
  (public.reverter_lancamento(current_setting('teste.lanc', true)::uuid, 'tentativa') ->> 'erro'));

reset role;

-- =============================================================================
-- F. ESTORNO DE PAGAMENTO
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.marcar();

select pg_temp.checar('estorna o pagamento do pedido em dinheiro', 'true',
  (public.reverter_pagamento(current_setting('teste.p_dinheiro', true)::uuid,
     'Pedido devolvido') ->> 'ok'));

select pg_temp.checar('o pagamento NAO sumiu, ficou reversed', 'reversed',
  (select status from public.payments
    where order_id = current_setting('teste.p_dinheiro', true)::uuid));

select pg_temp.checar('o pedido voltou a nao estar pago', 'reversed',
  (select payment_status from public.orders
    where id = current_setting('teste.p_dinheiro', true)::uuid));

select pg_temp.checar('o dinheiro do pagamento saiu pelo compensatorio', '-50.00', pg_temp.variacao());

select pg_temp.checar('o compensatorio aponta para o recebimento original', 'true',
  (select (count(*) = 1)::text from public.cash_movements
    where order_id = current_setting('teste.p_dinheiro', true)::uuid
      and reverses_movement_id is not null));

select pg_temp.checar('duplo estorno do pagamento e recusado', 'true',
  ((public.reverter_pagamento(current_setting('teste.p_dinheiro', true)::uuid, 'De novo')
    ->> 'erro') ilike '%não tem pagamento confirmado%')::text);

-- =============================================================================
-- G. FECHAMENTO — RN-CAIXA-011..016
-- =============================================================================
-- O esperado do resumo é o mesmo do servidor, e ele NÃO inclui cartão nem
-- Pix — que aparecem, mas em outro bloco (RN-CAIXA-014).
select set_config('teste.esp',
  public.esperado_em_caixa(current_setting('teste.sessao', true)::uuid)::text, true);

select pg_temp.checar('resumo usa o mesmo esperado do servidor', 'true',
  (select ((public.resumo_do_fechamento(current_setting('teste.sessao', true)::uuid)
             ->> 'esperado_em_dinheiro')::numeric
           = current_setting('teste.esp', true)::numeric)::text));

select pg_temp.checar('cartao e pix aparecem fora do dinheiro fisico', 'true',
  (select (count(*) > 0)::text from jsonb_array_elements(
     public.resumo_do_fechamento(current_setting('teste.sessao', true)::uuid)
       -> 'recebimentos_por_metodo') r
    where r ->> 'familia' <> 'cash'));

select pg_temp.checar('o esperado em dinheiro e menor que tudo que foi recebido', 'true',
  (select (current_setting('teste.esp', true)::numeric
           < (select sum((r ->> 'total')::numeric) from jsonb_array_elements(
                public.resumo_do_fechamento(current_setting('teste.sessao', true)::uuid)
                  -> 'recebimentos_por_metodo') r))::text));

select pg_temp.checar('resumo mostra sangrias', '120.00',
  (public.resumo_do_fechamento(current_setting('teste.sessao', true)::uuid) ->> 'sangrias'));

select pg_temp.checar('resumo destaca o dinheiro fora da gaveta', '50.00',
  (public.resumo_do_fechamento(current_setting('teste.sessao', true)::uuid)
   ->> 'dinheiro_fora_da_gaveta'));

-- RN-CAIXA-012: diferença exige justificativa.
select pg_temp.checar('fechar com diferenca e sem justificativa e recusado', 'true',
  (public.fechar_caixa(jsonb_build_object(
     'contado', current_setting('teste.esp', true)::numeric - 10)) ->> 'exige_justificativa'));

select pg_temp.checar('o caixa continua aberto apos a recusa', 'open',
  (select status from public.cash_sessions
    where id = current_setting('teste.sessao', true)::uuid));

select pg_temp.checar('fechar com diferenca NEGATIVA e justificativa', '-10.00',
  (public.fechar_caixa(jsonb_build_object(
     'contado', current_setting('teste.esp', true)::numeric - 10,
     'justificativa', 'Faltou dinheiro na gaveta')) ->> 'diferenca'));

select pg_temp.checar('o fechamento guardou o esperado do servidor',
  current_setting('teste.esp', true),
  (select expected_cash_amount::text from public.cash_sessions
    where id = current_setting('teste.sessao', true)::uuid));

select pg_temp.checar('o fechamento guardou a justificativa', 'Faltou dinheiro na gaveta',
  (select difference_reason from public.cash_sessions
    where id = current_setting('teste.sessao', true)::uuid));

select pg_temp.checar('o fechamento guardou o dinheiro fora da gaveta', '50.00',
  (select pending_external_cash_amount::text from public.cash_sessions
    where id = current_setting('teste.sessao', true)::uuid));

select pg_temp.checar('fechar duas vezes e recusado', 'true',
  (public.fechar_caixa(jsonb_build_object('sessao_id', current_setting('teste.sessao', true),
     'contado', current_setting('teste.esp', true)::numeric)) ->> 'ja_fechado'));

-- RN-CAIXA-015: sessão fechada é protegida.
select pg_temp.checar('sessao fechada NAO recebe movimento', 'true',
  (public.movimentar_caixa('{"tipo":"supply","valor":10}'::jsonb) ->> 'sem_caixa'));

select pg_temp.checar('movimento de sessao fechada NAO e estornado', 'true',
  (public.reverter_movimento_caixa(
     (select id from public.cash_movements
       where cash_session_id = current_setting('teste.sessao', true)::uuid
         and movement_type = 'withdrawal' and reversed_at is null limit 1),
     'tentativa') ->> 'caixa_fechado'));

reset role;

-- RN-CAIXA-015/016: atendente comum não reabre.
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('atendente NAO reabre caixa fechado',
  'Você não tem permissão para reabrir o caixa.',
  (public.reabrir_caixa(current_setting('teste.sessao', true)::uuid, 'tentativa') ->> 'erro'));

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('reabertura exige motivo', 'Informe o motivo da reabertura.',
  (public.reabrir_caixa(current_setting('teste.sessao', true)::uuid, '') ->> 'erro'));

select pg_temp.checar('dona reabre o caixa', 'true',
  (public.reabrir_caixa(current_setting('teste.sessao', true)::uuid,
     'Conferencia encontrou nota presa na gaveta') ->> 'ok'));

-- RN-CAIXA-016: o fechamento original NÃO some.
select pg_temp.checar('o fechamento anterior ficou no snapshot',
  (current_setting('teste.esp', true)::numeric - 10)::text,
  (select before_snapshot ->> 'contado' from public.cash_session_corrections
    where cash_session_id = current_setting('teste.sessao', true)::uuid
      and correction_type = 'reopen'));

select pg_temp.checar('a diferenca anterior ficou no snapshot', '-10.00',
  (select before_snapshot ->> 'diferenca' from public.cash_session_corrections
    where cash_session_id = current_setting('teste.sessao', true)::uuid
      and correction_type = 'reopen'));

select pg_temp.checar('a sessao voltou a aberta', 'open',
  (select status from public.cash_sessions
    where id = current_setting('teste.sessao', true)::uuid));

select pg_temp.checar('novo fechamento sem diferenca', '0.00',
  (public.fechar_caixa(jsonb_build_object(
     'contado', current_setting('teste.esp', true)::numeric)) ->> 'diferenca'));

select pg_temp.checar('o refechamento ficou registrado como correcao', '1',
  (select count(*)::text from public.cash_session_corrections
    where cash_session_id = current_setting('teste.sessao', true)::uuid
      and correction_type = 'reclose'));

-- Diferença POSITIVA, em sessão nova.
select public.abrir_caixa('{"fundo":100}'::jsonb);
select pg_temp.checar('fechar com diferenca POSITIVA e justificativa', '25.00',
  (public.fechar_caixa('{"contado":125,"justificativa":"Sobrou troco de ontem"}'::jsonb)
   ->> 'diferenca'));

-- =============================================================================
-- H. AUDITORIA — §33
-- =============================================================================
select pg_temp.checar('abertura e fechamento ficam auditados', 'true',
  (select (count(*) >= 2)::text from public.audit_logs
    where action in ('caixa_abrir','caixa_fechar')));

select pg_temp.checar('sangria fica auditada', 'true',
  (select (count(*) > 0)::text from public.audit_logs where action = 'caixa_withdrawal'));

select pg_temp.checar('reabertura fica auditada', 'true',
  (select (count(*) > 0)::text from public.audit_logs where action = 'caixa_reabrir'));

select pg_temp.checar('mudanca de esperado para realizado fica auditada', 'true',
  (select (count(*) > 0)::text from public.audit_logs
    where action = 'pagamento_registrar'
      and (after_data ->> 'divergiu_do_esperado')::boolean));

select pg_temp.checar('estorno de pagamento fica auditado', 'true',
  (select (count(*) > 0)::text from public.audit_logs where action = 'pagamento_estornar'));

select pg_temp.checar('despesa fica auditada', 'true',
  (select (count(*) > 0)::text from public.audit_logs where action = 'financeiro_despesa'));

-- =============================================================================
-- I. SEMÂNTICA FINANCEIRA — §18 da autorização, 03 §17.1
-- =============================================================================
-- Os dois livros são separados: lançamento financeiro NUNCA vira venda, e é
-- essa separação que fará cortesia e consumo interno (Fase 8) não entrarem
-- no faturamento por terem produtos.
--
-- A separação é ESTRUTURAL, não uma convenção de consulta: `financial_entries`
-- não tem como apontar para um pedido. Nenhuma query de receita precisa
-- lembrar de excluí-la.
select pg_temp.checar('lancamento financeiro nao tem como apontar para um pedido', '0',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'financial_entries'
      and column_name in ('order_id', 'pedido_id')));

select pg_temp.checar('a receita de venda sai de payments confirmados', 'true',
  (select (count(*) > 0)::text from public.payments where status = 'confirmed'));

select pg_temp.checar('entrada financeira NAO cria linha de pagamento', '0',
  (select count(*)::text from public.payments p
    where p.notes = 'Venda de caixas vazias'));

-- RN-CAIXA-014: dinheiro de pedido cancelado não é dinheiro a receber.
select set_config('teste.p_cancelado',
  pg_temp.pedido('{"idem":"88000030-0000-0000-0000-000000000030","modalidade":"delivery","whatsapp":"(11) 98000-0003"}'::jsonb)::text, true);

select public.registrar_pagamento(current_setting('teste.p_cancelado', true)::uuid,
  jsonb_build_object('linhas', jsonb_build_array(jsonb_build_object(
    'forma_id', current_setting('teste.dinheiro', true), 'valor', 50, 'na_gaveta', false))));

select set_config('teste.fora_antes', public.dinheiro_fora_da_gaveta()::text, true);

select public.comando_pedido(current_setting('teste.p_cancelado', true)::uuid,
  'cancelar', '{"motivo":"Cliente desistiu na porta"}'::jsonb);

select pg_temp.checar('pedido cancelado sai do dinheiro fora da gaveta', '-50.00',
  (public.dinheiro_fora_da_gaveta() - current_setting('teste.fora_antes', true)::numeric)::text);

select pg_temp.checar('mas o pagamento do cancelado continua no historico', '1',
  (select count(*)::text from public.payments
    where order_id = current_setting('teste.p_cancelado', true)::uuid));

reset role;

-- =============================================================================
-- I-b. COMPROVANTE FINANCEIRO — 05 §11.3 · 03 §23.2/§23.4/§24
-- =============================================================================
-- A PERGUNTA: a evidência fica onde tem de ficar, chega a quem tem de ver, e
-- sobrevive ao estorno?
--
-- A configuração do bucket é lida ANTES de trocar de papel: `storage.buckets`
-- tem RLS própria e não responde ao papel `authenticated`. Ler ali dentro
-- devolveria nulo e o teste mediria o RLS do Storage, não a configuração.
select pg_temp.checar('bucket de comprovantes e privado', 'false',
  (select public::text from storage.buckets where id = 'comprovantes'));

select pg_temp.checar('bucket de comprovantes tem limite de tamanho', '5242880',
  (select file_size_limit::text from storage.buckets where id = 'comprovantes'));

select pg_temp.checar('bucket de comprovantes aceita imagem e PDF', 'true',
  (select ('application/pdf' = any(allowed_mime_types)
           and 'image/webp' = any(allowed_mime_types))::text
     from storage.buckets where id = 'comprovantes'));

select pg_temp.checar('nenhuma policy de comprovante alcanca anon', '0',
  (select count(*)::text from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'comprovantes%' and 'anon' = any(roles)));

-- Um ativo de CATÁLOGO conhecido, para provar que a policy nova não mexeu no
-- comportamento antigo.
insert into public.media_assets (id, bucket, storage_path, mime_type, asset_type)
values ('88880000-0000-0000-0000-0000000000da','catalogo','teste/banner-f7.webp','image/webp','banner');

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-1111-1111-1111-111111111111","role":"authenticated"}';

select set_config('teste.lanc_comp',
  (public.registrar_lancamento(jsonb_build_object(
     'tipo','expense','categoria_id', current_setting('teste.cat_desp', true),
     'valor', 18, 'descricao','Despesa com comprovante')) ->> 'lancamento_id'), true);

select pg_temp.checar('anexar sem caminho e recusado', 'Arquivo não identificado.',
  (public.anexar_comprovante(current_setting('teste.lanc_comp', true)::uuid,
     '{"mime":"application/pdf"}'::jsonb) ->> 'erro'));

select pg_temp.checar('anexa comprovante ao lancamento', 'true',
  (public.anexar_comprovante(current_setting('teste.lanc_comp', true)::uuid,
     jsonb_build_object('caminho','lancamentos/teste/primeiro.pdf',
                        'mime','application/pdf','bytes', 1024,
                        'nome','recibo.pdf')) ->> 'ok'));

select pg_temp.checar('o vinculo aponta para o ativo criado', 'true',
  (select (e.attachment_asset_id = m.id)::text
     from public.financial_entries e
     join public.media_assets m on m.storage_path = 'lancamentos/teste/primeiro.pdf'
    where e.id = current_setting('teste.lanc_comp', true)::uuid));

select pg_temp.checar('o ativo nasce como comprovante financeiro', 'financial_receipt',
  (select asset_type from public.media_assets
    where storage_path = 'lancamentos/teste/primeiro.pdf'));

select pg_temp.checar('o ativo aponta para o bucket privado', 'comprovantes',
  (select bucket from public.media_assets
    where storage_path = 'lancamentos/teste/primeiro.pdf'));

select pg_temp.checar('a listagem traz o comprovante', 'recibo.pdf',
  (select l -> 'comprovante' ->> 'nome'
     from jsonb_array_elements(public.lancamentos_financeiros('{}'::jsonb)) l
    where l ->> 'id' = current_setting('teste.lanc_comp', true)));

select pg_temp.checar('substituir devolve o caminho anterior', 'lancamentos/teste/primeiro.pdf',
  (public.anexar_comprovante(current_setting('teste.lanc_comp', true)::uuid,
     jsonb_build_object('caminho','lancamentos/teste/segundo.webp',
                        'mime','image/webp','bytes', 2048,
                        'nome','foto.webp')) ->> 'anterior_path'));

select pg_temp.checar('a referencia antiga nao fica pendurada', '0',
  (select count(*)::text from public.media_assets
    where storage_path = 'lancamentos/teste/primeiro.pdf'));

select pg_temp.checar('o lancamento aponta para o comprovante novo', 'lancamentos/teste/segundo.webp',
  (select m.storage_path from public.media_assets m
     join public.financial_entries e on e.attachment_asset_id = m.id
    where e.id = current_setting('teste.lanc_comp', true)::uuid));

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('atendente NAO anexa comprovante',
  'Você não tem permissão para anexar comprovante.',
  (public.anexar_comprovante(current_setting('teste.lanc_comp', true)::uuid,
     jsonb_build_object('caminho','lancamentos/teste/invasor.pdf',
                        'mime','application/pdf')) ->> 'erro'));

select pg_temp.checar('atendente NAO remove comprovante',
  'Você não tem permissão para remover comprovante.',
  (public.remover_comprovante(current_setting('teste.lanc_comp', true)::uuid,
     'tentativa') ->> 'erro'));

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-4444-4444-4444-444444444444","role":"authenticated"}';

select pg_temp.checar('quem so ve catalogo NAO le o comprovante', '0',
  (select count(*)::text from public.media_assets
    where asset_type = 'financial_receipt'));

select pg_temp.checar('quem ve catalogo CONTINUA lendo midia de catalogo', '1',
  (select count(*)::text from public.media_assets
    where id = '88880000-0000-0000-0000-0000000000da'));

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('remocao sem motivo e recusada', 'Informe o motivo da remoção.',
  (public.remover_comprovante(current_setting('teste.lanc_comp', true)::uuid, '') ->> 'erro'));

select pg_temp.checar('remocao devolve o caminho do objeto', 'lancamentos/teste/segundo.webp',
  (public.remover_comprovante(current_setting('teste.lanc_comp', true)::uuid,
     'Anexei o arquivo errado') ->> 'caminho'));

select pg_temp.checar('o lancamento fica sem comprovante', 'true',
  (select (attachment_asset_id is null)::text from public.financial_entries
    where id = current_setting('teste.lanc_comp', true)::uuid));

select public.anexar_comprovante(current_setting('teste.lanc_comp', true)::uuid,
  jsonb_build_object('caminho','lancamentos/teste/final.pdf',
                     'mime','application/pdf','bytes', 900, 'nome','final.pdf'));

select public.reverter_lancamento(current_setting('teste.lanc_comp', true)::uuid,
  'Lancamento indevido');

select pg_temp.checar('o estorno NAO apaga a evidencia', 'lancamentos/teste/final.pdf',
  (select m.storage_path from public.media_assets m
     join public.financial_entries e on e.attachment_asset_id = m.id
    where e.id = current_setting('teste.lanc_comp', true)::uuid));

select pg_temp.checar('lancamento estornado NAO troca de comprovante', 'true',
  (public.anexar_comprovante(current_setting('teste.lanc_comp', true)::uuid,
     jsonb_build_object('caminho','lancamentos/teste/depois.pdf',
                        'mime','application/pdf')) ->> 'congelado'));

select pg_temp.checar('lancamento estornado NAO perde o comprovante', 'true',
  (public.remover_comprovante(current_setting('teste.lanc_comp', true)::uuid,
     'tentativa') ->> 'congelado'));

select pg_temp.checar('anexar e remover ficam auditados', 'true',
  (select (count(*) >= 2)::text from public.audit_logs
    where action in ('financeiro_comprovante_anexar','financeiro_comprovante_remover')));

reset role;

-- =============================================================================
-- J. SEGURANÇA PÚBLICA — 03 §33.6/§33.7
-- =============================================================================
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select pg_temp.checar('anon nao le sessoes de caixa', '0',
  (select count(*)::text from public.cash_sessions));

select pg_temp.checar('anon nao le movimentos de caixa', '0',
  (select count(*)::text from public.cash_movements));

select pg_temp.checar('anon nao le correcoes de caixa', '0',
  (select count(*)::text from public.cash_session_corrections));

select pg_temp.checar('anon nao le lancamentos financeiros', '0',
  (select count(*)::text from public.financial_entries));

select pg_temp.checar('anon nao le categorias financeiras', '0',
  (select count(*)::text from public.financial_categories));

select pg_temp.checar('anon nao le pagamentos', '0',
  (select count(*)::text from public.payments));

select pg_temp.checar('anon nao executa abrir_caixa', 'false',
  has_function_privilege('anon', 'public.abrir_caixa(jsonb)', 'execute')::text);

select pg_temp.checar('anon nao executa fechar_caixa', 'false',
  has_function_privilege('anon', 'public.fechar_caixa(jsonb)', 'execute')::text);

select pg_temp.checar('anon nao executa movimentar_caixa', 'false',
  has_function_privilege('anon', 'public.movimentar_caixa(jsonb)', 'execute')::text);

select pg_temp.checar('anon nao executa registrar_pagamento', 'false',
  has_function_privilege('anon', 'public.registrar_pagamento(uuid, jsonb)', 'execute')::text);

select pg_temp.checar('anon nao executa reverter_pagamento', 'false',
  has_function_privilege('anon', 'public.reverter_pagamento(uuid, text)', 'execute')::text);

select pg_temp.checar('anon nao executa registrar_lancamento', 'false',
  has_function_privilege('anon', 'public.registrar_lancamento(jsonb)', 'execute')::text);

select pg_temp.checar('anon nao executa reabrir_caixa', 'false',
  has_function_privilege('anon', 'public.reabrir_caixa(uuid, text)', 'execute')::text);

select pg_temp.checar('anon nao ve o caixa pela projecao', 'false',
  has_function_privilege('anon', 'public.caixa_atual()', 'execute')::text);

select pg_temp.checar('anon nao le comprovantes', '0',
  (select count(*)::text from public.media_assets where asset_type = 'financial_receipt'));

select pg_temp.checar('anon nao executa anexar_comprovante', 'false',
  has_function_privilege('anon', 'public.anexar_comprovante(uuid, jsonb)', 'execute')::text);

select pg_temp.checar('anon nao executa remover_comprovante', 'false',
  has_function_privilege('anon', 'public.remover_comprovante(uuid, text)', 'execute')::text);

reset role;

-- =============================================================================
-- RESULTADO
-- =============================================================================
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
