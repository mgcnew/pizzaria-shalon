-- =============================================================================
-- TESTES DO COMPLEMENTO DA FASE 8 — A-18, A-19 E GESTÃO DE EQUIPE
--
-- 04-REGRAS-NEGOCIO.md RN-RUN-008/009, RN-EMPFIN-004, RN-RBAC-005,
-- RN-FUNC-001/002/003 · 03 §18.4, §19.6, §19.7 · CLAUDE.md §14, §15, §26, §34
--
-- AS QUATRO PERGUNTAS DESTE ARQUIVO:
--   1. depois de uma transferência, o mesmo dinheiro aparece em duas corridas?
--   2. o adiantamento consegue existir só de um lado — no caixa sem o livro,
--      ou no livro sem o caixa?
--   3. alguém consegue se promover?
--   4. a tela de equipe, que cresceu, deixou o salário vazar?
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

create or replace function pg_temp.uid(p_chave text)
returns uuid language sql as $$
  select nullif(current_setting(p_chave, true), '')::uuid;
$$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('aaaa1111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','donab@teste.local','x',now(),now(),now()),
  ('aaaa2222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','atendenteb@teste.local','x',now(),now(),now()),
  -- Gerente: administra papéis e NÃO enxerga salário. É com ele que se prova
  -- que `roles.manage` não é a chave de todas as portas.
  ('aaaa3333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gerenteb@teste.local','x',now(),now(),now()),
  -- Conta existente e ainda SEM funcionário: serve para o vínculo de acesso.
  ('aaaa4444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','novato@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status, ended_at) values
  ('bbbb1111-0000-0000-0000-000000000001','Dona F8B','owner',false,'active',null),
  ('bbbb1111-0000-0000-0000-000000000002','Atendente F8B','counter',false,'active',null),
  ('bbbb1111-0000-0000-0000-000000000003','Gerente F8B','counter',false,'active',null),
  ('bbbb1111-0000-0000-0000-000000000004','Joao Motoboy F8B','driver',true,'active',null),
  ('bbbb1111-0000-0000-0000-000000000005','Pedro Motoboy F8B','driver',true,'active',null),
  ('bbbb1111-0000-0000-0000-000000000006','Desligado F8B','driver',true,'inactive',current_date - 1),
  ('bbbb1111-0000-0000-0000-000000000007','Balconista F8B','counter',false,'active',null);

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('cccc1111-0000-0000-0000-000000000001','aaaa1111-1111-1111-1111-111111111111','bbbb1111-0000-0000-0000-000000000001',true),
  ('cccc1111-0000-0000-0000-000000000002','aaaa2222-2222-2222-2222-222222222222','bbbb1111-0000-0000-0000-000000000002',true),
  ('cccc1111-0000-0000-0000-000000000003','aaaa3333-3333-3333-3333-333333333333','bbbb1111-0000-0000-0000-000000000003',true);

insert into public.user_roles (app_user_id, role_id)
select 'cccc1111-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
select 'cccc1111-0000-0000-0000-000000000002', id from public.roles where name = 'Atendente';

insert into public.roles (id, name, description, is_system, is_active)
values ('dddd1111-0000-0000-0000-00000000000e','Gerente F8B','Administra papeis, nao ve salario', false, true);
insert into public.role_permissions (role_id, permission_id)
select 'dddd1111-0000-0000-0000-00000000000e', id from public.permissions
 where code in ('orders.view','employees.view','employees.manage','roles.manage',
                'deliveries.view','deliveries.manage','cash.view');
insert into public.user_roles (app_user_id, role_id)
values ('cccc1111-0000-0000-0000-000000000003','dddd1111-0000-0000-0000-00000000000e');

-- Papel cujas permissões são SUBCONJUNTO do que o Gerente possui. Serve para
-- provar que RN-RBAC-005 barra a escalada sem impedir a delegação legítima.
insert into public.roles (id, name, description, is_system, is_active)
values ('dddd1111-0000-0000-0000-00000000000a','Auxiliar F8B','So visualiza pedido e entrega', false, true);
insert into public.role_permissions (role_id, permission_id)
select 'dddd1111-0000-0000-0000-00000000000a', id from public.permissions
 where code in ('orders.view','deliveries.view');

insert into public.employee_financial_profiles (employee_id, salary_reference)
values ('bbbb1111-0000-0000-0000-000000000004', 2500.00);

delete from public.cash_movements;
delete from public.cash_session_corrections;
delete from public.cash_sessions;

delete from public.store_settings;
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code, latitude, longitude,
  automatic_delivery_radius_km, delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values (
  'eeee1111-0000-0000-0000-000000000001','Shalon F8B','5500000000000','Rua T','1','Centro',
  'Cidade','XX','00000-000', -23.5, -46.6, 4.0, 40, 60, 20, 30, true, 'America/Sao_Paulo');

delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 4, 0.00, true, 1);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('ffff1111-0000-0000-0000-000000000001','Grande F8B', 8, 2, 911);
insert into public.categories (id, name, slug, sort_order) values
  ('ffff1111-0000-0000-0000-000000000002','Pizzas F8B','pizzas-f8b', 911);
insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active) values
  ('ffff1111-0000-0000-0000-000000000003','ffff1111-0000-0000-0000-000000000002','pizza','Calabresa F8B','calabresa-f8b', 1, true);
-- Pizza de R$ 30,00.
insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available) values
  ('ffff1111-0000-0000-0000-000000000004','ffff1111-0000-0000-0000-000000000003','ffff1111-0000-0000-0000-000000000001', 30.00, true, true);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);

create or replace function pg_temp.pedido_pronto()
returns uuid language plpgsql as $$
declare v_idem text := gen_random_uuid()::text; v_r jsonb; v_id uuid;
begin
  v_r := public.criar_pedido(jsonb_build_object(
    'idempotency_key', v_idem,
    'tracking_token', md5(v_idem) || md5(v_idem || ':2'),
    'origem','counter','modalidade','delivery',
    'cliente', jsonb_build_object('nome','Cliente F8B','whatsapp','(11) 97000-0001'),
    'endereco', jsonb_build_object('logradouro','Rua E','numero','9','bairro','Centro',
      'cidade','Cidade','uf','XX','latitude',-23.51,'longitude',-46.61,
      'confianca','exata','provedor','teste'),
    'rota', jsonb_build_object('distancia_km', 2.0, 'provedor','teste'),
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id','ffff1111-0000-0000-0000-000000000003',
      'variacao_id','ffff1111-0000-0000-0000-000000000004','quantidade',1)),
    'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))
  ), '');
  v_id := (v_r ->> 'pedido_id')::uuid;
  perform public.comando_pedido(v_id, 'iniciar_producao');
  perform public.comando_pedido(v_id, 'marcar_pronto');
  return v_id;
end;
$$;

create or replace function pg_temp.marcar()
returns void language sql as $$
  select set_config('teste.antes',
    coalesce(public.esperado_em_caixa(pg_temp.uid('teste.sessao')), 0)::text, true);
  select null::void;
$$;

create or replace function pg_temp.variacao()
returns text language sql as $$
  select (coalesce(public.esperado_em_caixa(pg_temp.uid('teste.sessao')), 0)
          - current_setting('teste.antes', true)::numeric)::text;
$$;

create or replace function pg_temp.vinculo(p_pedido uuid)
returns uuid language sql as $$
  select id from public.driver_run_orders
   where order_id = p_pedido and delivery_status = 'pending';
$$;

-- =============================================================================
-- A. TRANSFERÊNCIA EM ROTA — RN-RUN-008/009
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('abre caixa para os cenarios de dinheiro', 'true',
  (public.abrir_caixa('{"fundo":500}'::jsonb) ->> 'ok'));
select set_config('teste.sessao',
  (select id::text from public.cash_sessions where status = 'open'), true);

-- João sai com TRÊS pedidos. Só um vai ser transferido.
select set_config('teste.p1', pg_temp.pedido_pronto()::text, true);
select set_config('teste.p2', pg_temp.pedido_pronto()::text, true);
select set_config('teste.p3', pg_temp.pedido_pronto()::text, true);

select set_config('teste.joao',
  (public.atribuir_entrega(pg_temp.uid('teste.p1'),
    '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000004"}'::jsonb) ->> 'corrida_id'), true);
select public.atribuir_entrega(pg_temp.uid('teste.p2'),
  '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000004"}'::jsonb);
select public.atribuir_entrega(pg_temp.uid('teste.p3'),
  '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000004"}'::jsonb);

-- ANTES de sair, transferir não é o caminho: a mensagem manda usar atribuição.
select pg_temp.checar('corrida que nao saiu nao se transfere', 'true',
  (public.transferir_entrega(pg_temp.vinculo(pg_temp.uid('teste.p1')),
    '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000005","motivo":"Moto quebrou"}'::jsonb)
   ->> 'nao_esta_em_rota'));

select pg_temp.checar('despacha a corrida do Joao', 'true',
  (public.despachar_corrida(pg_temp.uid('teste.joao')) ->> 'ok'));

select set_config('teste.v1', pg_temp.vinculo(pg_temp.uid('teste.p1'))::text, true);

-- RN-RUN-008: motivo obrigatório.
select pg_temp.checar('transferencia sem motivo e recusada', 'false',
  (public.transferir_entrega(pg_temp.uid('teste.v1'),
    '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000005"}'::jsonb) ->> 'ok'));

select pg_temp.checar('transferir para o MESMO motoboy e recusado', 'false',
  (public.transferir_entrega(pg_temp.uid('teste.v1'),
    '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000004","motivo":"Moto quebrou"}'::jsonb) ->> 'ok'));

select pg_temp.checar('transferir para funcionario DESLIGADO e recusado', 'false',
  (public.transferir_entrega(pg_temp.uid('teste.v1'),
    '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000006","motivo":"Moto quebrou"}'::jsonb) ->> 'ok'));

select pg_temp.checar('transferir para quem nao e entregador e recusado', 'false',
  (public.transferir_entrega(pg_temp.uid('teste.v1'),
    '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000007","motivo":"Moto quebrou"}'::jsonb) ->> 'ok'));

-- A transferência de verdade.
select set_config('teste.pedro',
  (public.transferir_entrega(pg_temp.uid('teste.v1'), jsonb_build_object(
     'motoboy_id','bbbb1111-0000-0000-0000-000000000005',
     'motivo','Moto do Joao quebrou na Rua E')) ->> 'corrida_destino'), true);

