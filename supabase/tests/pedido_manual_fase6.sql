-- =============================================================================
-- TESTES DO PEDIDO MANUAL E DO CONFIGURADOR COMPARTILHADO — COMPLEMENTO F6
--
-- 04-REGRAS-NEGOCIO.md RN-MAN-001..003, RN-ALT-001..007, RN-PIZZA, RN-BORDA,
-- RN-ADD, RN-COMBO · CLAUDE.md §16, §17, §34 · 03 §9.2
--
-- A PERGUNTA CENTRAL: o balcão consegue fazer algo que o cliente não pode?
--
-- Não deve. Pedido manual passa pela MESMA `criar_pedido` e pela MESMA
-- `montar_item`. Estar no administrativo não contorna disponibilidade,
-- compatibilidade nem preço — só muda quem lança e por qual canal.
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
  ('77777777-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona7@teste.local','x',now(),now(),now()),
  ('77777777-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','atendente7@teste.local','x',now(),now(),now()),
  ('77777777-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','observador7@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a7a7a7a7-0000-0000-0000-000000000001','Dona F6M','owner',false,'active'),
  ('a7a7a7a7-0000-0000-0000-000000000002','Atendente F6M','counter',false,'active'),
  ('a7a7a7a7-0000-0000-0000-000000000003','Observador F6M','counter',false,'active');

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b7b7b7b7-0000-0000-0000-000000000001','77777777-1111-1111-1111-111111111111','a7a7a7a7-0000-0000-0000-000000000001',true),
  ('b7b7b7b7-0000-0000-0000-000000000002','77777777-2222-2222-2222-222222222222','a7a7a7a7-0000-0000-0000-000000000002',true),
  ('b7b7b7b7-0000-0000-0000-000000000003','77777777-3333-3333-3333-333333333333','a7a7a7a7-0000-0000-0000-000000000003',true);

insert into public.user_roles (app_user_id, role_id)
select 'b7b7b7b7-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
select 'b7b7b7b7-0000-0000-0000-000000000002', id from public.roles where name = 'Atendente';

-- Um papel que só ENXERGA. Serve para provar que lançar pedido depende da
-- permissão, e não de estar autenticado no administrativo.
insert into public.roles (id, name, description, is_system, is_active)
values ('c7c7c7c7-0000-0000-0000-00000000000f','Observador F6M','Só visualiza pedidos', false, true);
insert into public.role_permissions (role_id, permission_id)
select 'c7c7c7c7-0000-0000-0000-00000000000f', id from public.permissions where code = 'orders.view';
insert into public.user_roles (app_user_id, role_id)
values ('b7b7b7b7-0000-0000-0000-000000000003','c7c7c7c7-0000-0000-0000-00000000000f');

delete from public.store_settings;
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code, latitude, longitude,
  automatic_delivery_radius_km,
  delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values (
  'ccccccc7-0000-0000-0000-000000000001','Shalon F6M','5500000000000','Rua T','1','Centro',
  'Cidade','XX','00000-000', -23.5, -46.6, 4.0, 40, 60, 20, 30, true, 'America/Sao_Paulo'
);

delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 4, 8.00, true, 1);

-- Dois tamanhos: um aceita meio a meio, o outro não (RN-PIZZA-004).
insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d7d7d7d7-0000-0000-0000-000000000001','Grande F6M', 8, 2, 701),
  ('d7d7d7d7-0000-0000-0000-000000000002','Broto F6M',  4, 1, 702);

insert into public.categories (id, name, slug, sort_order) values
  ('c7c7c7c7-0000-0000-0000-000000000001','Pizzas F6M','pizzas-f6m', 701),
  ('c7c7c7c7-0000-0000-0000-000000000002','Combos F6M','combos-f6m', 702);

insert into public.products (id, category_id, product_type, name, slug, base_price, max_addons, sort_order, is_active) values
  ('b7b7b7b7-1000-0000-0000-000000000001','c7c7c7c7-0000-0000-0000-000000000001','pizza','Calabresa F6M','calabresa-f6m', null, 3, 1, true),
  ('b7b7b7b7-1000-0000-0000-000000000002','c7c7c7c7-0000-0000-0000-000000000001','pizza','Portuguesa F6M','portuguesa-f6m', null, 3, 2, true),
  ('b7b7b7b7-1000-0000-0000-000000000003','c7c7c7c7-0000-0000-0000-000000000001','pizza','Esgotada F6M','esgotada-f6m', null, 3, 3, true),
  ('b7b7b7b7-1000-0000-0000-000000000004','c7c7c7c7-0000-0000-0000-000000000002','combo','Combo F6M','combo-f6m', 90.00, null, 4, true);

insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available) values
  -- Calabresa: 50 no grande, 30 no broto.
  ('a7a7a7a7-1000-0000-0000-000000000001','b7b7b7b7-1000-0000-0000-000000000001','d7d7d7d7-0000-0000-0000-000000000001', 50.00, true, true),
  ('a7a7a7a7-1000-0000-0000-000000000002','b7b7b7b7-1000-0000-0000-000000000001','d7d7d7d7-0000-0000-0000-000000000002', 30.00, true, true),
  -- Portuguesa: 60 no grande. É a MAIS CARA — o meio a meio deve cobrar 60.
  ('a7a7a7a7-1000-0000-0000-000000000003','b7b7b7b7-1000-0000-0000-000000000002','d7d7d7d7-0000-0000-0000-000000000001', 60.00, true, true),
  -- Portuguesa NÃO é oferecida no broto: serve para testar incompatibilidade.
  -- Esgotada existe, mas está pausada.
  ('a7a7a7a7-1000-0000-0000-000000000004','b7b7b7b7-1000-0000-0000-000000000003','d7d7d7d7-0000-0000-0000-000000000001', 45.00, true, false);

-- Borda só no GRANDE (RN-BORDA-002: preço e disponibilidade por tamanho).
insert into public.crusts (id, name, is_active, sort_order) values
  ('e7e7e7e7-0000-0000-0000-000000000001','Catupiry F6M', true, 701);
insert into public.crust_size_prices (crust_id, size_id, price, is_active, is_temporarily_available) values
  ('e7e7e7e7-0000-0000-0000-000000000001','d7d7d7d7-0000-0000-0000-000000000001', 10.00, true, true);

-- Adicional só no GRANDE (RN-ADD-002).
insert into public.addons (id, name, is_active, sort_order) values
  ('f7f7f7f7-0000-0000-0000-000000000001','Bacon F6M', true, 701);
insert into public.addon_size_prices (addon_id, size_id, price, is_active) values
  ('f7f7f7f7-0000-0000-0000-000000000001','d7d7d7d7-0000-0000-0000-000000000001', 7.00, true);

-- RN-COMBO-001: composição fixa.
insert into public.combo_components (combo_product_id, component_product_id, component_variant_id, quantity, sort_order)
values ('b7b7b7b7-1000-0000-0000-000000000004','b7b7b7b7-1000-0000-0000-000000000001','a7a7a7a7-1000-0000-0000-000000000001', 1, 1);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
select set_config('teste.credito',  (select id::text from public.payment_methods where code='credito'), true);

create or replace function pg_temp.manual(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $$
declare
  v_idem text := coalesce(p ->> 'idem', gen_random_uuid()::text);
begin
  -- Sem segredo de origem: é o caminho interno, autorizado pela permissão.
  return public.criar_pedido(
    jsonb_build_object(
      'idempotency_key', v_idem,
      'tracking_token', md5(v_idem) || md5(v_idem || ':2'),
      'origem', coalesce(p ->> 'origem', 'counter'),
      'modalidade', coalesce(p ->> 'modalidade', 'pickup'),
      'cliente', jsonb_build_object('nome', coalesce(p ->> 'nome', 'Cliente Manual'),
                                    'whatsapp', coalesce(p ->> 'whatsapp', '(11) 97000-0001')),
      'itens', coalesce(p -> 'itens', jsonb_build_array(jsonb_build_object(
                 'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
                 'variacao_id','a7a7a7a7-1000-0000-0000-000000000001','quantidade',1))),
      'pagamento', coalesce(p -> 'pagamento',
                     jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))),
      'observacao_geral', p ->> 'observacao'
    ),
    '');
end;
$$;

-- =============================================================================
-- O CONFIGURADOR É O MESMO — regressão pelas regras que ele aplica
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('pizza inteira custa o preco do tamanho', '50.00',
  (public.montar_item(jsonb_build_object(
     'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
     'variacao_id','a7a7a7a7-1000-0000-0000-000000000001','quantidade',1)) ->> 'preco_unitario'));

