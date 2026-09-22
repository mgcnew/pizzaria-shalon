-- =============================================================================
-- TESTES DE ENTREGA, MOTOBOY E MOVIMENTAÇÃO INTERNA — FASE 8
--
-- 04-REGRAS-NEGOCIO.md RN-RUN-001..007, RN-MOTO-001, RN-CONS-001..005,
-- RN-CORT-001/002, RN-PERDA-001/002, RN-CLASS-001, RN-EMPFIN-001..003
-- 03-RLS-RBAC-SEGURANCA.md §15, §17, §33 · CLAUDE.md §15, §26, §27, §34
--
-- AS QUATRO PERGUNTAS DESTE ARQUIVO:
--   1. o caixa acredita ter dinheiro que ainda está com o motoboy?
--   2. algum movimento interno consegue virar venda ou receita?
--   3. alguma diferença de acerto vira desconto de salário sozinha?
--   4. quem não tem permissão salarial consegue chegar ao salário por
--      qualquer caminho — tabela, RPC, projeção ou relação indireta?
--
-- A primeira e a quarta são as que doem. Entre "entregue" e "conciliado" há
-- dinheiro na rua, e o fechamento não pode contá-lo; entre "registrar
-- consumo" e "ver salário" há uma parede, e ela é de permissão, não de tela.
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
  ('99999999-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona9@teste.local','x',now(),now(),now()),
  ('99999999-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','atendente9@teste.local','x',now(),now(),now());

-- RN-FUNC-001: desligamento é DATA, não exclusão. O constraint do banco
-- recusa "inativo sem data", então o desligado nasce com a data.
insert into public.employees (id, full_name, employee_type, is_driver, employment_status, ended_at) values
  ('a9a9a9a9-0000-0000-0000-000000000001','Dona F8','owner',false,'active',null),
  ('a9a9a9a9-0000-0000-0000-000000000002','Atendente F8','counter',false,'active',null),
  -- Motoboys: funcionários SEM login nenhum. RN-MOTO-001 e CLAUDE.md §10.1.
  ('a9a9a9a9-0000-0000-0000-000000000003','Motoboy Um F8','driver',true,'active',null),
  ('a9a9a9a9-0000-0000-0000-000000000004','Motoboy Dois F8','driver',true,'active',null),
  ('a9a9a9a9-0000-0000-0000-000000000005','Motoboy Desligado F8','driver',true,'inactive',current_date - 1),
  ('a9a9a9a9-0000-0000-0000-000000000006','Nao Entregador F8','counter',false,'active',null);

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b9b9b9b9-0000-0000-0000-000000000001','99999999-1111-1111-1111-111111111111','a9a9a9a9-0000-0000-0000-000000000001',true),
  ('b9b9b9b9-0000-0000-0000-000000000002','99999999-2222-2222-2222-222222222222','a9a9a9a9-0000-0000-0000-000000000002',true);

insert into public.user_roles (app_user_id, role_id)
select 'b9b9b9b9-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
select 'b9b9b9b9-0000-0000-0000-000000000002', id from public.roles where name = 'Atendente';

-- Salário de verdade, para haver o que vazar. Se a tabela estivesse vazia,
-- o teste de isolamento não provaria nada.
insert into public.employee_financial_profiles (employee_id, salary_reference)
values ('a9a9a9a9-0000-0000-0000-000000000003', 3210.99);

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
  'ccccccc9-0000-0000-0000-000000000001','Shalon F8','5500000000000','Rua T','1','Centro',
  'Cidade','XX','00000-000', -23.5, -46.6, 4.0, 40, 60, 20, 30, true, 'America/Sao_Paulo'
);

delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 4, 0.00, true, 1);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d9d9d9d9-0000-0000-0000-000000000001','Grande F8', 8, 2, 901);

insert into public.categories (id, name, slug, sort_order) values
  ('c9c9c9c9-0000-0000-0000-000000000001','Pizzas F8','pizzas-f8', 901);

insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active) values
  ('b9b9b9b9-1000-0000-0000-000000000001','c9c9c9c9-0000-0000-0000-000000000001','pizza','Calabresa F8','calabresa-f8', 1, true);

-- Pizza de R$ 40,00. Todo valor deste arquivo é múltiplo de 40.
insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available) values
  ('a9a9a9a9-1000-0000-0000-000000000001','b9b9b9b9-1000-0000-0000-000000000001','d9d9d9d9-0000-0000-0000-000000000001', 40.00, true, true);

-- Corrida sem pedido nenhum. Criada direto (e aqui, fora do papel de
-- aplicação, porque `driver_runs` não tem policy de INSERT — escrita é só
-- por RPC) porque `atribuir_entrega` nunca produz uma corrida vazia: é
-- exatamente o estado que o guarda do despacho precisa cobrir.
insert into public.driver_runs (id, driver_employee_id, created_by)
values ('99999999-eeee-0000-0000-00000000000e',
        'a9a9a9a9-0000-0000-0000-000000000006','b9b9b9b9-0000-0000-0000-000000000001');

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
-- Maquininha, e não débito: débito exige bandeira (RN-PGTO-006), e bandeira
-- é cadastro da Shalon, que este arquivo não semeia. O que o cenário precisa
-- provar — não-dinheiro não vira papel na gaveta — a maquininha prova igual.
select set_config('teste.maquininha',
  (select id::text from public.payment_methods where code='pix_maquininha'), true);