select pg_temp.checar('a transferencia acontece', 'true',
  (pg_temp.uid('teste.pedro') is not null)::text);

-- §22: quem saiu com o pedido NÃO é apagado.
select pg_temp.checar('o vinculo do Joao permanece, como transferido', 'transferred',
  (select delivery_status from public.driver_run_orders
    where id = pg_temp.uid('teste.v1')));

select pg_temp.checar('o vinculo antigo continua apontando para a corrida do Joao', 'true',
  (select (driver_run_id = pg_temp.uid('teste.joao'))::text
     from public.driver_run_orders where id = pg_temp.uid('teste.v1')));

select pg_temp.checar('o fato guarda de quem para quem', 'Joao Motoboy F8B > Pedro Motoboy F8B',
  (select ea.full_name || ' > ' || eb.full_name
     from public.delivery_transfers t
     join public.employees ea on ea.id = t.from_employee_id
     join public.employees eb on eb.id = t.to_employee_id
    where t.from_link_id = pg_temp.uid('teste.v1')));

select pg_temp.checar('o fato guarda o motivo', 'Moto do Joao quebrou na Rua E',
  (select reason from public.delivery_transfers
    where from_link_id = pg_temp.uid('teste.v1')));

select pg_temp.checar('o fato guarda quem autorizou', 'true',
  (select (transferred_by = 'cccc1111-0000-0000-0000-000000000001')::text
     from public.delivery_transfers where from_link_id = pg_temp.uid('teste.v1')));

-- RN-RUN-008: o pedido NÃO volta para "pronto". Ele continua em rota.
select pg_temp.checar('o pedido continua em rota', 'out_for_delivery',
  (select status from public.orders where id = pg_temp.uid('teste.p1')));

select pg_temp.checar('a corrida do Pedro nasce na rua', 'out',
  (select status from public.driver_runs where id = pg_temp.uid('teste.pedro')));

-- GRANULARIDADE: só um dos três mudou de mão.
select pg_temp.checar('os outros dois continuam com o Joao', '2',
  (select count(*)::text from public.driver_run_orders
    where driver_run_id = pg_temp.uid('teste.joao') and delivery_status = 'pending'));

select pg_temp.checar('a corrida do Pedro tem so o transferido', '1',
  (select count(*)::text from public.driver_run_orders
    where driver_run_id = pg_temp.uid('teste.pedro')));

select pg_temp.checar('o mesmo vinculo nao se transfere duas vezes', 'true',
  (public.transferir_entrega(pg_temp.uid('teste.v1'),
    '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000005","motivo":"De novo"}'::jsonb)
   ->> 'ja_conferida'));

-- ------------------------------------------------- o dinheiro não duplica
-- Pedro entrega e recebe. O dinheiro é dele para prestar contas.
select public.registrar_pagamento(pg_temp.uid('teste.p1'), jsonb_build_object(
  'idempotency_key', gen_random_uuid()::text,
  'linhas', jsonb_build_array(jsonb_build_object(
    'forma_id', current_setting('teste.dinheiro'), 'valor', 30.00, 'na_gaveta', false))));

select pg_temp.checar('o dinheiro aparece na corrida do Pedro', '30.00',
  public.dinheiro_da_corrida(pg_temp.uid('teste.pedro'), false)::text);

-- A PERGUNTA CENTRAL: o mesmo dinheiro na corrida de quem não o tem?
select pg_temp.checar('e NAO aparece na corrida do Joao', '0.00',
  public.dinheiro_da_corrida(pg_temp.uid('teste.joao'), false)::text);

select pg_temp.checar('somado, o dinheiro na rua existe uma vez so', '30.00',
  (select sum((c ->> 'dinheiro_na_rua')::numeric)::numeric(12,2)::text
     from jsonb_array_elements(public.central_de_entregas() -> 'corridas') c));

select pg_temp.checar('e bate com o total fora da gaveta', '30.00',
  public.dinheiro_fora_da_gaveta()::text);

-- Pedro conclui a entrega dele e acerta.
select public.registrar_retorno(pg_temp.vinculo(pg_temp.uid('teste.p1')),
  '{"entregue":true}'::jsonb);

select pg_temp.checar('o acerto do Pedro cobra o pedido transferido', '30.00',
  (public.corrida(pg_temp.uid('teste.pedro')) ->> 'esperado_em_dinheiro'));

select pg_temp.marcar();
select pg_temp.checar('Pedro acerta', 'true',
  (public.conciliar_corrida(pg_temp.uid('teste.pedro'), '{"devolvido":30}'::jsonb) ->> 'ok'));
select pg_temp.checar('o dinheiro do transferido entra na gaveta uma vez', '30.00',
  pg_temp.variacao());