-- RN-PIZZA-005: meio a meio cobra o MAIOR preço efetivo.
select pg_temp.checar('meio a meio cobra o maior preco efetivo', '60.00',
  (public.montar_item(jsonb_build_object(
     'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
     'variacao_id','a7a7a7a7-1000-0000-0000-000000000001',
     'sabores', jsonb_build_array('a7a7a7a7-1000-0000-0000-000000000001',
                                  'a7a7a7a7-1000-0000-0000-000000000003'),
     'quantidade',1)) ->> 'preco_unitario'));

-- RN-PIZZA-004: o tamanho decide quantos sabores cabem.
select pg_temp.checar('tamanho de 1 sabor recusa meio a meio', 'false',
  (public.montar_item(jsonb_build_object(
     'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
     'variacao_id','a7a7a7a7-1000-0000-0000-000000000002',
     'sabores', jsonb_build_array('a7a7a7a7-1000-0000-0000-000000000002',
                                  'a7a7a7a7-1000-0000-0000-000000000003'),
     'quantidade',1)) ->> 'ok'));

select pg_temp.checar('borda indisponivel no tamanho e recusada', 'false',
  (public.montar_item(jsonb_build_object(
     'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
     'variacao_id','a7a7a7a7-1000-0000-0000-000000000002',
     'borda_id','e7e7e7e7-0000-0000-0000-000000000001','quantidade',1)) ->> 'ok'));

select pg_temp.checar('borda valida soma ao preco efetivo', '60.00',
  (public.montar_item(jsonb_build_object(
     'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
     'variacao_id','a7a7a7a7-1000-0000-0000-000000000001',
     'borda_id','e7e7e7e7-0000-0000-0000-000000000001','quantidade',1)) ->> 'preco_unitario'));

select pg_temp.checar('adicional indisponivel no tamanho e recusado', 'false',
  (public.montar_item(jsonb_build_object(
     'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
     'variacao_id','a7a7a7a7-1000-0000-0000-000000000002',
     'adicionais', jsonb_build_array('f7f7f7f7-0000-0000-0000-000000000001'),
     'quantidade',1)) ->> 'ok'));

select pg_temp.checar('adicional valido soma', '57.00',
  (public.montar_item(jsonb_build_object(
     'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
     'variacao_id','a7a7a7a7-1000-0000-0000-000000000001',
     'adicionais', jsonb_build_array('f7f7f7f7-0000-0000-0000-000000000001'),
     'quantidade',1)) ->> 'preco_unitario'));

select pg_temp.checar('produto pausado e recusado', 'false',
  (public.montar_item(jsonb_build_object(
     'produto_id','b7b7b7b7-1000-0000-0000-000000000003',
     'variacao_id','a7a7a7a7-1000-0000-0000-000000000004','quantidade',1)) ->> 'ok'));

-- RN-COMBO-002: preço próprio, composição fixa no snapshot.
select pg_temp.checar('combo tem preco proprio', '90.00',
  (public.montar_item(jsonb_build_object(
     'produto_id','b7b7b7b7-1000-0000-0000-000000000004','quantidade',1)) ->> 'preco_unitario'));

select pg_temp.checar('combo traz a composicao no detalhe', '1',
  (jsonb_array_length(public.montar_item(jsonb_build_object(
     'produto_id','b7b7b7b7-1000-0000-0000-000000000004','quantidade',1))
     -> 'detalhe' -> 'combo'))::text);

-- =============================================================================
-- PEDIDO MANUAL — canais, regras e permissão
-- =============================================================================
select pg_temp.checar('atendente lanca pedido de WhatsApp', 'true',
  (pg_temp.manual('{"origem":"whatsapp","idem":"77000001-0000-0000-0000-000000000001"}'::jsonb) ->> 'ok'));

select pg_temp.checar('origem WhatsApp fica registrada', 'whatsapp',
  (pg_temp.manual('{"origem":"whatsapp","idem":"77000002-0000-0000-0000-000000000002"}'::jsonb) ->> 'origem'));

select pg_temp.checar('origem telefone fica registrada', 'phone',
  (pg_temp.manual('{"origem":"phone","idem":"77000003-0000-0000-0000-000000000003"}'::jsonb) ->> 'origem'));