-- Pedido de ENTREGA já pronto para sair: é o estado de onde a Fase 8 começa.
create or replace function pg_temp.pedido_pronto(p jsonb default '{}'::jsonb)
returns uuid language plpgsql as $$
declare v_idem text := coalesce(p ->> 'idem', gen_random_uuid()::text);
        v_r jsonb; v_id uuid;
begin
  v_r := public.criar_pedido(
    jsonb_build_object(
      'idempotency_key', v_idem,
      'tracking_token', md5(v_idem) || md5(v_idem || ':2'),
      'origem', 'counter',
      'modalidade', coalesce(p ->> 'modalidade', 'delivery'),
      'cliente', jsonb_build_object('nome','Cliente F8','whatsapp','(11) 99000-0001'),
      'endereco', case when coalesce(p ->> 'modalidade','delivery') = 'pickup' then null
                       else jsonb_build_object('logradouro','Rua E','numero','8','bairro','Centro',
                         'cidade','Cidade','uf','XX','latitude',-23.51,'longitude',-46.61,
                         'confianca','exata','provedor','teste') end,
      'rota', case when coalesce(p ->> 'modalidade','delivery') = 'pickup' then null
                   else jsonb_build_object('distancia_km', 2.0, 'provedor','teste') end,
      'itens', jsonb_build_array(jsonb_build_object(
                 'produto_id','b9b9b9b9-1000-0000-0000-000000000001',
                 'variacao_id','a9a9a9a9-1000-0000-0000-000000000001',
                 'quantidade', 1)),
      'pagamento', jsonb_build_object('forma_id',
        coalesce(p ->> 'forma', current_setting('teste.dinheiro', true)))
    ), '');
  v_id := (v_r ->> 'pedido_id')::uuid;

  if coalesce((p ->> 'parar_em_confirmado')::boolean, false) then
    return v_id;
  end if;
  perform public.comando_pedido(v_id, 'iniciar_producao');
  perform public.comando_pedido(v_id, 'marcar_pronto');
  return v_id;
end;
$$;

-- Um identificador que ainda não foi definido vale NULO, não string vazia:
-- assim um cenário que falhou antes aparece como cenário falhado no relatório,
-- em vez de abortar a transação inteira e esconder todos os outros.
create or replace function pg_temp.uid(p_chave text)
returns uuid language sql as $$
  select nullif(current_setting(p_chave, true), '')::uuid;
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

-- =============================================================================
-- A. ATRIBUIÇÃO — RN-RUN-001, RN-MOTO-001
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-1111-1111-1111-111111111111","role":"authenticated"}';

select set_config('teste.p1', pg_temp.pedido_pronto()::text, true);
select set_config('teste.p2', pg_temp.pedido_pronto()::text, true);

select set_config('teste.r1',
  (public.atribuir_entrega(pg_temp.uid('teste.p1'),
    '{"motoboy_id":"a9a9a9a9-0000-0000-0000-000000000003"}'::jsonb) ->> 'corrida_id'), true);

select pg_temp.checar('atribuicao abre corrida do motoboy', 'open',
  (select status from public.driver_runs where id = pg_temp.uid('teste.r1')));

select pg_temp.checar('corrida aponta para o FUNCIONARIO, nao para um login', 'Motoboy Um F8',
  (select e.full_name from public.driver_runs r join public.employees e
     on e.id = r.driver_employee_id where r.id = pg_temp.uid('teste.r1')));

-- Segundo pedido para o mesmo motoboy entra na MESMA corrida: uma corrida
-- ativa por entregador (índice parcial da 0073).
select pg_temp.checar('segundo pedido entra na mesma corrida', 'true',
  ((public.atribuir_entrega(pg_temp.uid('teste.p2'),
    '{"motoboy_id":"a9a9a9a9-0000-0000-0000-000000000003"}'::jsonb) ->> 'corrida_id')
   = current_setting('teste.r1'))::text);

select pg_temp.checar('motoboy tem exatamente uma corrida ativa', '1',
  (select count(*)::text from public.driver_runs
    where driver_employee_id = 'a9a9a9a9-0000-0000-0000-000000000003' and status <> 'settled'));

select pg_temp.checar('mesmo pedido para o mesmo motoboy e recusado', 'true',
  (public.atribuir_entrega(pg_temp.uid('teste.p1'),
    '{"motoboy_id":"a9a9a9a9-0000-0000-0000-000000000003"}'::jsonb) ->> 'ja_atribuido'));

-- RN-RUN-001: RETIRADA NÃO ENTRA. Não é restrição de tela.
select set_config('teste.pret', pg_temp.pedido_pronto('{"modalidade":"pickup"}'::jsonb)::text, true);
select pg_temp.checar('retirada nao pode ser atribuida a motoboy', 'false',
  (public.atribuir_entrega(pg_temp.uid('teste.pret'),
    '{"motoboy_id":"a9a9a9a9-0000-0000-0000-000000000003"}'::jsonb) ->> 'ok'));

