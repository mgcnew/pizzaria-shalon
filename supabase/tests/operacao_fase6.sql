-- =============================================================================
-- TESTES DA OPERAÇÃO INTERNA DE PEDIDOS — FASE 6
--
-- 04-REGRAS-NEGOCIO.md RN-STATE-001..010, RN-ALT-001..007, RN-PRINT-001..006,
-- RN-POP-001..004 · CLAUDE.md §21, §23, §33, §34 · 03 §9 e §13
--
-- AS DUAS PERGUNTAS QUE ESTE ARQUIVO RESPONDE:
--   1. alguém consegue levar um pedido a um estado que a regra não permite?
--   2. alguém consegue fazer algo que a sua permissão não autoriza?
--
-- Os papéis são os reais: Owner/Admin e Atendente, com as permissões
-- semeadas na Fase 2. O Atendente NÃO tem `orders.cancel` nem
-- `orders.confirm_pix` — e é isso que os testes de negativa verificam.
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
  ('66666666-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona6@teste.local','x',now(),now(),now()),
  ('66666666-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','atendente6@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a6a6a6a6-0000-0000-0000-000000000001','Dona F6','owner',false,'active'),
  ('a6a6a6a6-0000-0000-0000-000000000002','Atendente F6','counter',false,'active');

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b6b6b6b6-0000-0000-0000-000000000001','66666666-1111-1111-1111-111111111111','a6a6a6a6-0000-0000-0000-000000000001',true),
  ('b6b6b6b6-0000-0000-0000-000000000002','66666666-2222-2222-2222-222222222222','a6a6a6a6-0000-0000-0000-000000000002',true);

insert into public.user_roles (app_user_id, role_id)
select 'b6b6b6b6-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
select 'b6b6b6b6-0000-0000-0000-000000000002', id from public.roles where name = 'Atendente';

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
  'ccccccc6-0000-0000-0000-000000000001','Shalon F6','5500000000000','Rua T','1','Centro',
  'Cidade','XX','00000-000', -23.5, -46.6, 4.0, 40, 60, 20, 30, true, 'America/Sao_Paulo'
);

delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 4, 8.00, true, 1), (4, 10, 15.00, true, 2);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d6d6d6d6-0000-0000-0000-000000000001','Grande F6', 8, 2, 601);

insert into public.categories (id, name, slug, sort_order) values
  ('c6c6c6c6-0000-0000-0000-000000000001','Pizzas F6','pizzas-f6', 601);

insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active) values
  ('b6b6b6b6-1000-0000-0000-000000000001','c6c6c6c6-0000-0000-0000-000000000001','pizza','Calabresa F6','calabresa-f6', 1, true),
  ('b6b6b6b6-1000-0000-0000-000000000002','c6c6c6c6-0000-0000-0000-000000000001','pizza','Mussarela F6','mussarela-f6', 2, true);

insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available) values
  ('a6a6a6a6-1000-0000-0000-000000000001','b6b6b6b6-1000-0000-0000-000000000001','d6d6d6d6-0000-0000-0000-000000000001', 50.00, true, true),
  ('a6a6a6a6-1000-0000-0000-000000000002','b6b6b6b6-1000-0000-0000-000000000002','d6d6d6d6-0000-0000-0000-000000000001', 40.00, true, true);

-- Pix por chave habilitado: é o que permite testar o bloqueio de produção.
insert into public.pix_key_settings (is_enabled, key_type, pix_key, recipient_name)
values (true, 'telefone', '+5500000000000', 'Pizzaria Shalon F6');
update public.payment_methods set is_active = true where code = 'pix_chave';

select set_config('teste.segredo', (select valor from public.server_secrets where chave='checkout_origem'), true);
select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
select set_config('teste.pix', (select id::text from public.payment_methods where code='pix_chave'), true);

create or replace function pg_temp.token(p_idem text)
returns text language sql immutable as $$
  select md5(p_idem) || md5(p_idem || ':2');
$$;