select pg_temp.checar('origem balcao fica registrada', 'counter',
  (pg_temp.manual('{"origem":"counter","idem":"77000004-0000-0000-0000-000000000004"}'::jsonb) ->> 'origem'));

select pg_temp.checar('origem iFood fica registrada', 'ifood',
  (pg_temp.manual('{"origem":"ifood","idem":"77000005-0000-0000-0000-000000000005"}'::jsonb) ->> 'origem'));

select pg_temp.checar('origem outro fica registrada', 'other',
  (pg_temp.manual('{"origem":"other","idem":"77000006-0000-0000-0000-000000000006"}'::jsonb) ->> 'origem'));

select pg_temp.checar('origem inventada e recusada', 'Origem de pedido inválida.',
  (pg_temp.manual('{"origem":"telepatia","idem":"77000007-0000-0000-0000-000000000007"}'::jsonb) ->> 'erro'));

-- RN-MAN-003: o balcão não contorna as regras estruturais.
select pg_temp.checar('balcao NAO vende produto pausado', 'true',
  (pg_temp.manual(jsonb_build_object('idem','77000008-0000-0000-0000-000000000008',
     'itens', jsonb_build_array(jsonb_build_object(
       'produto_id','b7b7b7b7-1000-0000-0000-000000000003',
       'variacao_id','a7a7a7a7-1000-0000-0000-000000000004','quantidade',1))))
   ->> 'reconfirmar'));

select pg_temp.checar('balcao NAO fura o meio a meio do broto', 'true',
  (pg_temp.manual(jsonb_build_object('idem','77000009-0000-0000-0000-000000000009',
     'itens', jsonb_build_array(jsonb_build_object(
       'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
       'variacao_id','a7a7a7a7-1000-0000-0000-000000000002',
       'sabores', jsonb_build_array('a7a7a7a7-1000-0000-0000-000000000002',
                                    'a7a7a7a7-1000-0000-0000-000000000003'),
       'quantidade',1))))
   ->> 'reconfirmar'));

select pg_temp.checar('meio a meio no balcao cobra o maior preco', '60.00',
  (pg_temp.manual(jsonb_build_object('idem','77000010-0000-0000-0000-000000000010',
     'itens', jsonb_build_array(jsonb_build_object(
       'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
       'variacao_id','a7a7a7a7-1000-0000-0000-000000000001',
       'sabores', jsonb_build_array('a7a7a7a7-1000-0000-0000-000000000001',
                                    'a7a7a7a7-1000-0000-0000-000000000003'),
       'quantidade',1))))
   ->> 'total'));

select pg_temp.checar('combo entra no pedido manual', '90.00',
  (pg_temp.manual(jsonb_build_object('idem','77000011-0000-0000-0000-000000000011',
     'itens', jsonb_build_array(jsonb_build_object(
       'produto_id','b7b7b7b7-1000-0000-0000-000000000004','quantidade',1))))
   ->> 'total'));

-- Observação do item chega ao snapshot, que é o que a cozinha lê.
select set_config('teste.p_obs',
  (pg_temp.manual(jsonb_build_object('idem','77000012-0000-0000-0000-000000000012',
     'itens', jsonb_build_array(jsonb_build_object(
       'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
       'variacao_id','a7a7a7a7-1000-0000-0000-000000000001',
       'observacao','sem cebola','quantidade',1))))
   ->> 'pedido_id'), true);

select pg_temp.checar('observacao do item vai para o snapshot', 'sem cebola',
  (select observation from public.order_items
    where order_id = current_setting('teste.p_obs', true)::uuid));

-- RN-PGTO: pagamento esperado usa o cadastro; troco é calculado.
select pg_temp.checar('troco calculado no pedido manual', '50.00',
  (pg_temp.manual(jsonb_build_object('idem','77000013-0000-0000-0000-000000000013',
     'pagamento', jsonb_build_object(
       'forma_id', current_setting('teste.dinheiro', true),
       'precisa_troco', true, 'troco_para', 100)))
   ->> 'troco_esperado'));

select pg_temp.checar('bandeira obrigatoria vale no balcao tambem', 'true',
  ((pg_temp.manual(jsonb_build_object('idem','77000014-0000-0000-0000-000000000014',
     'pagamento', jsonb_build_object('forma_id', current_setting('teste.credito', true))))
   ->> 'erro') ilike '%bandeira%')::text);