-- João conclui os dois que ficaram com ele, sem receber dinheiro: os
-- clientes pagaram na maquininha, registrado no acerto (D-2026-10-01-111).
select public.registrar_retorno(pg_temp.vinculo(pg_temp.uid('teste.p2')), '{"entregue":true}'::jsonb);
select public.registrar_retorno(pg_temp.vinculo(pg_temp.uid('teste.p3')), '{"entregue":true}'::jsonb);
create or replace function pg_temp.receber_na_maquininha(p_pedido uuid) returns void
language plpgsql as $$
begin
  -- D-2026-10-01-111: o acerto só fecha com cada entrega recebida. Cartão ou
  -- Pix na maquininha do motoboy não é dinheiro: não muda o esperado.
  perform public.registrar_pagamento(p_pedido, jsonb_build_object(
    'idempotency_key', gen_random_uuid()::text,
    'linhas', jsonb_build_array(jsonb_build_object(
      'forma_id', (select id::text from public.payment_methods where code = 'pix_maquininha'),
      'valor', (select total from public.orders where id = p_pedido)))));
end;
$$;
select pg_temp.receber_na_maquininha(pg_temp.uid('teste.p2'));
select pg_temp.receber_na_maquininha(pg_temp.uid('teste.p3'));

select pg_temp.checar('o acerto do Joao NAO cobra o que ele transferiu', '0.00',
  (public.corrida(pg_temp.uid('teste.joao')) ->> 'esperado_em_dinheiro'));

-- Entrega já concluída não volta atrás por fluxo comum.
select pg_temp.checar('entrega ja concluida nao se transfere', 'true',
  (public.transferir_entrega(
     (select id from public.driver_run_orders
       where order_id = pg_temp.uid('teste.p2') and delivery_status = 'delivered'),
     '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000005","motivo":"Tentativa"}'::jsonb)
   ->> 'ja_conferida'));

select pg_temp.checar('Joao acerta com zero', 'true',
  (public.conciliar_corrida(pg_temp.uid('teste.joao'), '{"devolvido":0}'::jsonb) ->> 'ok'));

-- ---------------------------- dinheiro recebido ANTES da transferência
-- RN-RUN-009: quem recebeu continua respondendo por aquele dinheiro.
select set_config('teste.p4', pg_temp.pedido_pronto()::text, true);
select set_config('teste.joao2',
  (public.atribuir_entrega(pg_temp.uid('teste.p4'),
    '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000004"}'::jsonb) ->> 'corrida_id'), true);
select public.despachar_corrida(pg_temp.uid('teste.joao2'));
select public.registrar_pagamento(pg_temp.uid('teste.p4'), jsonb_build_object(
  'idempotency_key', gen_random_uuid()::text,
  'linhas', jsonb_build_array(jsonb_build_object(
    'forma_id', current_setting('teste.dinheiro'), 'valor', 30.00, 'na_gaveta', false))));

select set_config('teste.pedro2',
  (public.transferir_entrega(pg_temp.vinculo(pg_temp.uid('teste.p4')), jsonb_build_object(
     'motoboy_id','bbbb1111-0000-0000-0000-000000000005',
     'motivo','Joao passou mal e Pedro terminou a entrega')) ->> 'corrida_destino'), true);

-- A corrida do Joao ficou sem nada para entregar e ja espera acerto.
select pg_temp.checar('a corrida esvaziada volta para o acerto', 'settling',
  (select status from public.driver_runs where id = pg_temp.uid('teste.joao2')));

select pg_temp.checar('o dinheiro recebido ANTES fica com quem recebeu', '30.00',
  public.dinheiro_da_corrida(pg_temp.uid('teste.joao2'), false)::text);

select pg_temp.checar('e NAO vai para quem terminou a entrega', '0.00',
  public.dinheiro_da_corrida(pg_temp.uid('teste.pedro2'), false)::text);

select public.registrar_retorno(pg_temp.vinculo(pg_temp.uid('teste.p4')), '{"entregue":true}'::jsonb);

select pg_temp.checar('o acerto do Pedro nao cobra dinheiro que nao esta com ele', '0.00',
  (public.corrida(pg_temp.uid('teste.pedro2')) ->> 'esperado_em_dinheiro'));

select pg_temp.checar('a projecao avisa que o dinheiro ficou com o anterior', 'true',
  (select (p -> 0 ->> 'dinheiro_com_o_anterior')
     from (select public.corrida(pg_temp.uid('teste.pedro2')) -> 'pedidos' as p) x));

select pg_temp.checar('Pedro acerta com zero', 'true',
  (public.conciliar_corrida(pg_temp.uid('teste.pedro2'), '{"devolvido":0}'::jsonb) ->> 'ok'));

-- João ainda está na rua com o dinheiro; ele responde por ele.
select pg_temp.checar('o acerto do Joao cobra o que ele recebeu', '30.00',
  public.dinheiro_da_corrida(pg_temp.uid('teste.joao2'), true)::text);

select pg_temp.marcar();
select pg_temp.checar('Joao acerta o dinheiro que estava com ele', 'true',
  (public.conciliar_corrida(pg_temp.uid('teste.joao2'), '{"devolvido":30}'::jsonb) ->> 'ok'));
select pg_temp.checar('e o caixa recebe uma vez so', '30.00', pg_temp.variacao());

-- Depois de conciliado, nada mais se transfere.
select set_config('teste.p5', pg_temp.pedido_pronto()::text, true);
select set_config('teste.joao3',
  (public.atribuir_entrega(pg_temp.uid('teste.p5'),
    '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000004"}'::jsonb) ->> 'corrida_id'), true);