select set_config('teste.p3', pg_temp.pedido_pronto('{"parar_em_confirmado":true}'::jsonb)::text, true);
select pg_temp.checar('pedido que ainda nao esta pronto nao e atribuido', 'false',
  (public.atribuir_entrega(pg_temp.uid('teste.p3'),
    '{"motoboy_id":"a9a9a9a9-0000-0000-0000-000000000003"}'::jsonb) ->> 'ok'));

select pg_temp.checar('funcionario que nao e entregador e recusado', 'false',
  (public.atribuir_entrega(pg_temp.uid('teste.p2'),
    '{"motoboy_id":"a9a9a9a9-0000-0000-0000-000000000006"}'::jsonb) ->> 'ok'));

-- RN-FUNC-001: desligado continua existindo; simplesmente não opera.
select pg_temp.checar('motoboy desligado nao recebe entrega', 'false',
  (public.atribuir_entrega(pg_temp.uid('teste.p2'),
    '{"motoboy_id":"a9a9a9a9-0000-0000-0000-000000000005"}'::jsonb) ->> 'ok'));

-- Troca de motoboy: o vínculo anterior PERMANECE como `reassigned` (§22).
select set_config('teste.r2',
  (public.atribuir_entrega(pg_temp.uid('teste.p2'),
    '{"motoboy_id":"a9a9a9a9-0000-0000-0000-000000000004"}'::jsonb) ->> 'corrida_id'), true);

select pg_temp.checar('troca de motoboy preserva o vinculo anterior', '1',
  (select count(*)::text from public.driver_run_orders
    where order_id = pg_temp.uid('teste.p2') and delivery_status = 'reassigned'));

select pg_temp.checar('pedido fica com um unico vinculo ativo', '1',
  (select count(*)::text from public.driver_run_orders
    where order_id = pg_temp.uid('teste.p2') and delivery_status = 'pending'));

select pg_temp.checar('o vinculo ativo e o do novo motoboy', 'true',
  (select (driver_run_id = pg_temp.uid('teste.r2'))::text
     from public.driver_run_orders
    where order_id = pg_temp.uid('teste.p2') and delivery_status = 'pending'));

-- =============================================================================
-- B. DESPACHO — RN-RUN-002
-- =============================================================================
select pg_temp.checar('corrida sem pedido nao despacha', 'false',
  (public.despachar_corrida('99999999-eeee-0000-0000-00000000000e') ->> 'ok'));

select pg_temp.checar('despacha a corrida do segundo motoboy', 'true',
  (public.despachar_corrida(pg_temp.uid('teste.r2')) ->> 'ok'));

select pg_temp.checar('corrida despachada vai para out', 'out',
  (select status from public.driver_runs where id = pg_temp.uid('teste.r2')));

select pg_temp.checar('pedido despachado vai para out_for_delivery', 'out_for_delivery',
  (select status from public.orders where id = pg_temp.uid('teste.p2')));

select pg_temp.checar('corrida ja despachada nao despacha de novo', 'true',
  (public.despachar_corrida(pg_temp.uid('teste.r2')) ->> 'ja_saiu'));

-- Meia corrida na rua seria pior que nenhuma: a 1 tem p1 pronto e nada mais,
-- então junta-se um pedido AINDA NÃO PRONTO por baixo para provar o bloqueio.
-- Pendura um pedido AINDA NÃO PRONTO na corrida, por baixo da RPC. Não há
-- caminho legítimo até esse estado (é o que `atribuir_entrega` recusa), e é
-- justamente ele que o despacho precisa saber recusar.
reset role;
insert into public.driver_run_orders (driver_run_id, order_id, assigned_by)
values (pg_temp.uid('teste.r1'), pg_temp.uid('teste.p3'),
        'b9b9b9b9-0000-0000-0000-000000000001');
set local role authenticated;

select pg_temp.checar('corrida com um pedido nao pronto nao despacha nenhum', 'false',
  (public.despachar_corrida(pg_temp.uid('teste.r1')) ->> 'ok'));

select pg_temp.checar('e o pedido pronto da mesma corrida NAO saiu', 'ready_for_delivery',
  (select status from public.orders where id = pg_temp.uid('teste.p1')));

reset role;
delete from public.driver_run_orders
 where driver_run_id = pg_temp.uid('teste.r1')
   and order_id = pg_temp.uid('teste.p3');
set local role authenticated;

select pg_temp.checar('removido o impedimento, a corrida despacha', 'true',
  (public.despachar_corrida(pg_temp.uid('teste.r1')) ->> 'ok'));

-- =============================================================================
-- C. RETORNO — RN-RUN-003, RN-RUN-007, RN-PGTO-014
-- =============================================================================
select pg_temp.checar('abre caixa para os cenarios de dinheiro', 'true',
  (public.abrir_caixa('{"fundo":0}'::jsonb) ->> 'ok'));
select set_config('teste.sessao',
  (select id::text from public.cash_sessions where status = 'open'), true);

-- O pagamento acontece NA RUA: o motoboy recebe em dinheiro.
select pg_temp.marcar();
select pg_temp.checar('registra o recebimento em dinheiro do pedido entregue', 'true',
  (public.registrar_pagamento(pg_temp.uid('teste.p2'), jsonb_build_object(
     'idempotency_key', gen_random_uuid()::text,
     'linhas', jsonb_build_array(jsonb_build_object(
        'forma_id', current_setting('teste.dinheiro'), 'valor', 40.00,
        -- O dinheiro NÃO entra na gaveta: quem o tem é o motoboy.
        'na_gaveta', false)))) ->> 'ok'));