-- RN-MAN: o pedido manual nasce na fila, como qualquer outro.
select pg_temp.checar('pedido manual nasce aguardando aceite', 'waiting_store_confirmation',
  (pg_temp.manual('{"idem":"77000015-0000-0000-0000-000000000015"}'::jsonb) ->> 'status'));

-- CLAUDE.md §34: clique duplo não vira dois pedidos.
select set_config('teste.numero',
  (pg_temp.manual('{"idem":"77000016-0000-0000-0000-000000000016"}'::jsonb) ->> 'numero'), true);

select pg_temp.checar('reenvio do manual nao cria segundo pedido', 'true',
  (pg_temp.manual('{"idem":"77000016-0000-0000-0000-000000000016"}'::jsonb) ->> 'ja_existia'));

select pg_temp.checar('reenvio devolve o mesmo numero', current_setting('teste.numero', true),
  (pg_temp.manual('{"idem":"77000016-0000-0000-0000-000000000016"}'::jsonb) ->> 'numero'));

-- §33: quem lançou fica registrado.
select set_config('teste.p_autor',
  (pg_temp.manual('{"idem":"77000017-0000-0000-0000-000000000017"}'::jsonb) ->> 'pedido_id'), true);

select pg_temp.checar('pedido manual registra quem lancou', 'true',
  (select (created_by_user_id = 'b7b7b7b7-0000-0000-0000-000000000002')::text
     from public.orders where id = current_setting('teste.p_autor', true)::uuid));

-- §15 e §33: o Atendente opera, mas não lê auditoria. A verificação de que
-- o registro EXISTE precisa ser feita por quem tem `audit.view` — ler como
-- Atendente mediria o RLS, não a auditoria.
select pg_temp.checar('atendente NAO le a auditoria', '0',
  (select count(*)::text from public.audit_logs
    where action = 'criar_pedido_manual'));

select pg_temp.checar('historico do manual diz que foi a equipe', 'Pedido lançado pela equipe',
  (select reason from public.order_status_history
    where order_id = current_setting('teste.p_autor', true)::uuid));

reset role;

-- =============================================================================
-- AUDITORIA — verificada por quem tem `audit.view`
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('lancamento manual fica auditado', 'true',
  (select (count(*) > 0)::text from public.audit_logs
    where action = 'criar_pedido_manual'
      and entity_id = current_setting('teste.p_autor', true)::uuid));

select pg_temp.checar('auditoria guarda a origem do lancamento', 'counter',
  (select after_data ->> 'origem' from public.audit_logs
    where action = 'criar_pedido_manual'
      and entity_id = current_setting('teste.p_autor', true)::uuid));

reset role;

-- =============================================================================
-- PERMISSÃO — lançar pedido não é consequência de estar logado
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-3333-3333-3333-333333333333","role":"authenticated"}';

select pg_temp.checar('sem orders.create_manual nao lanca', 'Não foi possível enviar o pedido por aqui.',
  (pg_temp.manual('{"idem":"77000018-0000-0000-0000-000000000018"}'::jsonb) ->> 'erro'));

select pg_temp.checar('observador enxerga a fila', 'true',
  (jsonb_array_length(public.fila_de_pedidos(false)) > 0)::text);

reset role;

-- O público continua sem poder declarar canal: a origem dele é sempre o link.
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select pg_temp.checar('anon nao lanca pedido sem o segredo', 'Não foi possível enviar o pedido por aqui.',
  (public.criar_pedido(jsonb_build_object(
     'idempotency_key','77000019-0000-0000-0000-000000000019',
     'tracking_token', repeat('b', 64),
     'origem','counter', 'modalidade','pickup',
     'cliente', jsonb_build_object('nome','Espertinho','whatsapp','(11) 97000-0009'),
     'itens', jsonb_build_array(jsonb_build_object(
       'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
       'variacao_id','a7a7a7a7-1000-0000-0000-000000000001','quantidade',1)),
     'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))
   ), 'chute') ->> 'erro'));

reset role;

-- =============================================================================
-- ALTERAÇÃO — acrescentar item, e a versão do pedido
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-2222-2222-2222-222222222222","role":"authenticated"}';

select set_config('teste.p_alt',
  (pg_temp.manual('{"idem":"77000020-0000-0000-0000-000000000020"}'::jsonb) ->> 'pedido_id'), true);