-- Cria um pedido pelo caminho REAL do cliente: a mesma função pública da
-- Fase 5, com a mesma prova de origem.
create or replace function pg_temp.criar(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $$
declare
  v_idem text := coalesce(p ->> 'idem', gen_random_uuid()::text);
begin
  return public.criar_pedido(
    jsonb_build_object(
      'idempotency_key', v_idem,
      'tracking_token', pg_temp.token(v_idem),
      'modalidade', coalesce(p ->> 'modalidade', 'delivery'),
      'cliente', jsonb_build_object('nome', coalesce(p ->> 'nome', 'Cliente F6'),
                                    'whatsapp', coalesce(p ->> 'whatsapp', '(11) 96000-0001')),
      'endereco', case when coalesce(p ->> 'modalidade','delivery') = 'pickup' then null
                       else jsonb_build_object('logradouro','Rua X','numero','10','bairro','Centro',
                         'cidade','Cidade','uf','XX','latitude',-23.51,'longitude',-46.61,
                         'confianca','exata','provedor','teste') end,
      'rota', case when coalesce(p ->> 'modalidade','delivery') = 'pickup' then null
                   else jsonb_build_object('distancia_km',
                        coalesce((p ->> 'km')::numeric, 2.0), 'provedor','teste') end,
      'itens', coalesce(p -> 'itens', jsonb_build_array(jsonb_build_object(
                 'linha','l1','produto_id','b6b6b6b6-1000-0000-0000-000000000001',
                 'variacao_id','a6a6a6a6-1000-0000-0000-000000000001','quantidade',2))),
      'pagamento', jsonb_build_object('forma_id',
        coalesce(p ->> 'forma', current_setting('teste.dinheiro', true)))
    ),
    current_setting('teste.segredo', true));
end;
$$;

-- Atalhos de papel: a identidade vem do JWT, como em produção.
create or replace function pg_temp.comando(p_pedido uuid, p_comando text, p_motivo text default null)
returns jsonb language sql as $$
  select public.comando_pedido(p_pedido, p_comando,
    case when p_motivo is null then '{}'::jsonb else jsonb_build_object('motivo', p_motivo) end);
$$;

-- =============================================================================
-- OS PEDIDOS DE TRABALHO, criados pelo cliente público
-- =============================================================================
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select set_config('teste.p_entrega', (pg_temp.criar('{"idem":"66000001-0000-0000-0000-000000000001"}'::jsonb) ->> 'pedido_id'), true);
select set_config('teste.p_retirada', (pg_temp.criar('{"idem":"66000002-0000-0000-0000-000000000002","modalidade":"pickup"}'::jsonb) ->> 'pedido_id'), true);
select set_config('teste.p_pix', (pg_temp.criar(jsonb_build_object('idem','66000003-0000-0000-0000-000000000003','forma', current_setting('teste.pix', true))) ->> 'pedido_id'), true);
select set_config('teste.p_longe', (pg_temp.criar('{"idem":"66000004-0000-0000-0000-000000000004","km":6}'::jsonb) ->> 'pedido_id'), true);
select set_config('teste.p_alterar', (pg_temp.criar('{"idem":"66000005-0000-0000-0000-000000000005"}'::jsonb) ->> 'pedido_id'), true);
select set_config('teste.p_rejeitar', (pg_temp.criar('{"idem":"66000006-0000-0000-0000-000000000006"}'::jsonb) ->> 'pedido_id'), true);
select set_config('teste.p_cancelar', (pg_temp.criar('{"idem":"66000007-0000-0000-0000-000000000007"}'::jsonb) ->> 'pedido_id'), true);
select set_config('teste.p_falha', (pg_temp.criar('{"idem":"66000008-0000-0000-0000-000000000008"}'::jsonb) ->> 'pedido_id'), true);

reset role;

-- 03 §9: a operação interna não é acessível a quem não é da equipe.
--
-- Para `anon` a barreira é anterior à função: ele não tem EXECUTE, e a
-- chamada nem chega ao corpo (verificado no fim, com has_function_privilege).
-- O que se testa aqui é o degrau seguinte: um usuário AUTENTICADO cujo
-- token não corresponde a nenhum usuário interno ativo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

select pg_temp.checar('autenticado sem usuario interno nao opera', 'Sessão não identificada.',
  (pg_temp.comando(current_setting('teste.p_entrega', true)::uuid, 'aceitar') ->> 'erro'));

reset role;

-- =============================================================================
-- ATENDENTE — o que pode e o que NÃO pode
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('atendente enxerga a fila', 'true',
  (jsonb_array_length(public.fila_de_pedidos(false)) > 0)::text);

-- `orders.cancel` cobre cancelar E rejeitar, e o Atendente não a tem.
select pg_temp.checar('atendente NAO cancela', 'Você não tem permissão para esta ação.',
  (pg_temp.comando(current_setting('teste.p_cancelar', true)::uuid, 'cancelar', 'tentativa') ->> 'erro'));

select pg_temp.checar('atendente NAO rejeita', 'Você não tem permissão para esta ação.',
  (pg_temp.comando(current_setting('teste.p_rejeitar', true)::uuid, 'rejeitar', 'tentativa') ->> 'erro'));

select pg_temp.checar('atendente NAO confirma Pix', 'Você não tem permissão para esta ação.',
  (pg_temp.comando(current_setting('teste.p_pix', true)::uuid, 'confirmar_pix') ->> 'erro'));

select pg_temp.checar('cancelar nao aparece nas acoes do atendente', '0',
  (select count(*)::text from jsonb_array_elements(
     public.acoes_do_pedido(current_setting('teste.p_cancelar', true)::uuid)) a
   where a ->> 'comando' in ('cancelar','rejeitar','confirmar_pix')));

-- O que ele PODE: operar o pedido do começo ao fim.
select pg_temp.checar('atendente aceita o pedido', 'confirmed',
  (pg_temp.comando(current_setting('teste.p_entrega', true)::uuid, 'aceitar') ->> 'status'));

select pg_temp.checar('aceitar de novo e recusado (clique duplo)', 'false',
  (pg_temp.comando(current_setting('teste.p_entrega', true)::uuid, 'aceitar') ->> 'ok'));

select pg_temp.checar('atendente inicia producao', 'in_production',
  (pg_temp.comando(current_setting('teste.p_entrega', true)::uuid, 'iniciar_producao') ->> 'status'));

-- RN-STATE-006: em entrega, "pronto" é pronto PARA ENTREGA.
select pg_temp.checar('pronto de entrega respeita a modalidade', 'ready_for_delivery',
  (pg_temp.comando(current_setting('teste.p_entrega', true)::uuid, 'marcar_pronto') ->> 'status'));

select pg_temp.checar('despacha para entrega', 'out_for_delivery',
  (pg_temp.comando(current_setting('teste.p_entrega', true)::uuid, 'despachar') ->> 'status'));

select pg_temp.checar('conclui a entrega', 'completed',
  (pg_temp.comando(current_setting('teste.p_entrega', true)::uuid, 'concluir') ->> 'status'));

select pg_temp.checar('pedido concluido nao volta a producao', 'false',
  (pg_temp.comando(current_setting('teste.p_entrega', true)::uuid, 'iniciar_producao') ->> 'ok'));

-- RN-STATE-005: em retirada, "pronto" é pronto PARA RETIRADA.
select pg_temp.comando(current_setting('teste.p_retirada', true)::uuid, 'aceitar');
select pg_temp.comando(current_setting('teste.p_retirada', true)::uuid, 'iniciar_producao');

select pg_temp.checar('pronto de retirada respeita a modalidade', 'ready_for_pickup',
  (pg_temp.comando(current_setting('teste.p_retirada', true)::uuid, 'marcar_pronto') ->> 'status'));

select pg_temp.checar('retirada nao despacha', 'false',
  (pg_temp.comando(current_setting('teste.p_retirada', true)::uuid, 'despachar') ->> 'ok'));

-- RN-PGTO-012 (Fase 7): a retirada deixou de concluir só por estar pronta.
-- O invariante 13 de 04 §44 manda impedir isso, e 01 §79.18 diz o que falta:
-- na retirada, o pagamento efetivo é confirmado quando pendente.
select pg_temp.checar('retirada NAO conclui sem o recebimento registrado', 'pagamento',
  (pg_temp.comando(current_setting('teste.p_retirada', true)::uuid, 'concluir') ->> 'bloqueio'));

-- RN-CAIXA-001: venda normal exige caixa aberto. O Atendente tem cash.open.
select pg_temp.checar('atendente abre o caixa para receber', 'true',
  (public.abrir_caixa('{"fundo":0}'::jsonb) ->> 'ok'));

select pg_temp.checar('recebimento da retirada e registrado', 'true',
  (public.registrar_pagamento(current_setting('teste.p_retirada', true)::uuid,
     jsonb_build_object('linhas', jsonb_build_array(jsonb_build_object(
       'forma_id', current_setting('teste.dinheiro', true), 'valor', 100)))) ->> 'ok'));

select pg_temp.checar('retirada conclui no balcao', 'completed',
  (pg_temp.comando(current_setting('teste.p_retirada', true)::uuid, 'concluir') ->> 'status'));

-- RN-STATE-008: falha exige motivo, e a equipe decide depois.
select pg_temp.comando(current_setting('teste.p_falha', true)::uuid, 'aceitar');
select pg_temp.comando(current_setting('teste.p_falha', true)::uuid, 'iniciar_producao');
select pg_temp.comando(current_setting('teste.p_falha', true)::uuid, 'marcar_pronto');
select pg_temp.comando(current_setting('teste.p_falha', true)::uuid, 'despachar');

select pg_temp.checar('falha na entrega exige motivo', 'Informe o motivo da falha na entrega.',
  (pg_temp.comando(current_setting('teste.p_falha', true)::uuid, 'registrar_falha_entrega') ->> 'erro'));

select pg_temp.checar('falha registrada com motivo', 'delivery_failed',
  (pg_temp.comando(current_setting('teste.p_falha', true)::uuid, 'registrar_falha_entrega', 'Ninguem atendeu') ->> 'status'));

select pg_temp.checar('depois da falha ainda da para concluir', 'completed',
  (pg_temp.comando(current_setting('teste.p_falha', true)::uuid, 'concluir') ->> 'status'));

-- ---------------------------------------------------------------- impressão
select pg_temp.checar('comanda antes do aceite e recusada', 'A comanda só sai depois que o pedido for aceito.',
  (public.registrar_impressao(current_setting('teste.p_cancelar', true)::uuid, 'comanda', 'conteudo') ->> 'erro'));

select set_config('teste.impressao',
  (public.registrar_impressao(current_setting('teste.p_retirada', true)::uuid, 'comanda',
    'PEDIDO #1 ... conteudo determinístico') ->> 'impressao_id'), true);

select pg_temp.checar('comanda depois do aceite sai na via 1', '1',
  (select copy_number::text from public.order_prints
    where id = current_setting('teste.impressao', true)::uuid));

select pg_temp.checar('impressao nasce apenas SOLICITADA', 'requested',
  (select status from public.order_prints
    where id = current_setting('teste.impressao', true)::uuid));

select pg_temp.checar('segunda emissao e reimpressao (via 2)', '2',
  (public.registrar_impressao(current_setting('teste.p_retirada', true)::uuid, 'comanda', 'outro') ->> 'via'));

select pg_temp.checar('falha de impressao exige dizer o que houve', 'Informe o que falhou.',
  (public.atualizar_impressao(current_setting('teste.impressao', true)::uuid, 'error') ->> 'erro'));

select pg_temp.checar('impressao confirmada', 'confirmed',
  (public.atualizar_impressao(current_setting('teste.impressao', true)::uuid, 'confirmed') ->> 'status'));

select pg_temp.checar('impressao encerrada nao muda de novo', 'Esta impressão já foi encerrada.',
  (public.atualizar_impressao(current_setting('teste.impressao', true)::uuid, 'error', 'x') ->> 'erro'));

-- ---------------------------------------------------------------- alteração
select pg_temp.checar('alteracao exige motivo', 'Informe o motivo da alteração.',
  (public.propor_alteracao(current_setting('teste.p_alterar', true)::uuid,
     jsonb_build_object('itens', jsonb_build_array())) ->> 'erro'));

select pg_temp.checar('alteracao que muda o total aguarda o cliente', 'true',
  (public.propor_alteracao(current_setting('teste.p_alterar', true)::uuid, jsonb_build_object(
     'motivo', 'Acabou a calabresa',
     'itens', jsonb_build_array(jsonb_build_object(
       'produto_id','b6b6b6b6-1000-0000-0000-000000000002',
       'variacao_id','a6a6a6a6-1000-0000-0000-000000000002','quantidade',1))))
   ->> 'aguarda_cliente'));

select pg_temp.checar('pedido passa a aguardar o cliente', 'change_requested_waiting_customer',
  (select status from public.orders where id = current_setting('teste.p_alterar', true)::uuid));

-- RN-ALT-007: o pedido original continua reconstruível.
select pg_temp.checar('pedido original preservado na revisao', 'Calabresa F6',
  (select r.items_before -> 0 ->> 'nome' from public.order_revisions r
    where r.order_id = current_setting('teste.p_alterar', true)::uuid));

select pg_temp.checar('itens do pedido ainda NAO mudaram', '100.00',
  (select subtotal::text from public.orders where id = current_setting('teste.p_alterar', true)::uuid));

-- RN-ALT-004: aguardando o cliente, o pedido não avança.
select pg_temp.checar('nao da para aceitar aguardando o cliente', 'false',
  (pg_temp.comando(current_setting('teste.p_alterar', true)::uuid, 'aceitar') ->> 'ok'));

select pg_temp.checar('segunda proposta e barrada', 'Já existe uma alteração aguardando resposta do cliente.',
  (public.propor_alteracao(current_setting('teste.p_alterar', true)::uuid, jsonb_build_object(
     'motivo', 'De novo',
     'itens', jsonb_build_array(jsonb_build_object(
       'produto_id','b6b6b6b6-1000-0000-0000-000000000002',
       'variacao_id','a6a6a6a6-1000-0000-0000-000000000002','quantidade',1)))) ->> 'erro'));

reset role;

-- =============================================================================
-- O CLIENTE decide a alteração, pelo token
-- =============================================================================
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select pg_temp.checar('cliente ve o antes e o depois', '108.00',
  (public.alteracao_do_pedido(pg_temp.token('66000005-0000-0000-0000-000000000005')) ->> 'total_antes'));

select pg_temp.checar('projecao da alteracao nao expoe interno', 'false',
  (public.alteracao_do_pedido(pg_temp.token('66000005-0000-0000-0000-000000000005'))::text
     like '%proposed_by%')::text);

select pg_temp.checar('cliente aprova a alteracao', 'true',
  (public.decidir_alteracao(pg_temp.token('66000005-0000-0000-0000-000000000005'), true) ->> 'ok'));

reset role;

select pg_temp.checar('itens passaram a ser os novos', 'Mussarela F6',
  (select product_name_snapshot from public.order_items
    where order_id = current_setting('teste.p_alterar', true)::uuid));

select pg_temp.checar('total do pedido acompanhou a alteracao', '48.00',
  (select total::text from public.orders where id = current_setting('teste.p_alterar', true)::uuid));

select pg_temp.checar('valor esperado do pagamento acompanhou', '48.00',
  (select amount_expected::text from public.order_payment_intents
    where order_id = current_setting('teste.p_alterar', true)::uuid));

select pg_temp.checar('a revisao guarda o historico do que era', '108.00',
  (select r.total_before::text from public.order_revisions r
    where r.order_id = current_setting('teste.p_alterar', true)::uuid));

select pg_temp.checar('pedido voltou ao estado anterior a proposta', 'waiting_store_confirmation',
  (select status from public.orders where id = current_setting('teste.p_alterar', true)::uuid));

-- =============================================================================
-- OWNER — Pix, aprovação de entrega, rejeição e cancelamento
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-1111-1111-1111-111111111111","role":"authenticated"}';

-- RN-PGTO-010 e RN-STATE-001: Pix pendente impede o aceite.
select pg_temp.checar('pedido com Pix nasce aguardando Pix', 'waiting_pix_confirmation',
  (select status from public.orders where id = current_setting('teste.p_pix', true)::uuid));

select pg_temp.checar('nao da para aceitar com Pix pendente', 'false',
  (pg_temp.comando(current_setting('teste.p_pix', true)::uuid, 'aceitar') ->> 'ok'));

select pg_temp.checar('owner confirma o Pix', 'waiting_store_confirmation',
  (pg_temp.comando(current_setting('teste.p_pix', true)::uuid, 'confirmar_pix') ->> 'status'));

select pg_temp.checar('confirmacao de Pix registra quem e quando', 'true',
  (select (pix_confirmed_by is not null and pix_confirmed_at is not null)::text
     from public.order_payment_intents where order_id = current_setting('teste.p_pix', true)::uuid));

-- Com o Pix já confirmado, `confirmar_pix` deixa de ser ação aplicável —
-- a barreira agora é a mesma que apaga o botão da tela (migration 0057).
select pg_temp.checar('Pix nao se confirma duas vezes', 'false',
  (pg_temp.comando(current_setting('teste.p_pix', true)::uuid, 'confirmar_pix') ->> 'ok'));

select pg_temp.checar('com o Pix confirmado o aceite libera', 'confirmed',
  (pg_temp.comando(current_setting('teste.p_pix', true)::uuid, 'aceitar') ->> 'status'));

-- RN-STATE-002: fora do raio automático, aguarda aprovação.
select pg_temp.checar('pedido distante aguarda aprovacao de entrega', 'waiting_delivery_approval',
  (select status from public.orders where id = current_setting('teste.p_longe', true)::uuid));

select pg_temp.checar('nao da para aceitar sem aprovar a entrega', 'false',
  (pg_temp.comando(current_setting('teste.p_longe', true)::uuid, 'aceitar') ->> 'ok'));

select pg_temp.checar('aprovar entrega libera a fila', 'waiting_store_confirmation',
  (pg_temp.comando(current_setting('teste.p_longe', true)::uuid, 'aprovar_entrega') ->> 'status'));

select pg_temp.checar('aprovacao registra quem decidiu', 'true',
  (select (delivery_approval_decided_by is not null)::text
     from public.orders where id = current_setting('teste.p_longe', true)::uuid));

-- RN-STATE-009 e RN-STATE-010
select pg_temp.checar('rejeicao sem motivo e recusada', 'Informe o motivo da rejeição.',
  (pg_temp.comando(current_setting('teste.p_rejeitar', true)::uuid, 'rejeitar') ->> 'erro'));

select pg_temp.checar('rejeicao com motivo', 'rejected',
  (pg_temp.comando(current_setting('teste.p_rejeitar', true)::uuid, 'rejeitar', 'Sem entregador hoje') ->> 'status'));

select pg_temp.checar('pedido rejeitado continua existindo', '1',
  (select count(*)::text from public.orders where id = current_setting('teste.p_rejeitar', true)::uuid));

select pg_temp.checar('itens do rejeitado continuam existindo', 'true',
  (select (count(*) > 0)::text from public.order_items
    where order_id = current_setting('teste.p_rejeitar', true)::uuid));

select pg_temp.checar('cancelamento sem motivo e recusado', 'Informe o motivo do cancelamento.',
  (pg_temp.comando(current_setting('teste.p_cancelar', true)::uuid, 'cancelar') ->> 'erro'));

select pg_temp.checar('cancelamento com motivo', 'cancelled',
  (pg_temp.comando(current_setting('teste.p_cancelar', true)::uuid, 'cancelar', 'Cliente desistiu') ->> 'status'));

select pg_temp.checar('cancelamento registra responsavel e horario', 'true',
  (select (cancelled_by is not null and cancelled_at is not null)::text
     from public.orders where id = current_setting('teste.p_cancelar', true)::uuid));

select pg_temp.checar('rejeitado nao pode ser cancelado depois', 'false',
  (pg_temp.comando(current_setting('teste.p_rejeitar', true)::uuid, 'cancelar', 'x') ->> 'ok'));

-- ------------------------------------------------------ transições inválidas
select pg_temp.checar('grafo nao permite pular do novo para pronto', 'false',
  public.transicao_permitida('waiting_store_confirmation', 'ready_for_pickup')::text);

select pg_temp.checar('grafo nao permite ressuscitar cancelado', 'false',
  public.transicao_permitida('cancelled', 'confirmed')::text);

select pg_temp.checar('grafo permite o caminho normal', 'true',
  public.transicao_permitida('confirmed', 'in_production')::text);

select pg_temp.checar('comando inexistente e recusado', 'Comando desconhecido.',
  (pg_temp.comando(current_setting('teste.p_longe', true)::uuid, 'teletransportar') ->> 'erro'));

-- ------------------------------------------------------------- auditoria
select pg_temp.checar('acoes sensiveis ficam auditadas', 'true',
  (select (count(*) >= 3)::text from public.audit_logs
    where entity_type = 'orders'
      and action in ('pedido_cancelar','pedido_rejeitar','pedido_confirmar_pix')));

select pg_temp.checar('auditoria guarda o motivo', 'Cliente desistiu',
  (select reason from public.audit_logs
    where entity_type = 'orders' and action = 'pedido_cancelar'
    order by created_at desc limit 1));

select pg_temp.checar('historico do pedido registra a transicao', 'true',
  (select (count(*) >= 2)::text from public.order_status_history
    where order_id = current_setting('teste.p_pix', true)::uuid));

-- -------------------------------------------------------------- A-16
-- RN-POP-001/002: 30 dias, concluídos, por quantidade. Dois pedidos foram
-- concluídos acima: entrega (2 Calabresa) e retirada (2 Calabresa).
select pg_temp.checar('mais pedidos conta os concluidos', 'true',
  (select (jsonb_array_length(public.mais_pedidos(6)) > 0)::text));

select pg_temp.checar('mais pedidos nao traz pedido nao concluido', 'true',
  (select coalesce((
     select (m ->> 'quantidade')::numeric
     from jsonb_array_elements(public.mais_pedidos(6)) m
     where m ->> 'produto_id' = 'b6b6b6b6-1000-0000-0000-000000000001'), 0) = 6)::text);

select pg_temp.checar('mais pedidos respeita o limite', 'true',
  (select (jsonb_array_length(public.mais_pedidos(1)) <= 1)::text));

reset role;

-- =============================================================================
-- TRACKING PÚBLICO
-- =============================================================================
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select pg_temp.checar('tracking reflete o estado operacional', 'completed',
  (public.pedido_por_token(pg_temp.token('66000001-0000-0000-0000-000000000001')) ->> 'status'));

select pg_temp.checar('tracking mostra o motivo publico da rejeicao', 'Sem entregador hoje',
  (public.pedido_por_token(pg_temp.token('66000006-0000-0000-0000-000000000006')) ->> 'motivo_rejeicao'));

select pg_temp.checar('tracking nao expoe historico administrativo', 'false',
  (public.pedido_por_token(pg_temp.token('66000006-0000-0000-0000-000000000006'))::text
     like '%actor_user_id%')::text);

select pg_temp.checar('anon nao le revisoes', '0',
  (select count(*)::text from public.order_revisions));

select pg_temp.checar('anon nao le impressoes', '0',
  (select count(*)::text from public.order_prints));

select pg_temp.checar('anon nao tem acesso a fila interna', 'false',
  has_function_privilege('anon', 'public.fila_de_pedidos(boolean)', 'execute')::text);

select pg_temp.checar('anon nao tem acesso ao detalhe interno', 'false',
  has_function_privilege('anon', 'public.pedido_administrativo(uuid)', 'execute')::text);

select pg_temp.checar('anon nao tem acesso aos comandos', 'false',
  has_function_privilege('anon', 'public.comando_pedido(uuid, text, jsonb)', 'execute')::text);

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