select public.despachar_corrida(pg_temp.uid('teste.joao3'));
select public.registrar_pagamento(pg_temp.uid('teste.p5'), jsonb_build_object(
  'idempotency_key', gen_random_uuid()::text,
  'linhas', jsonb_build_array(jsonb_build_object(
    'forma_id', current_setting('teste.dinheiro'), 'valor', 30.00))));

select pg_temp.checar('pedido com dinheiro ja na gaveta nao se transfere', 'true',
  (public.transferir_entrega(pg_temp.vinculo(pg_temp.uid('teste.p5')),
    '{"motoboy_id":"bbbb1111-0000-0000-0000-000000000005","motivo":"Tentativa"}'::jsonb)
   ->> 'ja_conciliado'));

-- =============================================================================
-- B. ADIANTAMENTO PELA GAVETA — RN-EMPFIN-004
-- =============================================================================
select pg_temp.checar('adiantamento de conferencia NAO aceita pelo_caixa', 'false',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id','bbbb1111-0000-0000-0000-000000000004',
     'tipo','adjustment','valor',10.00,'motivo','Tentativa','pelo_caixa',true)) ->> 'ok'));

select pg_temp.checar('adiantamento maior que a gaveta e recusado', 'false',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id','bbbb1111-0000-0000-0000-000000000004',
     'tipo','advance','valor',999999.00,'motivo','Tentativa','pelo_caixa',true)) ->> 'ok'));

select pg_temp.marcar();
select set_config('teste.adiant',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id','bbbb1111-0000-0000-0000-000000000004',
     'tipo','advance','valor',200.00,
     'motivo','Adiantamento combinado para o mes',
     'pelo_caixa', true)) ->> 'lancamento_id'), true);

select pg_temp.checar('o adiantamento e aceito', 'true',
  (pg_temp.uid('teste.adiant') is not null)::text);

-- OS DOIS LADOS DO MESMO FATO.
select pg_temp.checar('existe UM movimento de caixa vinculado', '1',
  (select count(*)::text from public.cash_movements
    where employee_ledger_entry_id = pg_temp.uid('teste.adiant')));

select pg_temp.checar('o valor e o mesmo nos dois livros', 'true',
  (select (m.amount = l.amount)::text
     from public.cash_movements m
     join public.employee_ledger_entries l on l.id = m.employee_ledger_entry_id
    where l.id = pg_temp.uid('teste.adiant')));

-- Tipo PRÓPRIO: não é sangria, não é despesa.
select pg_temp.checar('o movimento tem tipo proprio', 'employee_advance',
  (select movement_type from public.cash_movements
    where employee_ledger_entry_id = pg_temp.uid('teste.adiant')));

select pg_temp.checar('o adiantamento SAI da gaveta', 'out',
  (select direction from public.cash_movements
    where employee_ledger_entry_id = pg_temp.uid('teste.adiant')));

select pg_temp.checar('o esperado do caixa cai 200', '-200.00', pg_temp.variacao());

-- E não vira nenhuma das coisas que ele não é.
select pg_temp.checar('adiantamento NAO vira sangria', '0',
  (select count(*)::text from public.cash_movements
    where movement_type = 'withdrawal'
      and employee_ledger_entry_id = pg_temp.uid('teste.adiant')));

select pg_temp.checar('adiantamento NAO vira despesa', '0',
  (select count(*)::text from public.financial_entries
    where description ilike '%Adiantamento combinado%'));

select pg_temp.checar('adiantamento NAO vira venda', '0',
  (select count(*)::text from public.payments p
    where p.notes ilike '%Adiantamento%'));

-- RN-EMPFIN-003.
select pg_temp.checar('adiantamento NAO altera o salario', '2500.00',
  (select salary_reference::text from public.employee_financial_profiles
    where employee_id = 'bbbb1111-0000-0000-0000-000000000004'));

select pg_temp.checar('a forma de pagamento fica registrada', 'Dinheiro',
  (select payment_method_name_snapshot from public.employee_ledger_entries
    where id = pg_temp.uid('teste.adiant')));

select pg_temp.checar('o livro mostra que foi pago pela gaveta', 'true',
  (select l ->> 'pago_pela_gaveta' from jsonb_array_elements(
     public.historico_do_funcionario('bbbb1111-0000-0000-0000-000000000004') -> 'lancamentos') l
    where l ->> 'lancamento_id' = current_setting('teste.adiant')));

-- ------------------------------------------------- meio estorno não existe
select set_config('teste.movadiant',
  (select id::text from public.cash_movements
    where employee_ledger_entry_id = pg_temp.uid('teste.adiant')), true);

select pg_temp.checar('o caixa NAO estorna metade do fato sozinho', 'true',
  (public.reverter_movimento_caixa(pg_temp.uid('teste.movadiant'),
     'Tentativa de estornar so o caixa') ->> 'tem_lancamento'));

select pg_temp.checar('e o movimento continua valendo', 'true',
  (select (reversed_at is null)::text from public.cash_movements
    where id = pg_temp.uid('teste.movadiant')));