-- RN-CAIXA-014: A PERGUNTA CENTRAL DESTE ARQUIVO. O dinheiro está com o
-- motoboy. O caixa NÃO pode achar que o tem.
select pg_temp.checar('dinheiro recebido na rua NAO entra no esperado do caixa', '0.00',
  pg_temp.variacao());

select pg_temp.checar('mas ele aparece como dinheiro fora da gaveta', '40.00',
  public.dinheiro_fora_da_gaveta()::text);

-- O dinheiro está com o motoboy AGORA, antes de qualquer conferência: é
-- justamente enquanto ele está na rua que a pergunta importa.
select pg_temp.checar('a central mostra o dinheiro na rua ANTES da conferencia', '40.00',
  (select c ->> 'dinheiro_na_rua' from jsonb_array_elements(
     public.central_de_entregas() -> 'corridas') c
    where c ->> 'corrida_id' = current_setting('teste.r2')));

select set_config('teste.v2',
  (select id::text from public.driver_run_orders
    where order_id = pg_temp.uid('teste.p2') and delivery_status = 'pending'), true);

select pg_temp.marcar();
select pg_temp.checar('registra o retorno como entregue', 'true',
  (public.registrar_retorno(pg_temp.uid('teste.v2'), '{"entregue":true}'::jsonb) ->> 'ok'));

select pg_temp.checar('pedido entregue fica completed', 'completed',
  (select status from public.orders where id = pg_temp.uid('teste.p2')));

-- RN-RUN-003: entregar NÃO é conciliar. Conferir o retorno não move gaveta.
select pg_temp.checar('conferir a entrega NAO move o caixa', '0.00', pg_temp.variacao());

-- Conferir o retorno não recolhe o dinheiro: ele só entra na gaveta no acerto.
select pg_temp.checar('e o dinheiro continua na rua depois da conferencia', '40.00',
  (select c ->> 'dinheiro_na_rua' from jsonb_array_elements(
     public.central_de_entregas() -> 'corridas') c
    where c ->> 'corrida_id' = current_setting('teste.r2')));

select pg_temp.checar('corrida sem pendencia passa sozinha para settling', 'settling',
  (select status from public.driver_runs where id = pg_temp.uid('teste.r2')));

select pg_temp.checar('retorno ja conferido nao se confere de novo', 'true',
  (public.registrar_retorno(pg_temp.uid('teste.v2'), '{"entregue":true}'::jsonb)
   ->> 'ja_conferida'));

-- Falha de entrega, na corrida 1.
select set_config('teste.v1',
  (select id::text from public.driver_run_orders
    where order_id = pg_temp.uid('teste.p1') and delivery_status = 'pending'), true);

-- RN-STATE-008: falha exige motivo.
select pg_temp.checar('falha sem motivo e recusada', 'false',
  (public.registrar_retorno(pg_temp.uid('teste.v1'), '{"entregue":false}'::jsonb) ->> 'ok'));

select pg_temp.marcar();
select pg_temp.checar('falha com motivo e aceita', 'true',
  (public.registrar_retorno(pg_temp.uid('teste.v1'),
    '{"entregue":false,"motivo":"Cliente ausente no endereco"}'::jsonb) ->> 'ok'));

select pg_temp.checar('pedido que falhou fica delivery_failed', 'delivery_failed',
  (select status from public.orders where id = pg_temp.uid('teste.p1')));

-- RN-RUN-007: falha não é venda, não é receita e não é dinheiro recebido.
select pg_temp.checar('falha nao move o caixa', '0.00', pg_temp.variacao());

select pg_temp.checar('falha nao cria recebimento', '0',
  (select count(*)::text from public.payments
    where order_id = pg_temp.uid('teste.p1') and status = 'confirmed'));

-- =============================================================================
-- D. ACERTO — RN-RUN-004/005/006, RN-PGTO-014
-- =============================================================================
-- RN-RUN-004: o esperado é DERIVADO, nunca digitado.
select pg_temp.checar('o esperado do acerto sai dos recebimentos em dinheiro', '40.00',
  (public.corrida(pg_temp.uid('teste.r2')) ->> 'esperado_em_dinheiro'));

-- Um acerto com valor errado e sem motivo: RN-RUN-004 exige a justificativa.
select pg_temp.checar('diferenca sem motivo e recusada', 'true',
  (public.conciliar_corrida(pg_temp.uid('teste.r2'),
    '{"devolvido":35}'::jsonb) ->> 'exige_motivo'));

select pg_temp.checar('a recusa ainda nao mexeu no caixa', '0',
  (select count(*)::text from public.cash_movements
    where cash_session_id = pg_temp.uid('teste.sessao')
      and movement_type = 'sale_receipt'));

-- Acerto exato: ESTA é a porta pela qual o dinheiro da rua entra na gaveta.
select pg_temp.marcar();
select pg_temp.checar('acerto exato e aceito', 'true',
  (public.conciliar_corrida(pg_temp.uid('teste.r2'),
    '{"devolvido":40}'::jsonb) ->> 'ok'));

select pg_temp.checar('agora sim o dinheiro entra na gaveta', '40.00', pg_temp.variacao());

