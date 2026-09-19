-- =============================================================================
-- TESTES DA CRIAÇÃO SEGURA DO PEDIDO — FASE 5
--
-- 05-PLANO-IMPLEMENTACAO.md §9 · 03-RLS-RBAC-SEGURANCA.md §9, §10, §11, §12
-- 04-REGRAS-NEGOCIO.md RN-VALID, RN-CLI, RN-ENT, RN-PGTO, RN-CHK, RN-PED
-- CLAUDE.md §16, §20, §23, §29, §34
--
-- A PERGUNTA QUE ESTE ARQUIVO RESPONDE: o cliente consegue, de alguma forma,
-- impor preço, taxa, distância, disponibilidade ou total?
--
-- Tudo que simula o cliente roda como `anon`, que é o papel real do
-- navegador. As fixtures rodam como dono, porque criar catálogo é trabalho
-- administrativo — e isso é justamente o que `anon` não pode fazer.
--
-- ARMADILHA JÁ PAGA DUAS VEZES: sub-select executado depois de `set role
-- anon` devolve NULL em tabela sem policy para `anon`, e o teste passa a
-- medir outra coisa. Por isso todo valor de fixture é capturado ANTES da
-- troca de papel, com `set_config`. É assim que o servidor Node funciona de
-- verdade: ele já chega com o segredo na mão.
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
returns void language plpgsql as $$
begin
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido);
end;
$$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code, latitude, longitude,
  delivery_minimum_enabled, delivery_minimum_subtotal, automatic_delivery_radius_km,
  delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values (
  'ccccccc5-0000-0000-0000-000000000001','Shalon F5','5500000000000','Rua T','1','Centro',
  'Cidade','XX','00000-000', -23.5, -46.6,
  true, 60.00, 4.0, 40, 60, 20, 30, true, 'America/Sao_Paulo'
);

delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

-- RN-ENT-015: fronteira (min, max], e a faixa iniciada em 0 cobre o 0.
insert into public.delivery_fee_bands (id, min_distance_km, max_distance_km, fee, is_active, sort_order) values
  ('fa1a0005-0000-0000-0000-000000000001', 0, 2, 5.00,  true, 1),
  ('fa1a0005-0000-0000-0000-000000000002', 2, 4, 8.00,  true, 2),
  ('fa1a0005-0000-0000-0000-000000000003', 4, 8, 14.00, true, 3);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d5d5d5d5-0000-0000-0000-000000000001','Grande F5', 8, 2, 201);

insert into public.categories (id, name, slug, sort_order) values
  ('c5c5c5c5-0000-0000-0000-000000000001','Pizzas F5','pizzas-f5', 201);

insert into public.products (id, category_id, product_type, name, slug, base_price, sort_order, is_active) values
  ('b5b5b5b5-0000-0000-0000-000000000001','c5c5c5c5-0000-0000-0000-000000000001','pizza','Calabresa F5','calabresa-f5', null, 1, true),
  ('b5b5b5b5-0000-0000-0000-000000000002','c5c5c5c5-0000-0000-0000-000000000001','pizza','Mussarela F5','mussarela-f5', null, 2, true),
  ('b5b5b5b5-0000-0000-0000-000000000003','c5c5c5c5-0000-0000-0000-000000000001','other','Indisponivel F5','indisponivel-f5', 20.00, 3, true);

insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available) values
  ('a5a5a5a5-0000-0000-0000-000000000001','b5b5b5b5-0000-0000-0000-000000000001','d5d5d5d5-0000-0000-0000-000000000001', 50.00, true, true),
  ('a5a5a5a5-0000-0000-0000-000000000002','b5b5b5b5-0000-0000-0000-000000000002','d5d5d5d5-0000-0000-0000-000000000001', 40.00, true, true);

-- Produto pausado: serve para provar que item indisponível barra o pedido.
update public.products set is_temporarily_available = false
  where id = 'b5b5b5b5-0000-0000-0000-000000000003';

-- Captura ANTES de virar `anon`. Depois disso, estas tabelas não respondem.
select set_config('teste.segredo', (select valor from public.server_secrets where chave='checkout_origem'), true);
select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
select set_config('teste.credito',  (select id::text from public.payment_methods where code='credito'), true);
select set_config('teste.pix_chave',(select id::text from public.payment_methods where code='pix_chave'), true);
select set_config('teste.pix_maq',  (select id::text from public.payment_methods where code='pix_maquininha'), true);

