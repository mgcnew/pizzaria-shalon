-- =============================================================================
-- TESTES DA FASE 9 — INTELIGÊNCIA, CRM, REMARKETING E RELATÓRIOS
--
-- 04-REGRAS-NEGOCIO.md RN-CRM-001..005, RN-RMKT-001..008, RN-DASH-001..004,
-- RN-CLASS-001, RN-PGTO-003 · 03 §15, §20 · CLAUDE.md §15, §24, §27, §28, §31
--
-- AS SEIS PERGUNTAS DESTE ARQUIVO:
--   1. o sistema consegue confundir VENDA REGISTRADA com DINHEIRO RECEBIDO?
--   2. a régua de cadência classifica quem não tem histórico suficiente?
--   3. o filtro objetivo de ausência exclui quem comprou pouco?
--   4. "vende pouco" condena produto que não teve chance de vender?
--   5. dá para mandar promoção para quem pediu para não receber?
--   6. `anon`, atendente e um usuário sem `reports.export` conseguem dados
--      que não deveriam?
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
  ('a9990001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona9@teste.local','x',now(),now(),now()),
  ('a9990002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','atend9@teste.local','x',now(),now(),now()),
  -- Vê relatório e NÃO exporta: é com ele que se prova que ver e levar embora
  -- são permissões diferentes (03 §20).
  ('a9990003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','analista9@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('b9990001-0000-0000-0000-000000000001','Dona F9','owner',false,'active'),
  ('b9990002-0000-0000-0000-000000000002','Atendente F9','counter',false,'active'),
  ('b9990003-0000-0000-0000-000000000003','Analista F9','counter',false,'active');

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('c9990001-0000-0000-0000-000000000001','a9990001-0000-0000-0000-000000000001','b9990001-0000-0000-0000-000000000001',true),
  ('c9990002-0000-0000-0000-000000000002','a9990002-0000-0000-0000-000000000002','b9990002-0000-0000-0000-000000000002',true),
  ('c9990003-0000-0000-0000-000000000003','a9990003-0000-0000-0000-000000000003','b9990003-0000-0000-0000-000000000003',true);

insert into public.user_roles (app_user_id, role_id)
select 'c9990001-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
select 'c9990002-0000-0000-0000-000000000002', id from public.roles where name = 'Atendente';

insert into public.roles (id, name, description, is_system, is_active)
values ('d9990001-0000-0000-0000-000000000001','Analista F9','Ve relatorio, nao exporta, nao ve caixa', false, true);
insert into public.role_permissions (role_id, permission_id)
select 'd9990001-0000-0000-0000-000000000001', id from public.permissions
 where code in ('reports.view','orders.view','catalog.view');
insert into public.user_roles (app_user_id, role_id)
values ('c9990003-0000-0000-0000-000000000003','d9990001-0000-0000-0000-000000000001');

-- Fuso explícito: as fronteiras de dia do relatório dependem dele.
delete from public.store_settings;
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code, latitude, longitude,
  automatic_delivery_radius_km, delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values (
  'e9990001-0000-0000-0000-000000000001','Shalon F9','5500000000000','Rua T','1','Centro',
  'Cidade','XX','00000-000', -23.5, -46.6, 4.0, 40, 60, 20, 30, true, 'America/Sao_Paulo');

delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

-- A tabela de limites nasce VAZIA de propósito (RN-DASH-003). O teste depende
-- disso: sem limite configurado, nenhuma espera pode ser carimbada de atrasada.
delete from public.alert_thresholds;

delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 4, 0.00, true, 1);

delete from public.cash_movements;
delete from public.cash_session_corrections;
delete from public.cash_sessions;

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('f9990001-0000-0000-0000-000000000001','Grande F9', 8, 2, 991);
insert into public.categories (id, name, slug, sort_order) values
  ('f9990002-0000-0000-0000-000000000002','Pizzas F9','pizzas-f9', 991);

-- Quatro produtos, cada um para uma pergunta diferente do ranking:
--   FORTE       — vende;
--   NOVO        — entrou no catálogo hoje, não pode ser chamado de encalhado;
--   PAUSADO     — existe há tempo, mas hoje não é vendável;
--   PARADO      — velho, disponível e sem venda: o único de fato comparável.
insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active, created_at) values
  ('f9990003-0000-0000-0000-000000000003','f9990002-0000-0000-0000-000000000002','pizza','Calabresa F9','calabresa-f9', 1, true, now() - interval '200 days'),
  ('f9990004-0000-0000-0000-000000000004','f9990002-0000-0000-0000-000000000002','pizza','Novidade F9','novidade-f9', 2, true, now()),
  ('f9990005-0000-0000-0000-000000000005','f9990002-0000-0000-0000-000000000002','pizza','Pausada F9','pausada-f9', 3, true, now() - interval '200 days'),
  ('f9990006-0000-0000-0000-000000000006','f9990002-0000-0000-0000-000000000002','pizza','Parada F9','parada-f9', 4, true, now() - interval '200 days');

insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available) values
  ('f9990013-0000-0000-0000-000000000013','f9990003-0000-0000-0000-000000000003','f9990001-0000-0000-0000-000000000001', 50.00, true, true),
  ('f9990014-0000-0000-0000-000000000014','f9990004-0000-0000-0000-000000000004','f9990001-0000-0000-0000-000000000001', 50.00, true, true),
  -- Pausada: indisponível AGORA.
  ('f9990015-0000-0000-0000-000000000015','f9990005-0000-0000-0000-000000000005','f9990001-0000-0000-0000-000000000001', 50.00, true, false),
  ('f9990016-0000-0000-0000-000000000016','f9990006-0000-0000-0000-000000000006','f9990001-0000-0000-0000-000000000001', 50.00, true, true);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