select pg_temp.checar('e deixa de ser dinheiro fora da gaveta', '0.00',
  public.dinheiro_fora_da_gaveta()::text);

select pg_temp.checar('o recebimento passou a apontar para a sessao de caixa', 'true',
  (select (cash_session_id = pg_temp.uid('teste.sessao'))::text
     from public.payments where order_id = pg_temp.uid('teste.p2')
       and status = 'confirmed'));

select pg_temp.checar('corrida acertada fica settled', 'settled',
  (select status from public.driver_runs where id = pg_temp.uid('teste.r2')));

-- CLAUDE.md §34: uma corrida se acerta UMA vez.
select pg_temp.checar('segundo acerto da mesma corrida e recusado', 'true',
  (public.conciliar_corrida(pg_temp.uid('teste.r2'),
    '{"devolvido":40}'::jsonb) ->> 'ja_acertada'));

-- Corrida 1: só teve falha, então não há dinheiro nenhum a recolher.
select pg_temp.marcar();
select pg_temp.checar('corrida so com falha acerta com zero', 'true',
  (public.conciliar_corrida(pg_temp.uid('teste.r1'),
    '{"devolvido":0}'::jsonb) ->> 'ok'));

select pg_temp.checar('acerto sem dinheiro nao move a gaveta', '0.00', pg_temp.variacao());

-- Maquininha NÃO é papel na gaveta: um acerto com cartão não pode virar dinheiro.
select set_config('teste.p4', pg_temp.pedido_pronto(
  jsonb_build_object('forma', current_setting('teste.maquininha')))::text, true);
select set_config('teste.r3',
  (public.atribuir_entrega(pg_temp.uid('teste.p4'),
    '{"motoboy_id":"a9a9a9a9-0000-0000-0000-000000000003"}'::jsonb) ->> 'corrida_id'), true);
select public.despachar_corrida(pg_temp.uid('teste.r3'));
select public.registrar_pagamento(pg_temp.uid('teste.p4'), jsonb_build_object(
  'idempotency_key', gen_random_uuid()::text,
  'linhas', jsonb_build_array(jsonb_build_object(
     'forma_id', current_setting('teste.maquininha'), 'valor', 40.00))));
select public.registrar_retorno(
  (select id from public.driver_run_orders
    where order_id = pg_temp.uid('teste.p4') and delivery_status = 'pending'),
  '{"entregue":true}'::jsonb);

select pg_temp.checar('corrida paga na maquininha espera ZERO em dinheiro', '0.00',
  (public.corrida(pg_temp.uid('teste.r3')) ->> 'esperado_em_dinheiro'));

select pg_temp.marcar();
select pg_temp.checar('acerto de corrida na maquininha e aceito', 'true',
  (public.conciliar_corrida(pg_temp.uid('teste.r3'),
    '{"devolvido":0}'::jsonb) ->> 'ok'));

select pg_temp.checar('maquininha NAO virou dinheiro na gaveta', '0.00', pg_temp.variacao());

-- =============================================================================
-- E. DIFERENÇA DE ACERTO — RN-RUN-005/006
-- =============================================================================
select set_config('teste.p5', pg_temp.pedido_pronto()::text, true);
select set_config('teste.r4',
  (public.atribuir_entrega(pg_temp.uid('teste.p5'),
    '{"motoboy_id":"a9a9a9a9-0000-0000-0000-000000000004"}'::jsonb) ->> 'corrida_id'), true);
select public.despachar_corrida(pg_temp.uid('teste.r4'));
select public.registrar_pagamento(pg_temp.uid('teste.p5'), jsonb_build_object(
  'idempotency_key', gen_random_uuid()::text,
  'linhas', jsonb_build_array(jsonb_build_object(
     'forma_id', current_setting('teste.dinheiro'), 'valor', 40.00, 'na_gaveta', false))));
select public.registrar_retorno(
  (select id from public.driver_run_orders
    where order_id = pg_temp.uid('teste.p5') and delivery_status = 'pending'),
  '{"entregue":true}'::jsonb);

select pg_temp.marcar();
select pg_temp.checar('acerto com falta e aceito quando ha motivo', 'true',
  (public.conciliar_corrida(pg_temp.uid('teste.r4'),
    '{"devolvido":30,"motivo":"Motoboy diz que faltou troco"}'::jsonb) ->> 'ok'));

select pg_temp.checar('a diferenca fica gravada e e derivada', '-10.00',
  (select difference::text from public.driver_run_settlements
    where driver_run_id = pg_temp.uid('teste.r4')));

-- O caixa recebe o que FOI RECEBIDO no pedido, não o que o motoboy trouxe:
-- inventar um recebimento menor para "fechar" seria falsear a venda.
select pg_temp.checar('a gaveta recebe o valor dos recebimentos, nao o devolvido', '40.00',
  pg_temp.variacao());

-- RN-RUN-005: E NADA ACONTECE COM O SALÁRIO.
select pg_temp.checar('diferenca NAO cria lancamento de funcionario sozinha', '0',
  (select count(*)::text from public.employee_ledger_entries
    where related_driver_run_id = pg_temp.uid('teste.r4')));

select pg_temp.checar('diferenca NAO altera o perfil salarial', '3210.99',
  (select salary_reference::text from public.employee_financial_profiles
    where employee_id = 'a9a9a9a9-0000-0000-0000-000000000003'));