select set_config('teste.versao',
  (select updated_at::text from public.orders
    where id = current_setting('teste.p_alt', true)::uuid), true);

-- CLAUDE.md §34: proposta feita sobre versão obsoleta é recusada.
select pg_temp.checar('proposta com versao obsoleta e recusada', 'true',
  (public.propor_alteracao(current_setting('teste.p_alt', true)::uuid, jsonb_build_object(
     'motivo','Teste de concorrência',
     'versao','2020-01-01T00:00:00Z',
     'itens', jsonb_build_array(jsonb_build_object(
       'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
       'variacao_id','a7a7a7a7-1000-0000-0000-000000000001','quantidade',1))))
   ->> 'versao_obsoleta'));

-- Acrescentar item: o pedido tinha 1 Calabresa de 50; passa a ter também uma
-- Portuguesa de 60. Total esperado: 110.
select pg_temp.checar('alteracao acrescenta item novo', '110.00',
  (public.propor_alteracao(current_setting('teste.p_alt', true)::uuid, jsonb_build_object(
     'motivo','Cliente pediu mais uma pizza',
     'versao', current_setting('teste.versao', true),
     'itens', jsonb_build_array(
       jsonb_build_object('produto_id','b7b7b7b7-1000-0000-0000-000000000001',
                          'variacao_id','a7a7a7a7-1000-0000-0000-000000000001','quantidade',1),
       jsonb_build_object('produto_id','b7b7b7b7-1000-0000-0000-000000000002',
                          'variacao_id','a7a7a7a7-1000-0000-0000-000000000003','quantidade',1))))
   ->> 'total'));

select pg_temp.checar('acrescimo exige aprovacao do cliente', 'change_requested_waiting_customer',
  (select status from public.orders where id = current_setting('teste.p_alt', true)::uuid));

select pg_temp.checar('revisao guarda o antes', '50.00',
  (select total_before::text from public.order_revisions
    where order_id = current_setting('teste.p_alt', true)::uuid));

select pg_temp.checar('revisao guarda o depois', '110.00',
  (select total_after::text from public.order_revisions
    where order_id = current_setting('teste.p_alt', true)::uuid));

select pg_temp.checar('itens do pedido ainda nao mudaram', '1',
  (select count(*)::text from public.order_items
    where order_id = current_setting('teste.p_alt', true)::uuid));

reset role;

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select pg_temp.checar('cliente aprova o acrescimo', 'true',
  (public.decidir_alteracao(
     md5('77000020-0000-0000-0000-000000000020') || md5('77000020-0000-0000-0000-000000000020' || ':2'),
     true) ->> 'ok'));

reset role;

select pg_temp.checar('pedido passa a ter dois itens', '2',
  (select count(*)::text from public.order_items
    where order_id = current_setting('teste.p_alt', true)::uuid));

select pg_temp.checar('total do pedido acompanhou o acrescimo', '110.00',
  (select total::text from public.orders
    where id = current_setting('teste.p_alt', true)::uuid));

-- Remover linha e mudar quantidade continuam funcionando.
set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('alteracao remove linha e muda quantidade', '100.00',
  (public.propor_alteracao(current_setting('teste.p_alt', true)::uuid, jsonb_build_object(
     'motivo','Acabou a portuguesa; cliente dobrou a calabresa',
     'itens', jsonb_build_array(
       jsonb_build_object('produto_id','b7b7b7b7-1000-0000-0000-000000000001',
                          'variacao_id','a7a7a7a7-1000-0000-0000-000000000001','quantidade',2))))
   ->> 'total'));

select pg_temp.checar('alteracao sem permissao e recusada', 'true',
  (select (public.has_permission('orders.request_change'))::text));

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-3333-3333-3333-333333333333","role":"authenticated"}';

select pg_temp.checar('observador NAO propoe alteracao', 'Você não tem permissão para alterar pedidos.',
  (public.propor_alteracao(current_setting('teste.p_alt', true)::uuid, jsonb_build_object(
     'motivo','tentativa',
     'itens', jsonb_build_array(jsonb_build_object(
       'produto_id','b7b7b7b7-1000-0000-0000-000000000001',
       'variacao_id','a7a7a7a7-1000-0000-0000-000000000001','quantidade',1))))
   ->> 'erro'));

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