-- O segredo que prova a origem do checkout (03 §9.1). Sem ele, o caminho
-- público não existe — e é justamente o caminho público que deixa o pedido
-- PARADO esperando a loja (RN-MAN-004: pedido de balcão nasce aceito).
select set_config('teste.segredo',
  (select valor from public.server_secrets where chave='checkout_origem'), true);

-- Uma venda completa, datada onde o teste precisar.
--
-- A ORDEM AQUI É A ORDEM DO PRODUTO, não um atalho: na retirada, o pagamento
-- vem ANTES de concluir — o sistema recusa concluir uma retirada não paga, e
-- o teste não contorna essa regra para montar cenário.
--
-- `completed_at` e `received_at` são reescritos DEPOIS do fluxo real, porque
-- não existe (e não deve existir) um comando "concluir no passado".
create or replace function pg_temp.venda(
  p_nome text, p_whats text, p_quando timestamptz,
  p_variacao uuid default 'f9990013-0000-0000-0000-000000000013',
  p_produto uuid default 'f9990003-0000-0000-0000-000000000003')
-- SECURITY DEFINER só para a fixture: reescrever `completed_at` é montagem de
-- cenário, não operação do produto — e nenhuma política de escrita deveria
-- permitir isso pela aplicação.
returns uuid language plpgsql security definer as $$
declare v_idem text := gen_random_uuid()::text; v_r jsonb; v_id uuid;
begin
  v_r := public.criar_pedido(jsonb_build_object(
    'idempotency_key', v_idem,
    'tracking_token', md5(v_idem) || md5(v_idem || ':2'),
    'origem','counter','modalidade','pickup',
    'cliente', jsonb_build_object('nome', p_nome, 'whatsapp', p_whats,
                                  'consentimento_marketing', true),
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id', p_produto, 'variacao_id', p_variacao, 'quantidade', 1)),
    'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))
  ), '');
  v_id := (v_r ->> 'pedido_id')::uuid;
  perform public.comando_pedido(v_id, 'iniciar_producao');
  perform public.comando_pedido(v_id, 'marcar_pronto');
  v_r := public.registrar_pagamento(v_id, jsonb_build_object(
    'idempotency_key', gen_random_uuid()::text,
    'linhas', jsonb_build_array(jsonb_build_object(
      'forma_id', current_setting('teste.dinheiro', true), 'valor', 50.00))));
  if not coalesce((v_r ->> 'ok')::boolean, false) then
    raise exception 'fixture: pagamento recusado: %', v_r;
  end if;
  v_r := public.comando_pedido(v_id, 'concluir');
  if not coalesce((v_r ->> 'ok')::boolean, false) then
    raise exception 'fixture: conclusao recusada: %', v_r;
  end if;

  update public.payments set received_at = p_quando where order_id = v_id;
  update public.orders set completed_at = p_quando, created_at = p_quando where id = v_id;
  return v_id;
end;
$$;

-- Entrega concluída SEM pagamento registrado.
--
-- Não é um bug forçado: é o caso real do pedido entregue cujo recebimento
-- ainda não foi lançado. Ele é venda registrada e NÃO é faturamento
-- recebido, e existe aqui exatamente para provar que os dois números não se
-- confundem (CLAUDE.md §24).
create or replace function pg_temp.venda_nao_paga(
  p_nome text, p_whats text, p_quando timestamptz)
returns uuid language plpgsql security definer as $$
declare v_idem text := gen_random_uuid()::text; v_r jsonb; v_id uuid;
begin
  v_r := public.criar_pedido(jsonb_build_object(
    'idempotency_key', v_idem,
    'tracking_token', md5(v_idem) || md5(v_idem || ':3'),
    'origem','counter','modalidade','delivery',
    'cliente', jsonb_build_object('nome', p_nome, 'whatsapp', p_whats,
                                  'consentimento_marketing', true),
    'endereco', jsonb_build_object('logradouro','Rua E','numero','9','bairro','Centro',
      'cidade','Cidade','uf','XX','latitude',-23.51,'longitude',-46.61,
      'confianca','exata','provedor','teste'),
    'rota', jsonb_build_object('distancia_km', 2.0, 'provedor','teste'),
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id','f9990003-0000-0000-0000-000000000003',
      'variacao_id','f9990013-0000-0000-0000-000000000013','quantidade',1)),
    'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))
  ), '');
  v_id := (v_r ->> 'pedido_id')::uuid;
  perform public.comando_pedido(v_id, 'iniciar_producao');
  perform public.comando_pedido(v_id, 'marcar_pronto');
  perform public.comando_pedido(v_id, 'despachar');
  v_r := public.comando_pedido(v_id, 'concluir');
  if not coalesce((v_r ->> 'ok')::boolean, false) then
    raise exception 'fixture: conclusao de entrega recusada: %', v_r;
  end if;
  update public.orders set completed_at = p_quando, created_at = p_quando where id = v_id;
  return v_id;
end;
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a9990001-0000-0000-0000-000000000001","role":"authenticated"}';

select public.abrir_caixa('{"fundo":0}'::jsonb);