-- RN-RUN-006: virar lançamento é ATO EXPLÍCITO, e cria vínculo rastreável.
select pg_temp.checar('lancar a diferenca no funcionario e aceito', 'true',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id','a9a9a9a9-0000-0000-0000-000000000004',
     'tipo','discrepancy', 'valor', 10.00,
     'corrida_id', current_setting('teste.r4'),
     'motivo','Diferenca do acerto, combinada com o motoboy',
     'idempotency_key', gen_random_uuid()::text)) ->> 'ok'));

select pg_temp.checar('o lancamento guarda o vinculo com a corrida', 'true',
  (select (related_driver_run_id = pg_temp.uid('teste.r4'))::text
     from public.employee_ledger_entries
    where related_driver_run_id = pg_temp.uid('teste.r4')));

select pg_temp.checar('a projecao da corrida mostra o lancamento', 'true',
  ((public.corrida(pg_temp.uid('teste.r4')) -> 'acerto' ->> 'lancamento_id')
   is not null)::text);

-- §34: a mesma corrida não vira dois lançamentos.
select pg_temp.checar('a mesma corrida nao vira dois lancamentos', 'true',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id','a9a9a9a9-0000-0000-0000-000000000004',
     'tipo','discrepancy', 'valor', 10.00,
     'corrida_id', current_setting('teste.r4'),
     'motivo','Tentativa duplicada',
     'idempotency_key', gen_random_uuid()::text)) ->> 'ja_lancado'));

select pg_temp.checar('lancamento por corrida nao acertada e recusado', 'false',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id','a9a9a9a9-0000-0000-0000-000000000004',
     'tipo','discrepancy', 'valor', 5.00,
     'corrida_id', gen_random_uuid()::text,
     'motivo','Corrida inexistente')) ->> 'ok'));

-- RN-EMPFIN-003: o livro soma, e a folha continua onde estava.
select pg_temp.checar('o livro do funcionario soma o lancamento', '10.00',
  (public.historico_do_funcionario('a9a9a9a9-0000-0000-0000-000000000004') ->> 'total_confirmado'));

select pg_temp.checar('e o salario segue intocado', '3210.99',
  (select salary_reference::text from public.employee_financial_profiles
    where employee_id = 'a9a9a9a9-0000-0000-0000-000000000003'));

-- =============================================================================
-- F. MOVIMENTOS INTERNOS — RN-CLASS-001, RN-CONS/CORT/PERDA
-- =============================================================================
select set_config('teste.item',
  jsonb_build_object(
    'produto_id','b9b9b9b9-1000-0000-0000-000000000001',
    'variacao_id','a9a9a9a9-1000-0000-0000-000000000001',
    'quantidade', 2)::text, true);

select pg_temp.checar('cortesia sem autorizador e recusada', 'false',
  (public.registrar_movimento_interno(jsonb_build_object(
     'tipo','courtesy','motivo','Pedido atrasou',
     'itens', jsonb_build_array(current_setting('teste.item')::jsonb))) ->> 'ok'));

select pg_temp.checar('cortesia com autorizador e aceita', 'true',
  (public.registrar_movimento_interno(jsonb_build_object(
     'tipo','courtesy','motivo','Pedido atrasou',
     'autorizado_por','b9b9b9b9-0000-0000-0000-000000000001',
     'itens', jsonb_build_array(current_setting('teste.item')::jsonb))) ->> 'ok'));

select pg_temp.checar('consumo de funcionario sem funcionario e recusado', 'false',
  (public.registrar_movimento_interno(jsonb_build_object(
     'tipo','employee_consumption','motivo','Jantar do plantao',
     'itens', jsonb_build_array(current_setting('teste.item')::jsonb))) ->> 'ok'));

select pg_temp.checar('perda com funcionario e recusada', 'false',
  (public.registrar_movimento_interno(jsonb_build_object(
     'tipo','loss','motivo','Queimou no forno',
     'funcionario_id','a9a9a9a9-0000-0000-0000-000000000003',
     'itens', jsonb_build_array(current_setting('teste.item')::jsonb))) ->> 'ok'));

select set_config('teste.mov',
  (public.registrar_movimento_interno(jsonb_build_object(
     'tipo','employee_consumption','motivo','Jantar do plantao',
     'funcionario_id','a9a9a9a9-0000-0000-0000-000000000003',
     'itens', jsonb_build_array(current_setting('teste.item')::jsonb),
     'idempotency_key','99999999-aaaa-0000-0000-000000000001')) ->> 'movimento_id'), true);

-- CLAUDE.md §17: o preço vem do configurador compartilhado. 2 × R$ 40,00.
select pg_temp.checar('o valor de referencia vem do configurador', '80.00',
  (select sum(quantity * reference_unit_price)::numeric(12,2)::text
     from public.internal_product_movement_items
    where movement_id = pg_temp.uid('teste.mov')));

select pg_temp.checar('o item guarda snapshot do nome do produto', 'Calabresa F8',
  (select product_name_snapshot from public.internal_product_movement_items
    where movement_id = pg_temp.uid('teste.mov')));