select pg_temp.marcar();
select pg_temp.checar('estornar pelo livro devolve os dois', 'true',
  (public.reverter_lancamento_funcionario(pg_temp.uid('teste.adiant'),
     'Adiantamento lancado em duplicidade') ->> 'ok'));

select pg_temp.checar('o dinheiro volta para a gaveta', '200.00', pg_temp.variacao());

select pg_temp.checar('o lancamento fica estornado', 'reversed',
  (select status from public.employee_ledger_entries where id = pg_temp.uid('teste.adiant')));

select pg_temp.checar('o movimento original fica estornado', 'true',
  (select (reversed_at is not null)::text from public.cash_movements
    where id = pg_temp.uid('teste.movadiant')));

select pg_temp.checar('o compensatorio aponta para o original', '1',
  (select count(*)::text from public.cash_movements
    where reverses_movement_id = pg_temp.uid('teste.movadiant')));

select pg_temp.checar('o original NAO foi apagado', '1',
  (select count(*)::text from public.cash_movements
    where id = pg_temp.uid('teste.movadiant')));

select pg_temp.checar('duplo estorno do adiantamento e recusado', 'true',
  (public.reverter_lancamento_funcionario(pg_temp.uid('teste.adiant'), 'De novo')
   ->> 'ja_revertido'));

-- Adiantamento que NÃO passou pela gaveta não mexe no caixa.
select pg_temp.marcar();
select pg_temp.checar('adiantamento por transferencia e aceito', 'true',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id','bbbb1111-0000-0000-0000-000000000004',
     'tipo','advance','valor',100.00,'motivo','Adiantamento por transferencia bancaria'))
   ->> 'ok'));
select pg_temp.checar('adiantamento fora da gaveta NAO mexe no caixa', '0.00', pg_temp.variacao());

-- =============================================================================
-- C. EQUIPE, ACESSO E PAPÉIS — RN-FUNC-001/002, RN-RBAC-005
-- =============================================================================
select set_config('teste.novo',
  (public.salvar_funcionario('{"nome":"Novato F8B","tipo":"driver","entregador":true}'::jsonb)
   ->> 'funcionario_id'), true);

select pg_temp.checar('a dona cria funcionario', 'true',
  (pg_temp.uid('teste.novo') is not null)::text);

select pg_temp.checar('o funcionario nasce ativo', 'active',
  (select employment_status from public.employees where id = pg_temp.uid('teste.novo')));

-- CLAUDE.md §10.1: motoboy é funcionário SEM login.
select pg_temp.checar('funcionario nasce sem acesso ao sistema', 'true',
  (select (l -> 'acesso' is null or l ->> 'acesso' is null)::text
     from jsonb_array_elements(public.equipe()) l
    where l ->> 'funcionario_id' = current_setting('teste.novo')));

select pg_temp.checar('e mesmo assim aparece como motoboy elegivel', 'true',
  (select (count(*) > 0)::text from jsonb_array_elements(
     public.central_de_entregas() -> 'motoboys') m
    where m ->> 'funcionario_id' = current_setting('teste.novo')));

-- Em statements separados: no MESMO select, a leitura enxergaria o snapshot
-- anterior ao update e o teste mediria o passado.
select public.salvar_funcionario(jsonb_build_object(
  'id', current_setting('teste.novo'),
  'nome','Novato Editado F8B','tipo','driver','entregador',true));

select pg_temp.checar('editar o funcionario funciona', 'Novato Editado F8B',
  (select full_name from public.employees where id = pg_temp.uid('teste.novo')));

-- RN-FUNC-001: desligar é data, não exclusão.
select pg_temp.checar('desligar o funcionario funciona', 'true',
  (public.desligar_funcionario(pg_temp.uid('teste.novo'),
    '{"motivo":"Pediu demissao"}'::jsonb) ->> 'ok'));

select pg_temp.checar('o desligado continua existindo', '1',
  (select count(*)::text from public.employees where id = pg_temp.uid('teste.novo')));

select pg_temp.checar('com data de desligamento', 'true',
  (select (ended_at is not null)::text from public.employees
    where id = pg_temp.uid('teste.novo')));

select pg_temp.checar('e sai da lista de motoboys elegiveis', '0',
  (select count(*)::text from jsonb_array_elements(
     public.central_de_entregas() -> 'motoboys') m
    where m ->> 'funcionario_id' = current_setting('teste.novo')));

select pg_temp.checar('reativar devolve a situacao', 'true',
  (public.reativar_funcionario(pg_temp.uid('teste.novo'), 'Voltou') ->> 'ok'));

select pg_temp.checar('e limpa a data de desligamento', 'true',
  (select (ended_at is null and employment_status = 'active')::text
     from public.employees where id = pg_temp.uid('teste.novo')));

-- Motoboy com corrida aberta não se desliga.
select set_config('teste.p6', pg_temp.pedido_pronto()::text, true);
select public.atribuir_entrega(pg_temp.uid('teste.p6'),
  jsonb_build_object('motoboy_id', current_setting('teste.novo')));

select pg_temp.checar('entregador com corrida aberta nao e desligado', 'true',
  (public.desligar_funcionario(pg_temp.uid('teste.novo'),
    '{"motivo":"Tentativa"}'::jsonb) ->> 'tem_corrida_aberta'));