-- -----------------------------------------------------------------------------
-- MASSA CONTROLADA
-- -----------------------------------------------------------------------------
-- SEMANAL EM DIA: 4 compras a cada 7 dias, a última há 3 dias. Cadência de 7,
-- ausência de 3 → recorrente.
select pg_temp.venda('Semanal F9','(11) 90000-0001', now() - interval '24 days');
select pg_temp.venda('Semanal F9','(11) 90000-0001', now() - interval '17 days');
select pg_temp.venda('Semanal F9','(11) 90000-0001', now() - interval '10 days');
select pg_temp.venda('Semanal F9','(11) 90000-0001', now() - interval '3 days');

-- SUMIDO: 3 compras a cada 7 dias, a última há 25 dias. 25 > 2 × 7 → afastado.
select pg_temp.venda('Sumido F9','(11) 90000-0002', now() - interval '39 days');
select pg_temp.venda('Sumido F9','(11) 90000-0002', now() - interval '32 days');
select pg_temp.venda('Sumido F9','(11) 90000-0002', now() - interval '25 days');

-- DUAS COMPRAS: o caso que motivou RN-CRM-004. Intervalo de 4 dias, 12 dias
-- desde a última. A matemática diria "afastado"; a régua diz "base fraca".
select pg_temp.venda('Duas F9','(11) 90000-0003', now() - interval '16 days');
select pg_temp.venda('Duas F9','(11) 90000-0003', now() - interval '12 days');

-- UMA COMPRA: sem intervalo, nada a classificar. E ausente há 40 dias.
select pg_temp.venda('Uma F9','(11) 90000-0004', now() - interval '40 days');

-- VENDA SEM PAGAMENTO: é venda registrada e NÃO é faturamento recebido.
select pg_temp.venda_nao_paga('Fiado F9','(11) 90000-0005', now() - interval '2 days');

-- UM PEDIDO PARADO NA FILA: pedido do site nasce aguardando confirmação da
-- loja, e é ele que dá conteúdo à central de atenção. Sem uma pendência de
-- verdade, "não há atraso" seria verdade por vacuidade.
select pg_temp.pedido_do_site('Site F9','(11) 90000-0006');

-- PRODUTO PARADO: nenhuma venda. Ele é o único elegível a "vende pouco".
-- PRODUTO NOVO e PAUSADO também não vendem, mas não são comparáveis.

-- CORTESIA: saiu da cozinha e não é receita (RN-CLASS-001).
select public.registrar_movimento_interno(jsonb_build_object(
  'tipo','courtesy','motivo','Cliente antigo, teste F9',
  -- RN-CORT-002: cortesia exige quem assina embaixo.
  'autorizado_por','c9990001-0000-0000-0000-000000000001',
  'itens', jsonb_build_array(jsonb_build_object(
    'produto_id','f9990003-0000-0000-0000-000000000003',
    'variacao_id','f9990013-0000-0000-0000-000000000013','quantidade',1))));

-- Um cliente que NÃO aceita promoção, e outro BLOQUEADO: nenhum dos dois pode
-- aparecer numa lista de remarketing. Ajuste direto de fixture, fora do papel
-- da aplicação: aqui não se testa o bloqueio, apenas se usa o estado.
reset role;
update public.customers set marketing_consent = false
 where whatsapp_normalized = public.normalizar_whatsapp('(11) 90000-0002');
update public.customers set is_blocked = true, blocked_at = now(),
       blocked_reason_internal = 'Teste F9'
 where whatsapp_normalized = public.normalizar_whatsapp('(11) 90000-0004');
set local role authenticated;

-- =============================================================================
-- A. VENDA REGISTRADA ≠ FATURAMENTO RECEBIDO — CLAUDE.md §24, RN-PGTO-003
-- =============================================================================
select set_config('teste.resumo', public.resumo_analitico('30d')::text, true);

select pg_temp.checar('resumo responde ao Owner', 'true',
  (current_setting('teste.resumo', true)::jsonb ->> 'ok'));