-- RN-CLASS-001: A SEGUNDA PERGUNTA DESTE ARQUIVO. Consumo NÃO é venda.
-- RN-CLASS-001: A SEGUNDA PERGUNTA DESTE ARQUIVO. Consumo NÃO é venda, e a
-- prova é contagem antes e depois: nenhum pedido novo, nenhum recebimento.
select set_config('teste.pedidos_antes', (select count(*)::text from public.orders), true);
select set_config('teste.pagamentos_antes', (select count(*)::text from public.payments), true);

select public.registrar_movimento_interno(jsonb_build_object(
  'tipo','owner_consumption','motivo','Almoco da proprietaria',
  'funcionario_id','a9a9a9a9-0000-0000-0000-000000000001',
  'itens', jsonb_build_array(current_setting('teste.item')::jsonb)));

select pg_temp.checar('consumo nao cria pedido', current_setting('teste.pedidos_antes'),
  (select count(*)::text from public.orders));

select pg_temp.checar('consumo nao cria recebimento', current_setting('teste.pagamentos_antes'),
  (select count(*)::text from public.payments));

select pg_temp.marcar();
select pg_temp.checar('consumo nao mexe no caixa', '0.00', pg_temp.variacao());

select pg_temp.checar('consumo nao cria lancamento financeiro', '0',
  (select count(*)::text from public.financial_entries
    where description ilike '%Jantar do plantao%'));

-- E não cria dívida sozinho: quem decide isso é outra permissão, noutro ato.
select pg_temp.checar('consumo nao vira lancamento do funcionario sozinho', '0',
  (select count(*)::text from public.employee_ledger_entries
    where related_internal_movement_id = pg_temp.uid('teste.mov')));

select pg_temp.checar('a mesma tentativa nao vira dois movimentos', 'true',
  (public.registrar_movimento_interno(jsonb_build_object(
     'tipo','employee_consumption','motivo','Jantar do plantao',
     'funcionario_id','a9a9a9a9-0000-0000-0000-000000000003',
     'itens', jsonb_build_array(current_setting('teste.item')::jsonb),
     'idempotency_key','99999999-aaaa-0000-0000-000000000001')) ->> 'ja_existia'));

select pg_temp.checar('a projecao mostra o valor de referencia', '80.00',
  (select m ->> 'valor_referencia' from jsonb_array_elements(
     public.movimentos_internos('{}'::jsonb)) m
    where m ->> 'movimento_id' = current_setting('teste.mov')));

-- Agora o consumo VIRA dívida, por ato explícito de quem tem a permissão.
select pg_temp.checar('lancar o consumo no funcionario e aceito', 'true',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id','a9a9a9a9-0000-0000-0000-000000000003',
     'tipo','consumption','valor', 80.00,
     'movimento_id', current_setting('teste.mov'),
     'motivo','Consumo do plantao, combinado')) ->> 'ok'));

-- §28: estornar o fato sem estornar a dívida deixaria a dívida órfã.
select pg_temp.checar('movimento com lancamento nao pode ser estornado direto', 'true',
  (public.reverter_movimento_interno(pg_temp.uid('teste.mov'),
    'Classifiquei errado') ->> 'tem_lancamento'));

select set_config('teste.lanc',
  (select id::text from public.employee_ledger_entries
    where related_internal_movement_id = pg_temp.uid('teste.mov')), true);

select pg_temp.checar('estorna o lancamento primeiro', 'true',
  (public.reverter_lancamento_funcionario(pg_temp.uid('teste.lanc'),
    'Classifiquei errado') ->> 'ok'));

-- §28: reversão NÃO apaga a evidência.
select pg_temp.checar('o lancamento estornado continua existindo', 'reversed',
  (select status from public.employee_ledger_entries
    where id = pg_temp.uid('teste.lanc')));

select pg_temp.checar('o estorno guarda quem e por que', 'true',
  (select (reversed_by is not null and reversal_reason is not null)::text
     from public.employee_ledger_entries where id = pg_temp.uid('teste.lanc')));

select pg_temp.checar('o livro nao soma mais o lancamento estornado', '0.00',
  (public.historico_do_funcionario('a9a9a9a9-0000-0000-0000-000000000003') ->> 'total_confirmado'));

select pg_temp.checar('agora o movimento pode ser estornado', 'true',
  (public.reverter_movimento_interno(pg_temp.uid('teste.mov'),
    'Classifiquei errado') ->> 'ok'));

select pg_temp.checar('o movimento estornado continua existindo', 'reversed',
  (select status from public.internal_product_movements
    where id = pg_temp.uid('teste.mov')));

select pg_temp.checar('os itens do movimento estornado continuam la', '1',
  (select count(*)::text from public.internal_product_movement_items
    where movement_id = pg_temp.uid('teste.mov')));

select pg_temp.checar('duplo estorno e recusado', 'true',
  (public.reverter_movimento_interno(pg_temp.uid('teste.mov'),
    'De novo') ->> 'ja_revertido'));

-- =============================================================================
-- G. ISOLAMENTO SALARIAL — CLAUDE.md §15, RN-EMPFIN-001
-- A QUARTA PERGUNTA. O atendente REGISTRA consumo e NÃO chega ao salário por
-- caminho nenhum: nem tabela, nem RPC, nem projeção, nem relação indireta.
-- =============================================================================
set local request.jwt.claims = '{"sub":"99999999-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('atendente REGISTRA movimento interno', 'true',
  (public.registrar_movimento_interno(jsonb_build_object(
     'tipo','loss','motivo','Massa caiu no chao',
     'itens', jsonb_build_array(current_setting('teste.item')::jsonb))) ->> 'ok'));