-- ------------------------------------------------------------- acesso
select pg_temp.checar('vincular conta inexistente e recusado', 'true',
  (public.vincular_acesso(jsonb_build_object(
     'funcionario_id', current_setting('teste.novo'),
     'email','naoexiste@teste.local')) ->> 'conta_inexistente'));

select set_config('teste.acesso',
  (public.vincular_acesso(jsonb_build_object(
     'funcionario_id', current_setting('teste.novo'),
     'email','novato@teste.local')) ->> 'app_user_id'), true);

select pg_temp.checar('vincular conta existente funciona', 'true',
  (pg_temp.uid('teste.acesso') is not null)::text);

select pg_temp.checar('o acesso nasce SEM papel nenhum', '0',
  (select count(*)::text from public.user_roles
    where app_user_id = pg_temp.uid('teste.acesso')));

select pg_temp.checar('vincular duas vezes e recusado', 'true',
  (public.vincular_acesso(jsonb_build_object(
     'funcionario_id', current_setting('teste.novo'),
     'email','novato@teste.local')) ->> 'ja_tem_acesso'));

select pg_temp.checar('a dona atribui o papel Atendente', 'true',
  (public.definir_papeis(pg_temp.uid('teste.acesso'),
     array[(select id from public.roles where name = 'Atendente')],
     'Novo balconista') ->> 'ok'));

select pg_temp.checar('o papel fica gravado', '1',
  (select count(*)::text from public.user_roles
    where app_user_id = pg_temp.uid('teste.acesso')));

select pg_temp.checar('a mudanca de papel fica auditada', 'true',
  (select (count(*) > 0)::text from public.audit_logs
    where action = 'acesso_definir_papeis'));

-- §18.4: desligar corta o acesso sem apagar histórico.
select public.despachar_corrida(
  (select id from public.driver_runs where driver_employee_id = pg_temp.uid('teste.novo')
     and status = 'open' limit 1));
select public.registrar_retorno(pg_temp.vinculo(pg_temp.uid('teste.p6')), '{"entregue":true}'::jsonb);
select pg_temp.receber_na_maquininha(pg_temp.uid('teste.p6'));
select public.conciliar_corrida(
  (select id from public.driver_runs where driver_employee_id = pg_temp.uid('teste.novo')
     and status = 'settling' limit 1), '{"devolvido":0}'::jsonb);

select pg_temp.checar('agora o desligamento passa', 'true',
  (public.desligar_funcionario(pg_temp.uid('teste.novo'),
    '{"motivo":"Pediu demissao"}'::jsonb) ->> 'ok'));

select pg_temp.checar('e o acesso e desativado junto', 'false',
  (select is_active::text from public.app_users where id = pg_temp.uid('teste.acesso')));

select pg_temp.checar('mas o usuario NAO foi apagado', '1',
  (select count(*)::text from public.app_users where id = pg_temp.uid('teste.acesso')));

select pg_temp.checar('nem os papeis dele', '1',
  (select count(*)::text from public.user_roles
    where app_user_id = pg_temp.uid('teste.acesso')));

select pg_temp.checar('funcionario desligado nao tem acesso reativado', 'false',
  (public.definir_acesso(pg_temp.uid('teste.acesso'), true, 'Tentativa') ->> 'ok'));

select pg_temp.checar('ninguem desativa o proprio acesso', 'false',
  (public.definir_acesso('cccc1111-0000-0000-0000-000000000001', false, 'Tentativa') ->> 'ok'));

-- =============================================================================
-- D. ESCALADA DE PRIVILÉGIO — RN-RBAC-005
-- =============================================================================
set local request.jwt.claims = '{"sub":"aaaa3333-3333-3333-3333-333333333333","role":"authenticated"}';

select pg_temp.checar('o gerente administra papeis', 'true',
  public.has_permission('roles.manage')::text);

select pg_temp.checar('e NAO enxerga salario', 'false',
  public.has_permission('employees.finance.view')::text);

-- A PERGUNTA: ele consegue se promover?
select pg_temp.checar('o gerente NAO concede Owner/Admin a ninguem', 'true',
  (public.definir_papeis(pg_temp.uid('teste.acesso'),
     array[(select id from public.roles where name = 'Owner/Admin')],
     'Tentativa de escalada') ->> 'escalada'));

select pg_temp.checar('nem a si mesmo', 'true',
  (public.definir_papeis('cccc1111-0000-0000-0000-000000000003',
     array[(select id from public.roles where name = 'Owner/Admin')],
     'Tentativa de escalada') ->> 'escalada'));

select pg_temp.checar('o gerente continua com o papel dele', 'Gerente F8B',
  (select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.app_user_id = 'cccc1111-0000-0000-0000-000000000003'));

-- O Gerente NÃO tem `orders.accept` nem `cash.open`, que o papel Atendente
-- concede: barrar isto é a regra funcionando, não um excesso.
select pg_temp.checar('o gerente nao concede nem o Atendente, que tem mais que ele', 'true',
  (public.definir_papeis(pg_temp.uid('teste.acesso'),
     array[(select id from public.roles where name = 'Atendente')],
     'Papel com permissao que ele nao tem') ->> 'escalada'));