-- Token de acompanhamento do teste.
--
-- `hash_token` é interna e `anon` não a executa — e é assim que deve ser.
-- O que importa aqui é a PROPRIEDADE que a produção garante: o token é
-- derivado da chave da tentativa, então o reenvio repete o token e
-- tentativas diferentes nunca colidem no índice único.
create or replace function pg_temp.token(p_idem text)
returns text language sql immutable as $$
  select md5(p_idem) || md5(p_idem || ':2');
$$;

-- Pedido-base reutilizado: 2 pizzas de R$ 50,00 = R$ 100,00 de subtotal.
create or replace function pg_temp.pedido(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $$
declare
  v_idem text := coalesce(p ->> 'idem', gen_random_uuid()::text);
  -- Espelha a produção: o token vem da chave da tentativa, não é sorteado.
  -- Reenviar a MESMA tentativa produz o MESMO token; tentativas diferentes
  -- produzem tokens diferentes, que é o que o índice único exige.
  v_token text := coalesce(p ->> 'token', pg_temp.token(v_idem));
begin
  return public.criar_pedido(
    jsonb_build_object(
      'idempotency_key', v_idem,
      'tracking_token', v_token,
      'modalidade', coalesce(p ->> 'modalidade', 'delivery'),
      'cliente', coalesce(p -> 'cliente', jsonb_build_object('nome','Maria Teste','whatsapp','(11) 90000-0001')),
      'endereco', case when coalesce(p ->> 'modalidade','delivery') = 'pickup' then null
                       else coalesce(p -> 'endereco', jsonb_build_object(
                         'logradouro','Rua X','numero','10','bairro','Centro',
                         'cidade','Cidade','uf','XX','latitude',-23.51,'longitude',-46.61,
                         'confianca','exata','provedor','teste')) end,
      'rota', case when coalesce(p ->> 'modalidade','delivery') = 'pickup' then null
                   else coalesce(p -> 'rota', jsonb_build_object('distancia_km', 3.2, 'provedor','teste')) end,
      'itens', coalesce(p -> 'itens', jsonb_build_array(jsonb_build_object(
                 'linha','l1','produto_id','b5b5b5b5-0000-0000-0000-000000000001',
                 'variacao_id','a5a5a5a5-0000-0000-0000-000000000001','quantidade',2))),
      'pagamento', coalesce(p -> 'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))),
      'observacao_geral', p ->> 'observacao'
    ),
    coalesce(p ->> 'segredo', current_setting('teste.segredo', true))
  );
end;
$$;

-- =============================================================================
-- A PARTIR DAQUI, O CLIENTE PÚBLICO
-- =============================================================================
set local role anon;

-- ------------------------------------------------------- 1. prova de origem
select pg_temp.checar('criar_pedido sem segredo e recusado', 'false',
  (pg_temp.pedido('{"segredo":""}'::jsonb) ->> 'ok'));

select pg_temp.checar('criar_pedido com segredo errado e recusado', 'false',
  (pg_temp.pedido('{"segredo":"chute"}'::jsonb) ->> 'ok'));

select pg_temp.checar('segredo errado nao revela o motivo interno', 'false',
  ((pg_temp.pedido('{"segredo":"chute"}'::jsonb) ->> 'erro') ilike '%segredo%')::text);

select pg_temp.checar('cotar_entrega sem segredo e recusada', 'origem_nao_confiavel',
  (public.cotar_entrega(3.2, 'chute') ->> 'erro'));

select pg_temp.checar('origem_da_loja sem segredo nao revela coordenada', 'origem_nao_confiavel',
  (public.origem_da_loja('chute') ->> 'erro'));

select pg_temp.checar('origem_da_loja com segredo devolve a origem configurada', 'true',
  (public.origem_da_loja(current_setting('teste.segredo', true)) ->> 'ok'));

-- --------------------------------------------------------- 2. RLS das portas
select pg_temp.checar('anon nao le orders', '0',
  (select count(*)::text from public.orders));

select pg_temp.checar('anon nao le customers', '0',
  (select count(*)::text from public.customers));

select pg_temp.checar('anon nao le payments', '0',
  (select count(*)::text from public.payments));

select pg_temp.checar('anon nao le order_payment_intents', '0',
  (select count(*)::text from public.order_payment_intents));

select pg_temp.checar('anon nao le o segredo do servidor', '0',
  (select count(*)::text from public.server_secrets));

select pg_temp.checar('anon nao tem policy de insert em orders', 'negado',
  (select case when exists (select 1 from pg_policies
                where schemaname='public' and tablename='orders'
                  and 'anon' = any(roles) and cmd in ('INSERT','ALL'))
               then 'PERMITIDO' else 'negado' end));

select pg_temp.checar('anon nao tem policy de insert em customers', 'negado',
  (select case when exists (select 1 from pg_policies
                where schemaname='public' and tablename='customers'
                  and 'anon' = any(roles) and cmd in ('INSERT','ALL'))
               then 'PERMITIDO' else 'negado' end));

-- ------------------------------------------------------------- 3. o cliente
select pg_temp.checar('nome vazio barra o pedido', 'Informe seu nome.',
  (pg_temp.pedido('{"cliente":{"nome":"","whatsapp":"11900000001"}}'::jsonb) ->> 'erro'));

select pg_temp.checar('whatsapp invalido barra o pedido', 'Informe um WhatsApp válido com DDD.',
  (pg_temp.pedido('{"cliente":{"nome":"Maria Teste","whatsapp":"123"}}'::jsonb) ->> 'erro'));

-- ---------------------------------------------------------------- 4. itens
select pg_temp.checar('carrinho vazio barra o pedido', 'Seu carrinho está vazio.',
  (pg_temp.pedido('{"itens":[]}'::jsonb) ->> 'erro'));

select pg_temp.checar('item indisponivel exige reconfirmacao', 'true',
  (pg_temp.pedido(jsonb_build_object('itens', jsonb_build_array(jsonb_build_object(
     'linha','l1','produto_id','b5b5b5b5-0000-0000-0000-000000000003','quantidade',1))))
   ->> 'reconfirmar'));

-- RN-VALID-003: preço diferente do visto nunca passa em silêncio.
select pg_temp.checar('preco diferente do visto exige reconfirmacao', 'preco_alterado',
  (pg_temp.pedido(jsonb_build_object('itens', jsonb_build_array(jsonb_build_object(
     'linha','l1','produto_id','b5b5b5b5-0000-0000-0000-000000000001',
     'variacao_id','a5a5a5a5-0000-0000-0000-000000000001','quantidade',1,
     'preco_unitario_visto', 1.00))))
   -> 'divergencias' -> 0 ->> 'tipo'));

select pg_temp.checar('preco igual ao visto segue normalmente', 'true',
  (pg_temp.pedido(jsonb_build_object('itens', jsonb_build_array(jsonb_build_object(
     'linha','l1','produto_id','b5b5b5b5-0000-0000-0000-000000000001',
     'variacao_id','a5a5a5a5-0000-0000-0000-000000000001','quantidade',2,
     'preco_unitario_visto', 50.00))))
   ->> 'ok'));

-- O subtotal é do servidor: mandar total menor não muda nada.
select pg_temp.checar('subtotal vem do servidor, nao do cliente', '100.00',
  (pg_temp.pedido(jsonb_build_object('itens', jsonb_build_array(jsonb_build_object(
     'linha','l1','produto_id','b5b5b5b5-0000-0000-0000-000000000001',
     'variacao_id','a5a5a5a5-0000-0000-0000-000000000001','quantidade',2,
     'preco_unitario', 1.00, 'total', 2.00, 'subtotal', 2.00))))
   ->> 'subtotal'));

-- ---------------------------------------------------------- 5. entrega/taxa
select pg_temp.checar('entrega sem coordenada nao inventa taxa', 'true',
  (pg_temp.pedido(jsonb_build_object('endereco', jsonb_build_object(
     'logradouro','Rua X','numero','10','bairro','Centro','cidade','Cidade','uf','XX')))
   ->> 'endereco_ambiguo'));

select pg_temp.checar('entrega sem distancia nao inventa taxa', 'true',
  (pg_temp.pedido('{"rota":{"provedor":"teste"}}'::jsonb) ->> 'rota_indisponivel'));

select pg_temp.checar('distancia alem da area barra a entrega', 'true',
  (pg_temp.pedido('{"rota":{"distancia_km":40,"provedor":"teste"}}'::jsonb) ->> 'fora_de_area'));

select pg_temp.checar('fora de area nao produz taxa zero', null,
  (pg_temp.pedido('{"rota":{"distancia_km":40,"provedor":"teste"}}'::jsonb) ->> 'taxa_entrega'));

-- RN-ENT-015: (min, max], com o 0 coberto pela faixa iniciada em 0.
select pg_temp.checar('distancia 0 cai na faixa iniciada em 0', '5.00',
  (pg_temp.pedido('{"rota":{"distancia_km":0,"provedor":"teste"}}'::jsonb) ->> 'taxa_entrega'));

select pg_temp.checar('distancia 2.0 fecha a primeira faixa', '5.00',
  (pg_temp.pedido('{"rota":{"distancia_km":2.0,"provedor":"teste"}}'::jsonb) ->> 'taxa_entrega'));

select pg_temp.checar('distancia 2.01 ja e da segunda faixa', '8.00',
  (pg_temp.pedido('{"rota":{"distancia_km":2.01,"provedor":"teste"}}'::jsonb) ->> 'taxa_entrega'));

select pg_temp.checar('distancia 4.0 fecha a segunda faixa', '8.00',
  (pg_temp.pedido('{"rota":{"distancia_km":4.0,"provedor":"teste"}}'::jsonb) ->> 'taxa_entrega'));

select pg_temp.checar('total e subtotal mais taxa', '108.00',
  (pg_temp.pedido('{}'::jsonb) ->> 'total'));

-- RN-ENT-010/011: dentro do raio segue direto; acima dele, aguarda aprovação.
select pg_temp.checar('dentro do raio automatico nao exige aprovacao', 'false',
  (pg_temp.pedido('{"rota":{"distancia_km":3.2,"provedor":"teste"}}'::jsonb) ->> 'exige_aprovacao_entrega'));

select pg_temp.checar('acima do raio automatico exige aprovacao', 'true',
  (pg_temp.pedido('{"rota":{"distancia_km":5,"provedor":"teste"}}'::jsonb) ->> 'exige_aprovacao_entrega'));

select pg_temp.checar('acima do raio nasce aguardando aprovacao', 'waiting_delivery_approval',
  (pg_temp.pedido('{"rota":{"distancia_km":5,"provedor":"teste"}}'::jsonb) ->> 'status'));

-- RN-LOJA-005: o mínimo olha o SUBTOTAL, antes da taxa.
select pg_temp.checar('subtotal abaixo do minimo barra a entrega', 'true',
  (pg_temp.pedido(jsonb_build_object('itens', jsonb_build_array(jsonb_build_object(
     'linha','l1','produto_id','b5b5b5b5-0000-0000-0000-000000000002',
     'variacao_id','a5a5a5a5-0000-0000-0000-000000000002','quantidade',1)),
     'rota', jsonb_build_object('distancia_km',1,'provedor','teste')))
   ->> 'pedido_minimo'));

-- O mínimo olha o subtotal, e não o total: a taxa não ajuda a alcançá-lo.
select pg_temp.checar('minimo compara o subtotal, nao o total', '40.00',
  (pg_temp.pedido(jsonb_build_object('itens', jsonb_build_array(jsonb_build_object(
     'linha','l1','produto_id','b5b5b5b5-0000-0000-0000-000000000002',
     'variacao_id','a5a5a5a5-0000-0000-0000-000000000002','quantidade',1)),
     'rota', jsonb_build_object('distancia_km',1,'provedor','teste')))
   ->> 'subtotal'));

-- RN-ENT-002: retirada não tem mínimo de entrega.
select pg_temp.checar('retirada nao aplica minimo de entrega', 'true',
  (pg_temp.pedido(jsonb_build_object('modalidade','pickup','itens', jsonb_build_array(jsonb_build_object(
     'linha','l1','produto_id','b5b5b5b5-0000-0000-0000-000000000002',
     'variacao_id','a5a5a5a5-0000-0000-0000-000000000002','quantidade',1))))
   ->> 'ok'));

-- RN-ENT-002: retirada não usa endereço, distância nem taxa.
select pg_temp.checar('retirada nao cobra taxa', '0',
  (pg_temp.pedido('{"modalidade":"pickup"}'::jsonb) ->> 'taxa_entrega'));

select pg_temp.checar('retirada nao guarda distancia', null,
  (pg_temp.pedido('{"modalidade":"pickup"}'::jsonb) ->> 'distancia_km'));

select pg_temp.checar('modalidade invalida barra o pedido', 'Escolha entrega ou retirada.',
  (pg_temp.pedido('{"modalidade":"drone"}'::jsonb) ->> 'erro'));

-- ------------------------------------------------------------ 6. pagamento
select pg_temp.checar('forma inexistente barra o pedido', 'Escolha uma forma de pagamento disponível.',
  (pg_temp.pedido(jsonb_build_object('pagamento', jsonb_build_object(
     'forma_id','00000000-0000-0000-0000-000000000000'))) ->> 'erro'));

select pg_temp.checar('forma desativada barra o pedido', 'Escolha uma forma de pagamento disponível.',
  (pg_temp.pedido(jsonb_build_object('pagamento', jsonb_build_object(
     'forma_id', current_setting('teste.pix_chave', true)))) ->> 'erro'));

select pg_temp.checar('bandeira obrigatoria ausente barra o pedido', 'true',
  ((pg_temp.pedido(jsonb_build_object('pagamento', jsonb_build_object(
     'forma_id', current_setting('teste.credito', true)))) ->> 'erro') ilike '%bandeira%')::text);

-- RN-PGTO-005: troco menor que o total não pode passar.
select pg_temp.checar('troco menor que o total e recusado', 'true',
  (pg_temp.pedido(jsonb_build_object('pagamento', jsonb_build_object(
     'forma_id', current_setting('teste.dinheiro', true),
     'precisa_troco', true, 'troco_para', 10))) ->> 'troco_invalido'));

select pg_temp.checar('troco calculado pelo servidor', '42.00',
  (pg_temp.pedido(jsonb_build_object('pagamento', jsonb_build_object(
     'forma_id', current_setting('teste.dinheiro', true),
     'precisa_troco', true, 'troco_para', 150))) ->> 'troco_esperado'));

select pg_temp.checar('troco so existe em dinheiro', 'Troco só se aplica a pagamento em dinheiro.',
  (pg_temp.pedido(jsonb_build_object('pagamento', jsonb_build_object(
     'forma_id', current_setting('teste.pix_maq', true),
     'precisa_troco', true, 'troco_para', 500))) ->> 'erro'));

select pg_temp.checar('formas publicas nao mostram pix por chave desabilitado', '0',
  (select count(*)::text from jsonb_array_elements(public.formas_pagamento_publicas('delivery')) f
    where f ->> 'familia' = 'pix_key'));

-- -------------------------------------------------------- 7. estado inicial
-- RN-CHK-003: enviado não é aceito.
select pg_temp.checar('pedido nasce aguardando a pizzaria', 'waiting_store_confirmation',
  (pg_temp.pedido('{}'::jsonb) ->> 'status'));

-- ------------------------------------------------------------ 8. idempotência
select set_config('teste.numero',
  (pg_temp.pedido('{"idem":"11111111-1111-1111-1111-111111111111"}'::jsonb) ->> 'numero'), true);

select pg_temp.checar('primeira tentativa cria de fato', 'true',
  (current_setting('teste.numero', true) is not null)::text);

select pg_temp.checar('mesma tentativa nao cria segundo pedido', 'true',
  (pg_temp.pedido('{"idem":"11111111-1111-1111-1111-111111111111"}'::jsonb) ->> 'ja_existia'));

select pg_temp.checar('reenvio devolve o mesmo numero de pedido',
  current_setting('teste.numero', true),
  (pg_temp.pedido('{"idem":"11111111-1111-1111-1111-111111111111"}'::jsonb) ->> 'numero'));

-- ------------------------------------------------------- 9. acompanhamento
select pg_temp.checar('token inexistente nao confirma nada', 'Não encontramos esse pedido.',
  (public.pedido_por_token(repeat('f', 64)) ->> 'erro'));

select pg_temp.checar('token curto e recusado antes de consultar', 'Link inválido.',
  (public.pedido_por_token('curto') ->> 'erro'));

select pg_temp.checar('pix sem pedido correspondente nao devolve chave', 'false',
  (public.pix_para_pagamento(repeat('f', 64)) ->> 'ok'));

select pg_temp.checar('pedido base criado para inspecao', 'true',
  (pg_temp.pedido('{"idem":"33333333-3333-3333-3333-333333333333"}'::jsonb) ->> 'ok'));

reset role;

-- Inspeção pela CHAVE do pedido-base. Dentro de uma transação todos os
-- `created_at` são iguais, então "o último criado" não identificaria nada.
select set_config('teste.pedido',
  (select id::text from public.orders
    where idempotency_key = '33333333-3333-3333-3333-333333333333'), true);
select set_config('teste.token',
  pg_temp.token('33333333-3333-3333-3333-333333333333'), true);

select pg_temp.checar('o token e guardado como hash, nunca em claro', 'true',
  (select (tracking_token_hash = public.hash_token(current_setting('teste.token', true)))::text
     from public.orders where id = current_setting('teste.pedido', true)::uuid));

select pg_temp.checar('historico de estado nasce junto com o pedido', '1',
  (select count(*)::text from public.order_status_history
    where order_id = current_setting('teste.pedido', true)::uuid));

select pg_temp.checar('snapshot do item guarda nome e categoria', 'Calabresa F5|Pizzas F5',
  (select product_name_snapshot || '|' || category_name_snapshot
     from public.order_items where order_id = current_setting('teste.pedido', true)::uuid));

select pg_temp.checar('snapshot do sabor guarda a porcao', 'true',
  (select (f.portion = 1)::text from public.order_item_flavors f
     join public.order_items i on i.id = f.order_item_id
    where i.order_id = current_setting('teste.pedido', true)::uuid));

select pg_temp.checar('intencao de pagamento guarda o valor esperado', '108.00',
  (select amount_expected::text from public.order_payment_intents
    where order_id = current_setting('teste.pedido', true)::uuid));

-- 03 §10: a projeção pública não pode devolver dado interno.
select set_config('teste.publico',
  public.pedido_por_token(current_setting('teste.token', true))::text, true);

select pg_temp.checar('projecao publica nao expoe telefone completo', 'false',
  (current_setting('teste.publico', true) like '%5511900000001%')::text);

select pg_temp.checar('projecao publica nao expoe coordenada do cliente', 'false',
  jsonb_exists(current_setting('teste.publico', true)::jsonb -> 'endereco', 'latitude')::text);

select pg_temp.checar('projecao publica nao expoe id interno do pedido', 'false',
  (current_setting('teste.publico', true) like '%' || current_setting('teste.pedido', true) || '%')::text);

select pg_temp.checar('projecao publica traz o numero do pedido', 'true',
  ((current_setting('teste.publico', true)::jsonb ->> 'numero') is not null)::text);

-- RN-CLI-008: cliente bloqueado não pede, e a mensagem não diz por quê.
update public.customers
   set is_blocked = true, blocked_at = now(),
       blocked_reason_internal = 'motivo interno sigiloso'
  where whatsapp_normalized = public.normalizar_whatsapp('(11) 90000-0001');

set local role anon;

select pg_temp.checar('cliente bloqueado nao consegue pedir', 'false',
  (pg_temp.pedido('{}'::jsonb) ->> 'ok'));

select pg_temp.checar('mensagem ao bloqueado nao expoe o motivo interno', 'false',
  ((pg_temp.pedido('{}'::jsonb) ->> 'erro') ilike '%sigiloso%')::text);

select pg_temp.checar('mensagem ao bloqueado nao diz que ha bloqueio', 'false',
  ((pg_temp.pedido('{}'::jsonb) ->> 'erro') ilike '%bloque%')::text);

reset role;

-- RN-LOJA-002/003: loja fechada bloqueia o envio, sem apagar carrinho.
update public.store_settings
   set is_temporarily_closed = true,
       temporary_closed_at = now(),
       temporary_close_reason = 'Fechamento de teste';

set local role anon;

select pg_temp.checar('loja fechada bloqueia o envio', 'true',
  (pg_temp.pedido('{"cliente":{"nome":"Outro Teste","whatsapp":"(11) 90000-0002"}}'::jsonb) ->> 'loja_fechada'));

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