select pg_temp.checar('atendente VE movimentos internos', 'true',
  (jsonb_array_length(public.movimentos_internos('{}'::jsonb)) > 0)::text);

-- ... e aqui a parede.
select pg_temp.checar('atendente NAO le o livro do funcionario', '0',
  (select count(*)::text from public.employee_ledger_entries));

select pg_temp.checar('atendente NAO ve lancamento pela projecao', '0',
  (select jsonb_array_length(
     public.historico_do_funcionario('a9a9a9a9-0000-0000-0000-000000000004') -> 'lancamentos')::text));

select pg_temp.checar('nem pelo total da projecao', '0.00',
  (public.historico_do_funcionario('a9a9a9a9-0000-0000-0000-000000000004') ->> 'total_confirmado'));

select pg_temp.checar('atendente NAO le o perfil salarial', '0',
  (select count(*)::text from public.employee_financial_profiles));

select pg_temp.checar('atendente NAO lanca no funcionario', 'false',
  (public.lancar_no_funcionario(jsonb_build_object(
     'funcionario_id','a9a9a9a9-0000-0000-0000-000000000003',
     'tipo','advance','valor', 100.00, 'motivo','Tentativa indevida')) ->> 'ok'));

select pg_temp.checar('atendente NAO estorna lancamento do funcionario', 'false',
  (public.reverter_lancamento_funcionario(pg_temp.uid('teste.lanc'),
    'Tentativa indevida') ->> 'ok'));

-- Relação indireta: o movimento interno é dele, mas o campo do livro não vem
-- junto — `tem_lancamento` responde `false` porque a RLS do ledger não devolve
-- a linha, e é exatamente esse o comportamento correto.
select pg_temp.checar('movimento interno nao carrega o livro por relacao', 'false',
  (select m ->> 'tem_lancamento' from jsonb_array_elements(
     public.movimentos_internos('{}'::jsonb)) m
    where m ->> 'movimento_id' = current_setting('teste.mov')));

-- RN-RUN-006 é de acerto, e acerto é do Owner.
-- E a recusa é POR PERMISSÃO, não por acaso de estado: `conciliar_corrida`
-- checa `deliveries.settle` antes de olhar a corrida.
select pg_temp.checar('atendente NAO tem a permissao de acerto', 'false',
  public.has_permission('deliveries.settle')::text);

select pg_temp.checar('atendente NAO faz o acerto do motoboy', 'true',
  ((public.conciliar_corrida(pg_temp.uid('teste.r1'),
    '{"devolvido":0}'::jsonb) ->> 'erro') like '%permiss%')::text);

-- Mas gerencia a entrega: atribuir, despachar e conferir são do balcão.
select pg_temp.checar('atendente PODE gerenciar entregas', 'true',
  public.has_permission('deliveries.manage')::text);

-- =============================================================================
-- H. SUPERFÍCIE PÚBLICA — 03 §33
-- `anon` não chega a nada disto.
-- =============================================================================
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select pg_temp.checar('anon nao le corridas', '0',
  (select count(*)::text from public.driver_runs));
select pg_temp.checar('anon nao le atribuicoes', '0',
  (select count(*)::text from public.driver_run_orders));
select pg_temp.checar('anon nao le acertos', '0',
  (select count(*)::text from public.driver_run_settlements));
select pg_temp.checar('anon nao le movimentos internos', '0',
  (select count(*)::text from public.internal_product_movements));
select pg_temp.checar('anon nao le o livro do funcionario', '0',
  (select count(*)::text from public.employee_ledger_entries));
select pg_temp.checar('anon nao le salario', '0',
  (select count(*)::text from public.employee_financial_profiles));

select pg_temp.checar('anon nao executa atribuir_entrega', 'false',
  has_function_privilege('anon','public.atribuir_entrega(uuid, jsonb)','execute')::text);
select pg_temp.checar('anon nao executa despachar_corrida', 'false',
  has_function_privilege('anon','public.despachar_corrida(uuid)','execute')::text);
select pg_temp.checar('anon nao executa registrar_retorno', 'false',
  has_function_privilege('anon','public.registrar_retorno(uuid, jsonb)','execute')::text);
select pg_temp.checar('anon nao executa conciliar_corrida', 'false',
  has_function_privilege('anon','public.conciliar_corrida(uuid, jsonb)','execute')::text);
select pg_temp.checar('anon nao executa registrar_movimento_interno', 'false',
  has_function_privilege('anon','public.registrar_movimento_interno(jsonb)','execute')::text);
select pg_temp.checar('anon nao executa lancar_no_funcionario', 'false',
  has_function_privilege('anon','public.lancar_no_funcionario(jsonb)','execute')::text);
select pg_temp.checar('anon nao executa historico_do_funcionario', 'false',
  has_function_privilege('anon','public.historico_do_funcionario(uuid, integer)','execute')::text);
select pg_temp.checar('anon nao executa central_de_entregas', 'false',
  has_function_privilege('anon','public.central_de_entregas()','execute')::text);
select pg_temp.checar('anon nao executa movimentos_internos', 'false',
  has_function_privilege('anon','public.movimentos_internos(jsonb)','execute')::text);

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