-- 8 dos 11 pedidos caem dentro dos últimos 30 dias (os de 32, 39 e 40 dias
-- atrás ficam de fora, e é bom que fiquem: a janela é a janela).
-- 8 × R$ 50,00 = R$ 400,00.
select pg_temp.checar('venda registrada soma os pedidos concluidos', '400.00',
  (current_setting('teste.resumo', true)::jsonb #>> '{atual,vendas_registradas}'));

-- Um deles não foi pago: o faturamento recebido é R$ 50,00 menor.
select pg_temp.checar('faturamento recebido exclui o pedido nao pago', '350.00',
  (current_setting('teste.resumo', true)::jsonb #>> '{atual,faturamento_recebido}'));

select pg_temp.checar('a diferenca entre vender e receber aparece', '50.00',
  (current_setting('teste.resumo', true)::jsonb ->> 'nao_recebido_do_periodo'));

-- RN-CLASS-001: a cortesia existe no resumo, em bloco próprio, e não entrou
-- em nenhum dos dois números acima.
select pg_temp.checar('cortesia aparece como movimento interno', 'courtesy',
  (current_setting('teste.resumo', true)::jsonb #>> '{internos,0,tipo}'));

-- =============================================================================
-- B. PERÍODO — fuso da loja e comparação de mesma duração
-- =============================================================================
select set_config('teste.periodo', public.periodo_analitico('7d', null, null)::text, true);

select pg_temp.checar('7d cobre 7 dias', '7',
  (current_setting('teste.periodo', true)::jsonb ->> 'dias'));

-- O período anterior termina exatamente onde o atual começa: mesma régua nas
-- duas metades, sem sobreposição nem buraco.
select pg_temp.checar('periodo anterior encosta no atual', 'true',
  ((current_setting('teste.periodo', true)::jsonb ->> 'fim_anterior')
   = (current_setting('teste.periodo', true)::jsonb ->> 'inicio'))::text);

select pg_temp.checar('periodo anterior tem a mesma duracao', 'true',
  (((current_setting('teste.periodo', true)::jsonb ->> 'fim')::timestamptz
    - (current_setting('teste.periodo', true)::jsonb ->> 'inicio')::timestamptz)
   = ((current_setting('teste.periodo', true)::jsonb ->> 'fim_anterior')::timestamptz
      - (current_setting('teste.periodo', true)::jsonb ->> 'inicio_anterior')::timestamptz))::text);

-- Fronteira de dia no fuso da loja: 00:00 em São Paulo, não em UTC.
select pg_temp.checar('o dia comeca no fuso da loja', '00:00:00',
  to_char((public.periodo_analitico('hoje', null, null) ->> 'inicio')::timestamptz
          at time zone 'America/Sao_Paulo', 'HH24:MI:SS'));

-- Base zero não vira percentual (RN-DASH-004).
select pg_temp.checar('base zero nao vira percentual', 'false',
  (public.variacao_percentual(0, 120) ->> 'comparavel'));
select pg_temp.checar('base zero devolve percentual nulo', '(null)',
  coalesce(public.variacao_percentual(0, 120) ->> 'percentual', '(null)'));

-- =============================================================================
-- C. RÉGUA DE CADÊNCIA — RN-CRM-004/005
-- =============================================================================
-- SECURITY DEFINER porque `padrao_de_compra` é deliberadamente inacessível a
-- `authenticated`: ela é peça interna das funções analíticas, não uma porta
-- de leitura. O teste chama a régua diretamente, e não abre essa porta.
-- Criada FORA do papel `authenticated` de propósito: uma função SECURITY
-- DEFINER roda como o dono, e o dono é quem a criou.
reset role;
-- Pedido público, que PARA em `waiting_store_confirmation` (RN-STATE-001):
-- pedido recebido não é pedido aceito.
create or replace function pg_temp.pedido_do_site(p_nome text, p_whats text)
returns uuid language plpgsql security definer as $$
declare v_idem text := gen_random_uuid()::text; v_r jsonb;
begin
  v_r := public.criar_pedido(jsonb_build_object(
    'idempotency_key', v_idem,
    'tracking_token', md5(v_idem) || md5(v_idem || ':4'),
    'origem','shalon_link','modalidade','pickup',
    'cliente', jsonb_build_object('nome', p_nome, 'whatsapp', p_whats,
                                  'consentimento_marketing', true),
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id','f9990003-0000-0000-0000-000000000003',
      'variacao_id','f9990013-0000-0000-0000-000000000013','quantidade',1)),
    'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))
  ), current_setting('teste.segredo', true));
  if not coalesce((v_r ->> 'ok')::boolean, false) then
    raise exception 'fixture: pedido do site recusado: %', v_r;
  end if;
  return (v_r ->> 'pedido_id')::uuid;
end;
$$;

create or replace function pg_temp.cadencia(p_whats text)
returns text language sql security definer as $$
  select public.classificar_cliente(p.pedidos, p.intervalo_tipico, p.dias_sem_comprar)
    from public.padrao_de_compra() p
    join public.customers c on c.id = p.customer_id
   where c.whatsapp_normalized = public.normalizar_whatsapp(p_whats);
$$;
set local role authenticated;

select pg_temp.checar('4 compras em dia -> recorrente', 'recorrente',
  pg_temp.cadencia('(11) 90000-0001'));
select pg_temp.checar('3 compras e 25 dias sumido -> afastado', 'afastado',
  pg_temp.cadencia('(11) 90000-0002'));
-- O coração da RN-CRM-004: dois pontos não fazem um hábito.
select pg_temp.checar('2 compras nunca viram afastado', 'base_fraca',
  pg_temp.cadencia('(11) 90000-0003'));
select pg_temp.checar('1 compra nao e classificada', 'dados_insuficientes',
  pg_temp.cadencia('(11) 90000-0004'));

-- Os limites normativos, exatos: 1× ainda é recorrente, 2× ainda é atenção.
select pg_temp.checar('exatamente 1x a cadencia ainda e recorrente', 'recorrente',
  public.classificar_cliente(5, 10, 10));
select pg_temp.checar('acima de 1x vira atencao', 'atencao',
  public.classificar_cliente(5, 10, 11));
select pg_temp.checar('exatamente 2x ainda e atencao', 'atencao',
  public.classificar_cliente(5, 10, 20));
select pg_temp.checar('acima de 2x vira afastado', 'afastado',
  public.classificar_cliente(5, 10, 21));

-- A base fraca expõe os fatos e não dá veredicto.
select set_config('teste.duas',
  (select jsonb_agg(c) from jsonb_array_elements(
     public.clientes_analiticos('{"busca":"Duas F9"}'::jsonb) -> 'clientes') c)::text, true);

-- A busca precisa buscar, não devolver a base inteira (defeito corrigido na
-- migration 0098: "Duas F9" virava o fragmento de telefone "9").
select pg_temp.checar('a busca por nome nao devolve a base inteira', '1',
  jsonb_array_length(current_setting('teste.duas', true)::jsonb)::text);
select pg_temp.checar('base fraca mostra o intervalo observado', '4.0',
  (current_setting('teste.duas', true)::jsonb #>> '{0,intervalo_tipico}'));
select pg_temp.checar('base fraca mostra os dias desde a ultima compra', '12',
  (current_setting('teste.duas', true)::jsonb #>> '{0,dias_sem_comprar}'));
select pg_temp.checar('base fraca explica a recusa em uma frase', 'true',
  ((current_setting('teste.duas', true)::jsonb #>> '{0,porque}')
   like '%Ainda não dá para dizer%')::text);
-- E continua achando pelo telefone quando o texto é mesmo um telefone.
select pg_temp.checar('busca com 4+ digitos ainda acha pelo telefone', 'Duas F9',
  (public.clientes_analiticos('{"busca":"90000-0003"}'::jsonb) #>> '{clientes,0,nome}'));

-- =============================================================================
-- D. FILTRO DE AUSÊNCIA — objetivo e independente da cadência
-- =============================================================================
create or replace function pg_temp.tem_no_filtro(p_filtros jsonb, p_nome text)
returns text language sql as $$
  select exists (
    select 1 from jsonb_array_elements(
      public.clientes_analiticos(p_filtros) -> 'clientes') c
     where c ->> 'nome' = p_nome)::text;
$$;

-- Duas compras e uma compra ENTRAM no filtro objetivo. É o ponto em que a
-- régua de cadência e o filtro de ausência têm de ser independentes.
select pg_temp.checar('ausencia 10+ inclui cliente de 2 compras', 'true',
  pg_temp.tem_no_filtro('{"ausencia_minima":10}'::jsonb, 'Duas F9'));
select pg_temp.checar('ausencia 30+ inclui cliente de 1 compra', 'true',
  pg_temp.tem_no_filtro('{"ausencia_minima":30}'::jsonb, 'Uma F9'));
select pg_temp.checar('ausencia 10+ exclui quem comprou ha 3 dias', 'false',
  pg_temp.tem_no_filtro('{"ausencia_minima":10}'::jsonb, 'Semanal F9'));

-- Quem nunca comprou não está ausente: está sem histórico.
reset role;
insert into public.customers (id, name, whatsapp_normalized, whatsapp_display, marketing_consent)
values ('c9990099-0000-0000-0000-000000000099','Nunca F9','5511900000099','(11) 90000-0099', true);
set local role authenticated;
select pg_temp.checar('quem nunca comprou nao entra no filtro de ausencia', 'false',
  pg_temp.tem_no_filtro('{"ausencia_minima":10}'::jsonb, 'Nunca F9'));

-- A ordenação decide QUEM entra na página, não só a exibição (correção 0096).
select pg_temp.checar('a pagina de 1 traz o mais ausente', 'Uma F9',
  (public.clientes_analiticos('{"limite":1,"ordem":"ausencia","pedidos_minimos":1}'::jsonb)
   #>> '{clientes,0,nome}'));

-- =============================================================================
-- E. RANKING DE PRODUTOS — "vende pouco" exige ter tido chance
-- =============================================================================
create or replace function pg_temp.produto(p_nome text, p_campo text)
returns text language sql as $$
  select p ->> p_campo from jsonb_array_elements(
    public.ranking_de_produtos('30d', null, null, 50) -> 'produtos') p
   where p ->> 'nome' = p_nome;
$$;

select pg_temp.checar('produto novo e marcado como novo', 'true',
  pg_temp.produto('Novidade F9', 'novo_no_periodo'));
select pg_temp.checar('produto novo nao entra em vende pouco', 'false',
  pg_temp.produto('Novidade F9', 'elegivel_para_baixa_venda'));
select pg_temp.checar('produto novo diz por que nao e comparavel',
  'entrou no catálogo durante o período',
  pg_temp.produto('Novidade F9', 'motivo_da_inelegibilidade'));

select pg_temp.checar('produto pausado nao entra em vende pouco', 'false',
  pg_temp.produto('Pausada F9', 'elegivel_para_baixa_venda'));
select pg_temp.checar('produto pausado diz o motivo', 'indisponível no momento',
  pg_temp.produto('Pausada F9', 'motivo_da_inelegibilidade'));

-- O único comparável: existe há tempo, está disponível e não vendeu.
select pg_temp.checar('produto velho e disponivel e comparavel', 'true',
  pg_temp.produto('Parada F9', 'elegivel_para_baixa_venda'));
select pg_temp.checar('produto velho e disponivel aparece com zero', '0',
  pg_temp.produto('Parada F9', 'quantidade'));

-- Sem base anterior, não há percentual inventado.
select pg_temp.checar('sem base anterior nao ha tendencia', 'false',
  ((pg_temp.produto('Parada F9', 'tendencia')::jsonb) ->> 'comparavel'));

-- A-22 dita em voz alta: não há histórico de disponibilidade.
select pg_temp.checar('o ranking avisa que nao ha historico de disponibilidade', 'true',
  ((public.ranking_de_produtos('30d') ->> 'ressalva_de_disponibilidade')
   like '%não guarda histórico%')::text);

-- =============================================================================
-- F. CENTRAL DE ATENÇÃO — nada vira alerta sem régua configurada
-- =============================================================================
select set_config('teste.central', public.central_de_atencao()::text, true);

select pg_temp.checar('central responde ao Owner', 'true',
  (current_setting('teste.central', true)::jsonb ->> 'ok'));

-- RN-DASH-003: `alert_thresholds` está vazia, então o atraso não tem régua —
-- e o sistema devolve nulo em vez de inventar "30 minutos".
-- Há um pedido esperando confirmação, e mesmo assim `atrasado` é NULO: a
-- espera existe, a régua para chamá-la de atraso é que não.
select pg_temp.checar('a fila de confirmacao tem o pedido do site', '1',
  (current_setting('teste.central', true)::jsonb
   #>> '{pedidos,aguardando_confirmacao,quantidade}'));
select pg_temp.checar('sem limite configurado nao existe atraso', '(null)',
  coalesce(current_setting('teste.central', true)::jsonb
           #>> '{pedidos,aguardando_confirmacao,atrasado}', '(null)'));
select pg_temp.checar('sem limite configurado o limite e nulo', '(null)',
  coalesce(current_setting('teste.central', true)::jsonb
           #>> '{pedidos,aguardando_confirmacao,limite_minutos}', '(null)'));

-- Com régua, a mesma pendência passa a poder ser carimbada.
reset role;
insert into public.alert_thresholds (alert_key, threshold_minutes, is_active)
values ('order_waiting_confirmation', 1, true);
set local role authenticated;
select pg_temp.checar('com limite configurado o limite aparece', '1',
  (public.central_de_atencao() #>> '{pedidos,aguardando_confirmacao,limite_minutos}'));
reset role;
delete from public.alert_thresholds;
set local role authenticated;

-- RN-CRM-003: a central só sinaliza quem tem histórico de verdade.
select pg_temp.checar('a central nao sinaliza cliente de 2 compras', 'false',
  (select exists (
     select 1 from jsonb_array_elements(
       public.central_de_atencao() #> '{clientes,exemplos}') e
      where e ->> 'nome' = 'Duas F9'))::text);

-- =============================================================================
-- G. REMARKETING — consentimento, desfecho e compra posterior
-- =============================================================================
create or replace function pg_temp.cliente(p_whats text)
returns uuid language sql as $$
  select id from public.customers
   where whatsapp_normalized = public.normalizar_whatsapp(p_whats);
$$;

create or replace function pg_temp.esta_entre_candidatos(p_nome text, p_filtros jsonb)
returns text language sql as $$
  select exists (
    select 1 from jsonb_array_elements(
      public.candidatos_de_remarketing(p_filtros) -> 'candidatos') c
     where c ->> 'nome' = p_nome)::text;
$$;

-- RN-RMKT-006: quem não consente não entra na lista.
select pg_temp.checar('quem nao aceita promocao nao entra na lista', 'false',
  pg_temp.esta_entre_candidatos('Sumido F9', '{"ausencia_minima":10}'::jsonb));
-- RN-CLI-008: bloqueado não é convidado a voltar.
select pg_temp.checar('cliente bloqueado nunca entra na lista', 'false',
  pg_temp.esta_entre_candidatos('Uma F9', '{"ausencia_minima":10}'::jsonb));
select pg_temp.checar('cliente ausente e com consentimento entra', 'true',
  pg_temp.esta_entre_candidatos('Duas F9', '{"ausencia_minima":10}'::jsonb));

-- A trava vale também na chamada direta, não só na listagem.
select pg_temp.checar('nao prepara contato promocional sem consentimento', 'true',
  (public.preparar_contato_de_remarketing(jsonb_build_object(
     'cliente_id', pg_temp.cliente('(11) 90000-0002'),
     'mensagem','Volta pra gente')) ->> 'sem_consentimento'));

select pg_temp.checar('nao prepara contato para cliente bloqueado', 'true',
  (public.preparar_contato_de_remarketing(jsonb_build_object(
     'cliente_id', pg_temp.cliente('(11) 90000-0004'),
     'mensagem','Volta pra gente')) ->> 'bloqueado'));

-- Preparar registra a TENTATIVA e não afirma envio.
select set_config('teste.contato',
  public.preparar_contato_de_remarketing(jsonb_build_object(
    'cliente_id', pg_temp.cliente('(11) 90000-0003'),
    'mensagem','Oi, sentimos sua falta!', 'segmento','ausentes_10'))::text, true);

select pg_temp.checar('preparar contato funciona com consentimento', 'true',
  (current_setting('teste.contato', true)::jsonb ->> 'ok'));
select pg_temp.checar('o estado do contato e preparado, nunca enviado', 'preparado',
  (current_setting('teste.contato', true)::jsonb ->> 'estado'));
select pg_temp.checar('o desfecho nasce em branco', '(null)',
  coalesce((select r.result::text from public.remarketing_contacts r
             where r.id = (current_setting('teste.contato', true)::jsonb ->> 'contato_id')::uuid),
           '(null)'));

-- RN-RMKT-007: "não quero receber" é decisão do cliente e vale imediatamente.
select public.registrar_resultado_do_contato(jsonb_build_object(
  'contato_id', (current_setting('teste.contato', true)::jsonb ->> 'contato_id')::uuid,
  'resultado','opted_out'));

select pg_temp.checar('opt-out retira o consentimento', 'false',
  (select c.marketing_consent::text from public.customers c
    where c.id = pg_temp.cliente('(11) 90000-0003')));
select pg_temp.checar('opt-out fica no historico de consentimento', '1',
  (select count(*)::text from public.marketing_consent_history h
    where h.customer_id = pg_temp.cliente('(11) 90000-0003') and not h.consent));
select pg_temp.checar('quem pediu para sair some da proxima lista', 'false',
  pg_temp.esta_entre_candidatos('Duas F9', '{"ausencia_minima":10}'::jsonb));

-- Desfecho é informado uma vez: o histórico não é sobrescrito.
select pg_temp.checar('desfecho nao pode ser reescrito', 'true',
  (public.registrar_resultado_do_contato(jsonb_build_object(
     'contato_id', (current_setting('teste.contato', true)::jsonb ->> 'contato_id')::uuid,
     'resultado','contacted')) ->> 'ja_informado'));

-- RN-RMKT-005: compra posterior é temporal. Antes da compra, nada; depois da
-- compra, "houve compra posterior" — e em nenhum momento "a campanha causou".
select pg_temp.checar('sem compra posterior o relatorio nao inventa retorno', '0',
  (public.relatorio_de_remarketing('30d') #>> '{resumo,com_compra_posterior}'));

-- `clock_timestamp()`, não `now()`: dentro de uma transação `now()` é
-- congelado no início dela, e a compra ficaria com o MESMO instante do
-- contato. "Depois" precisa ser depois de verdade.
select pg_temp.venda('Duas F9','(11) 90000-0003', clock_timestamp());

select pg_temp.checar('compra depois do contato aparece como fato', '1',
  (public.relatorio_de_remarketing('30d') #>> '{resumo,com_compra_posterior}'));
select pg_temp.checar('o relatorio nega causalidade em texto', 'true',
  ((public.relatorio_de_remarketing('30d') ->> 'ressalva')
   like '%não afirma que o contato causou%')::text);
-- O contato preparado sem desfecho não é contado como "sem resposta".
select pg_temp.checar('preparado com desfecho informado sai da fila', '0',
  (public.relatorio_de_remarketing('30d') #>> '{resumo,sem_resultado_informado}'));

-- =============================================================================
-- H. RELATÓRIOS — ver, exportar e o que nunca aparece
-- =============================================================================
select pg_temp.checar('Owner ve a lista completa de relatorios', '10',
  jsonb_array_length(public.relatorios_disponiveis() -> 'relatorios')::text);

select pg_temp.checar('Owner pode exportar', 'true',
  (public.relatorios_disponiveis() ->> 'pode_exportar'));

select pg_temp.checar('relatorio de vendas por dia tem uma linha por dia', '7',
  (public.relatorio_tabular('vendas_por_dia','7d') ->> 'linhas_retornadas'));

-- A ressalva que impede a soma errada viaja com o relatório.
select pg_temp.checar('vendas por dia carrega a ressalva de competencia', 'true',
  ((public.relatorio_tabular('vendas_por_dia','7d') #>> '{ressalvas,0}')
   like '%não precisam coincidir%')::text);

-- CLAUDE.md §15: o relatório de entregas é operacional e diz isso.
select pg_temp.checar('relatorio de entregas avisa que nao tem salario', 'true',
  ((public.relatorio_tabular('entregas','30d') #>> '{ressalvas,0}')
   like '%Não contém salário%')::text);

-- §28: não existe coluna de lucro nem de margem em relatório nenhum.
select pg_temp.checar('nenhum relatorio tem coluna de lucro ou margem', '0',
  (select count(*)::text
     from (values ('vendas_por_dia'),('vendas_por_produto'),('vendas_por_categoria'),
                  ('pedidos'),('formas_de_pagamento'),('clientes'),
                  ('movimentos_internos'),('caixa'),('entregas'),('remarketing')) t(tipo),
          lateral jsonb_array_elements(public.relatorio_tabular(t.tipo,'30d') -> 'colunas') c
    where lower(c ->> 'rotulo') ~ '(lucro|margem|cmv|sal[áa]rio)'));

select pg_temp.checar('tipo de relatorio desconhecido e recusado', 'Relatório desconhecido.',
  (public.relatorio_tabular('inventado','30d') ->> 'erro'));

-- A frase que a Shalon lê sai em português, não em notação de banco (0099).
select pg_temp.checar('numero pt-BR descarta a casa decimal inutil', '30',
  public.numero_pt(30.0));
select pg_temp.checar('numero pt-BR usa virgula', '7,5', public.numero_pt(7.5));

-- O rodapé mostra o RÓTULO da coluna; um total cuja chave não existe entre as
-- colunas acabava imprimindo o nome do campo do JSON, na tela e no arquivo
-- exportado (0100).
select pg_temp.checar('todo total corresponde a uma coluna do relatorio', '0',
  (select count(*)::text
     from (values ('vendas_por_dia'),('pedidos'),('formas_de_pagamento')) t(tipo),
          lateral jsonb_object_keys(public.relatorio_tabular(t.tipo,'30d') -> 'totais') k
    where not exists (
      select 1 from jsonb_array_elements(
                     public.relatorio_tabular(t.tipo,'30d') -> 'colunas') c
       where c ->> 'chave' = k)));

-- =============================================================================
-- I. QUEM NÃO PODE, NÃO VÊ — RN-RBAC-004, 03 §20
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9990002-0000-0000-0000-000000000002","role":"authenticated"}';

-- Atendente não tem `reports.view`: não recebe número nenhum.
select pg_temp.checar('atendente nao ve indicadores', 'true',
  (public.resumo_analitico('30d') ->> 'sem_permissao'));
select pg_temp.checar('atendente nao ve ranking', 'true',
  (public.ranking_de_produtos('30d') ->> 'sem_permissao'));
select pg_temp.checar('atendente nao ve relatorio tabular', 'true',
  (public.relatorio_tabular('vendas_por_dia','30d') ->> 'sem_permissao'));
select pg_temp.checar('atendente nao tem relatorio na lista', '0',
  jsonb_array_length(public.relatorios_disponiveis() -> 'relatorios')::text);

-- Atendente não tem `remarketing.view` nem `remarketing.contact`.
select pg_temp.checar('atendente nao ve candidatos de remarketing', 'true',
  (public.candidatos_de_remarketing('{}'::jsonb) ->> 'sem_permissao'));
select pg_temp.checar('atendente nao prepara contato de remarketing', 'true',
  ((public.preparar_contato_de_remarketing(jsonb_build_object(
      'cliente_id', pg_temp.cliente('(11) 90000-0001'),
      'mensagem','Oi')) ->> 'erro') like '%não tem permissão%')::text);

-- A central de atenção responde por bloco: ele vê pedidos e não vê o que não
-- é dele. `remarketing` não aparece para quem não pode ver.
select pg_temp.checar('atendente ve o bloco de pedidos da central', 'true',
  ((public.central_de_atencao() -> 'pedidos') is not null)::text);

-- Analista: vê relatório, NÃO exporta, NÃO vê caixa.
set local request.jwt.claims = '{"sub":"a9990003-0000-0000-0000-000000000003","role":"authenticated"}';

select pg_temp.checar('analista ve vendas por dia', 'true',
  (public.relatorio_tabular('vendas_por_dia','7d') ->> 'ok'));
-- Ver e levar embora são permissões diferentes.
select pg_temp.checar('analista nao exporta', 'true',
  (public.relatorio_tabular('vendas_por_dia','7d', null, null, '{}'::jsonb, true)
   ->> 'sem_permissao'));
select pg_temp.checar('analista nao exporta: a mensagem diz exportar', 'true',
  ((public.relatorio_tabular('vendas_por_dia','7d', null, null, '{}'::jsonb, true)
    ->> 'erro') like '%exportar%')::text);
-- `reports.view` não é uma porta lateral para o domínio alheio.
select pg_temp.checar('reports.view nao abre o relatorio de caixa', 'true',
  (public.relatorio_tabular('caixa','30d') ->> 'sem_permissao'));
select pg_temp.checar('analista nao ve caixa na lista de relatorios', 'false',
  (select exists (
     select 1 from jsonb_array_elements(public.relatorios_disponiveis() -> 'relatorios') r
      where r ->> 'tipo' = 'caixa'))::text);
select pg_temp.checar('analista nao ve clientes no relatorio', 'true',
  (public.relatorio_tabular('clientes','30d') ->> 'sem_permissao'));

-- =============================================================================
-- J. `anon` NÃO ALCANÇA A INTELIGÊNCIA — 03 §15
-- =============================================================================
reset role;
set local role anon;

select pg_temp.checar('anon nao executa resumo_analitico', 'false',
  has_function_privilege('anon','public.resumo_analitico(text, date, date)','execute')::text);
select pg_temp.checar('anon nao executa central_de_atencao', 'false',
  has_function_privilege('anon','public.central_de_atencao()','execute')::text);
select pg_temp.checar('anon nao executa ranking_de_produtos', 'false',
  has_function_privilege('anon','public.ranking_de_produtos(text, date, date, integer)','execute')::text);
select pg_temp.checar('anon nao executa movimento_no_periodo', 'false',
  has_function_privilege('anon','public.movimento_no_periodo(text, date, date)','execute')::text);
select pg_temp.checar('anon nao executa clientes_analiticos', 'false',
  has_function_privilege('anon','public.clientes_analiticos(jsonb)','execute')::text);
select pg_temp.checar('anon nao executa cliente_detalhe', 'false',
  has_function_privilege('anon','public.cliente_detalhe(uuid)','execute')::text);
select pg_temp.checar('anon nao executa candidatos_de_remarketing', 'false',
  has_function_privilege('anon','public.candidatos_de_remarketing(jsonb)','execute')::text);
select pg_temp.checar('anon nao executa preparar_contato_de_remarketing', 'false',
  has_function_privilege('anon','public.preparar_contato_de_remarketing(jsonb)','execute')::text);
select pg_temp.checar('anon nao executa registrar_resultado_do_contato', 'false',
  has_function_privilege('anon','public.registrar_resultado_do_contato(jsonb)','execute')::text);
select pg_temp.checar('anon nao executa relatorio_de_remarketing', 'false',
  has_function_privilege('anon','public.relatorio_de_remarketing(text, date, date)','execute')::text);
select pg_temp.checar('anon nao executa relatorio_tabular', 'false',
  has_function_privilege('anon','public.relatorio_tabular(text, text, date, date, jsonb, boolean)','execute')::text);
select pg_temp.checar('anon nao executa relatorios_disponiveis', 'false',
  has_function_privilege('anon','public.relatorios_disponiveis()','execute')::text);
select pg_temp.checar('anon nao executa registrar_consentimento', 'false',
  has_function_privilege('anon','public.registrar_consentimento(jsonb)','execute')::text);
select pg_temp.checar('anon nao executa marcar_compras_posteriores', 'false',
  has_function_privilege('anon','public.marcar_compras_posteriores()','execute')::text);
select pg_temp.checar('anon nao executa padrao_de_compra', 'false',
  has_function_privilege('anon','public.padrao_de_compra()','execute')::text);
select pg_temp.checar('anon nao executa numero_pt', 'false',
  has_function_privilege('anon','public.numero_pt(numeric)','execute')::text);

-- E não lê as tabelas do módulo pelo /rest/v1: RLS deny by default.
select pg_temp.checar('anon nao le contatos de remarketing', '0',
  (select count(*)::text from public.remarketing_contacts));
select pg_temp.checar('anon nao le templates de remarketing', '0',
  (select count(*)::text from public.remarketing_templates));
select pg_temp.checar('anon nao le historico de consentimento', '0',
  (select count(*)::text from public.marketing_consent_history));

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