select pg_temp.checar('mas PODE conceder um papel dentro do que ele tem', 'true',
  (public.definir_papeis(pg_temp.uid('teste.acesso'),
     array['dddd1111-0000-0000-0000-00000000000a'::uuid],
     'Papel compativel') ->> 'ok'));

-- A interface já sabe o que ele não pode oferecer.
select pg_temp.checar('a projecao marca o papel que ele nao pode conceder', 'false',
  (select p ->> 'pode_conceder' from jsonb_array_elements(public.papeis_atribuiveis()) p
    where p ->> 'nome' = 'Owner/Admin'));

-- E a porta direta do /rest/v1 está fechada.
do $$
begin
  insert into public.user_roles (app_user_id, role_id)
  values ('cccc1111-0000-0000-0000-000000000003',
          (select id from public.roles where name = 'Owner/Admin'));
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values ('INSERT direto em user_roles e recusado', 'negado', 'PERMITIDO', false);
exception when insufficient_privilege then
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values ('INSERT direto em user_roles e recusado', 'negado', 'negado', true);
end;
$$;

-- =============================================================================
-- E. ISOLAMENTO SALARIAL COM A TELA MAIOR — §15, RN-FUNC-003
-- =============================================================================
set local request.jwt.claims = '{"sub":"aaaa2222-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('atendente VE a equipe', 'true',
  (jsonb_array_length(public.equipe()) > 0)::text);

select pg_temp.checar('atendente escolhe motoboy', 'true',
  (jsonb_array_length(public.central_de_entregas() -> 'motoboys') > 0)::text);

-- A parede continua de pé depois de a tela crescer.
select pg_temp.checar('a projecao da equipe NAO tem salario', 'false',
  (select (public.equipe()::text ilike '%salar%'))::text);

select pg_temp.checar('atendente NAO le o perfil salarial', '0',
  (select count(*)::text from public.employee_financial_profiles));

select pg_temp.checar('atendente NAO le o livro do funcionario', '0',
  (select count(*)::text from public.employee_ledger_entries));

select pg_temp.checar('atendente NAO cria funcionario', 'false',
  (public.salvar_funcionario('{"nome":"Forjado F8B","tipo":"other"}'::jsonb) ->> 'ok'));

select pg_temp.checar('atendente NAO desliga funcionario', 'false',
  (public.desligar_funcionario('bbbb1111-0000-0000-0000-000000000004',
    '{"motivo":"Tentativa"}'::jsonb) ->> 'ok'));

select pg_temp.checar('atendente NAO concede acesso', 'false',
  (public.vincular_acesso(jsonb_build_object(
     'funcionario_id','bbbb1111-0000-0000-0000-000000000004',
     'email','novato@teste.local')) ->> 'ok'));

select pg_temp.checar('atendente NAO define papeis', 'false',
  (public.definir_papeis(pg_temp.uid('teste.acesso'),
     array[(select id from public.roles where name = 'Atendente')], 'Tentativa') ->> 'ok'));

select pg_temp.checar('atendente NAO paga adiantamento', 'false',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id','bbbb1111-0000-0000-0000-000000000004',
     'tipo','advance','valor',50.00,'motivo','Tentativa','pelo_caixa',true)) ->> 'ok'));

select pg_temp.checar('atendente NAO transfere... ele PODE, e isso e a regra', 'true',
  public.has_permission('deliveries.manage')::text);

-- =============================================================================
-- F. SUPERFÍCIE PÚBLICA
-- =============================================================================
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select pg_temp.checar('anon nao le transferencias', '0',
  (select count(*)::text from public.delivery_transfers));
select pg_temp.checar('anon nao le funcionarios', '0',
  (select count(*)::text from public.employees));
select pg_temp.checar('anon nao le usuarios', '0',
  (select count(*)::text from public.app_users));
select pg_temp.checar('anon nao le papeis atribuidos', '0',
  (select count(*)::text from public.user_roles));

select pg_temp.checar('anon nao executa transferir_entrega', 'false',
  has_function_privilege('anon','public.transferir_entrega(uuid, jsonb)','execute')::text);
select pg_temp.checar('anon nao executa salvar_funcionario', 'false',
  has_function_privilege('anon','public.salvar_funcionario(jsonb)','execute')::text);
select pg_temp.checar('anon nao executa desligar_funcionario', 'false',
  has_function_privilege('anon','public.desligar_funcionario(uuid, jsonb)','execute')::text);
select pg_temp.checar('anon nao executa vincular_acesso', 'false',
  has_function_privilege('anon','public.vincular_acesso(jsonb)','execute')::text);
select pg_temp.checar('anon nao executa definir_papeis', 'false',
  has_function_privilege('anon','public.definir_papeis(uuid, uuid[], text)','execute')::text);
select pg_temp.checar('anon nao executa definir_acesso', 'false',
  has_function_privilege('anon','public.definir_acesso(uuid, boolean, text)','execute')::text);
select pg_temp.checar('anon nao executa equipe', 'false',
  has_function_privilege('anon','public.equipe()','execute')::text);
select pg_temp.checar('anon nao executa dinheiro_da_corrida', 'false',
  has_function_privilege('anon','public.dinheiro_da_corrida(uuid, boolean)','execute')::text);

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
