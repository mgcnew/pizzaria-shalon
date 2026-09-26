-- =============================================================================
-- RECEBIMENTO NO PDV — FASE 12, ETAPA 7
--
-- 09-PDV-FRENTE-DE-CAIXA.md §1.1, §1.4, §1.6, §1.7, §1.8, §9
-- RN-PGTO-002/003/005/006 · RN-CAIXA-001/003/014 · D-2026-09-26-79
--
-- ESTA ETAPA NÃO CRIOU MIGRATION. `registrar_pagamento` já fazia tudo o que a
-- Etapa 7 pede, e esta suíte é a prova disso: cada cenário exercita a
-- autoridade que já estava persistida.
--
-- AS PERGUNTAS QUE ESTE ARQUIVO RESPONDE:
--
-- 1. dinheiro, troco, Pix e divisão funcionam pelo contrato existente? (A, B, C)
-- 2. o que o servidor RECUSA continua recusando? (bloco D)
-- 3. dois cliques, duas abas, dois terminais: o que acontece? (bloco E)
-- 4. dinheiro entra na gaveta e cartão/Pix não? (bloco F)
-- 5. pagar mexe na produção? (bloco G — não mexe)
--
-- NENHUMA CONTAGEM ABSOLUTA do ambiente: tudo é delta ou pergunta sobre ESTE
-- pedido.
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

create or replace function pg_temp.campo(p_pedido uuid, p_campo text)
returns text language plpgsql security definer as $h$
declare v text;
begin execute format('select (%I)::text from public.orders where id = $1', p_campo)
  into v using p_pedido; return v; end; $h$;

/** Pagamentos confirmados deste pedido. */
create or replace function pg_temp.pagos(p_pedido uuid) returns integer
language sql security definer as $h$
  select count(*)::integer from public.payments
   where order_id = p_pedido and status = 'confirmed'; $h$;

create or replace function pg_temp.na_fila(p_pedido uuid) returns boolean
language plpgsql as $h$
declare v boolean;
begin execute 'select exists (select 1 from public.pedidos_a_receber() where id = $1)'
  into v using p_pedido; return v; end; $h$;

/** Movimento físico de gaveta gerado por este pedido. */
create or replace function pg_temp.movimentos(p_pedido uuid) returns integer
language sql security definer as $h$
  select count(*)::integer from public.cash_movements
   where order_id = p_pedido and movement_type = 'sale_receipt'; $h$;

create or replace function pg_temp.movimentado(p_pedido uuid) returns numeric
language sql security definer as $h$
  select coalesce(sum(amount), 0) from public.cash_movements
   where order_id = p_pedido and movement_type = 'sale_receipt' and direction = 'in'; $h$;

/**
 * Um campo de `payments`, por SECURITY DEFINER.
 *
 * NÃO é conveniência: o `select` de `payments` exige `finance.view`, e o papel
 * desta suíte — como o de um operador de balcão — tem `payments.register` e
 * não tem `finance.view`. Lendo direto, os cenários mediriam a POLICY em vez
 * do pagamento, e passariam ou falhariam falando de outra coisa. Aconteceu no
 * primeiro ensaio, em quatro cenários.
 */
create or replace function pg_temp.pagamento(p_pedido uuid, p_campo text)
returns text language plpgsql security definer as $h$
declare v text;
begin
  execute format('select (%I)::text from public.payments where order_id = $1 limit 1', p_campo)
    into v using p_pedido;
  return v;
end; $h$;

create or replace function pg_temp.linhas_gravadas(p_pedido uuid) returns integer
language sql security definer as $h$
  select count(*)::integer from public.payments where order_id = p_pedido; $h$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('99999999-7777-1111-1111-111111111111','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','recebe7@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status)
values ('a9a9a9a9-0000-0000-0000-000000000001','Recebe E7','owner',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active)
values ('b9b9b9b9-0000-0000-0000-000000000001','99999999-7777-1111-1111-111111111111',
        'a9a9a9a9-0000-0000-0000-000000000001',true);
insert into public.roles (id, name, description, is_system, is_active)
values ('c9c9c9c9-0000-0000-0000-00000000000a','Recebe E7','recebe no balcao',false,true);
-- `cash.bypass_session` NÃO entra: é justamente a exceção que o bloco D
-- precisa ver funcionando como bloqueio (RN-CAIXA-001).
insert into public.role_permissions (role_id, permission_id)
select 'c9c9c9c9-0000-0000-0000-00000000000a', id from public.permissions
 where code in ('orders.view','orders.accept','orders.create_manual','catalog.view',
                'payments.register','finance.reverse','orders.cancel',
                'cash.open','cash.close','cash.view');
insert into public.user_roles (app_user_id, role_id)
values ('b9b9b9b9-0000-0000-0000-000000000001','c9c9c9c9-0000-0000-0000-00000000000a');

-- CAIXA: NÃO SE APAGA MAIS.
--
-- Desde a validação da Etapa 7 existem pagamentos REAIS no DEV apontando para
-- a sessão aberta, e `payments_cash_session_id_fkey` recusa o delete. Mas o
-- problema de fundo não é a constraint: apagar caixa aqui seria destruir
-- evidência financeira para fazer um teste passar — a mesma tentação que
-- `rls_fase3` e a suíte da Etapa 3 já ensinaram a recusar. A suíte passa a
-- REUTILIZAR a sessão que encontrar, e a medir DELTA em vez de valor absoluto.
delete from public.store_settings;
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code, latitude, longitude,
  automatic_delivery_radius_km, delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values ('c9c9c9c9-0000-0000-0000-0000000000f1','Shalon E7','5500000000000','Rua T','1','Centro',
          'Cidade','XX','00000-000', -20.0, -40.0, 10.0, 40, 60, 20, 30, true, 'America/Sao_Paulo');
delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;
delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 10, 5.00, true, 1);
insert into public.categories (id, name, slug, sort_order)
values ('d9d9d9d9-0000-0000-0000-00000000000c','Cat E7','cat-e7',1);
insert into public.products (id, category_id, product_type, name, slug, base_price,
                             sort_order, is_active, is_temporarily_available)
values ('d9d9d9d9-0000-0000-0000-000000000001','d9d9d9d9-0000-0000-0000-00000000000c',
        'drink','Refri E7','refri-e7',10.00,1,true,true);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
select set_config('teste.pix',      (select id::text from public.payment_methods where code='pix_maquininha'), true);
select set_config('teste.credito',  (select id::text from public.payment_methods where code='credito'), true);

/** Venda de balcão de N unidades a R$ 10,00 — total = N * 10. */
create or replace function pg_temp.venda(p_idem text, p_qtd integer default 1)
returns uuid language plpgsql as $h$
declare v jsonb;
begin
  v := public.criar_pedido(jsonb_build_object(
    'idempotency_key', p_idem,
    'tracking_token', md5(p_idem) || md5(p_idem || ':2'),
    'origem','counter','modalidade','pickup',
    'cliente', '{}'::jsonb,
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id','d9d9d9d9-0000-0000-0000-000000000001','quantidade', p_qtd)),
    'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))
  ), '');
  if not (v ->> 'ok')::boolean then
    raise exception 'fixture de venda falhou: %', v ->> 'erro';
  end if;
  return (v ->> 'pedido_id')::uuid;
end; $h$;

/** Recebimento, com as linhas que o teste quiser. */
create or replace function pg_temp.receber(
  p_pedido uuid, p_linhas jsonb, p_idem text default null)
returns jsonb language sql as $h$
  select public.registrar_pagamento(p_pedido, jsonb_build_object(
    'linhas', p_linhas,
    'idempotency_key', coalesce(p_idem, gen_random_uuid()::text)));
$h$;

create or replace function pg_temp.linha_dinheiro(p_valor numeric, p_recebido numeric default null,
                                                  p_na_gaveta boolean default true)
returns jsonb language sql as $h$
  select jsonb_build_object('forma_id', current_setting('teste.dinheiro', true),
    'valor', p_valor, 'recebido', p_recebido, 'na_gaveta', p_na_gaveta);
$h$;
create or replace function pg_temp.linha_pix(p_valor numeric)
returns jsonb language sql as $h$
  select jsonb_build_object('forma_id', current_setting('teste.pix', true), 'valor', p_valor);
$h$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-7777-1111-1111-111111111111","role":"authenticated"}';

select set_config('teste.sessao',
  coalesce((select id::text from public.cash_sessions where status = 'open'), ''), true);
select case when current_setting('teste.sessao') = ''
            then (public.abrir_caixa('{"fundo":100.00}'::jsonb) ->> 'ok')
            else 'ja estava aberto' end as caixa;
select set_config('teste.sessao',
  coalesce((select id::text from public.cash_sessions where status = 'open'), ''), true);
select pg_temp.checar('fixture: ha caixa aberto', 'true',
  (current_setting('teste.sessao') <> '')::text);

-- =============================================================================
-- BLOCO A — DINHEIRO E TROCO (§1.6)
-- =============================================================================
select set_config('teste.p1', pg_temp.venda('88000001-0000-0000-0000-000000000001', 3)::text, true);
select pg_temp.checar('A0 fixture: pedido de 30,00 pendente', 'pending',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'payment_status'));
select set_config('teste.esperado_antes',
  public.esperado_em_caixa(current_setting('teste.sessao')::uuid)::text, true);

select set_config('teste.a', pg_temp.receber(current_setting('teste.p1')::uuid,
  jsonb_build_array(pg_temp.linha_dinheiro(30.00, 50.00)))::text, true);

select pg_temp.checar('A1 recebimento em dinheiro aceito', 'true',
  (current_setting('teste.a')::jsonb ->> 'ok'));
select pg_temp.checar('A2 e o financeiro virou confirmed', 'confirmed',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'payment_status'));
-- O TROCO É DO SERVIDOR: 50 entregues - 30 devidos = 20. A tela pode mostrar
-- a conta enquanto digitam, mas o valor gravado é este.
select pg_temp.checar('A3 o troco foi CALCULADO pelo servidor', '20.00',
  (current_setting('teste.a')::jsonb -> 'linhas' -> 0 ->> 'troco'));
select pg_temp.checar('A4 com o entregue preservado', '50.00',
  pg_temp.pagamento(current_setting('teste.p1')::uuid, 'tendered_amount'));
select pg_temp.checar('A5 e o valor devido, nao o entregue, como pagamento', '30.00',
  pg_temp.pagamento(current_setting('teste.p1')::uuid, 'amount'));
select pg_temp.checar('A6 gerou UM movimento de gaveta', '1',
  pg_temp.movimentos(current_setting('teste.p1')::uuid)::text);
-- Entra na gaveta o DEVIDO, não o entregue: o troco sai de volta na hora.
select pg_temp.checar('A7 e o movimento e do valor devido', '30.00',
  pg_temp.movimentado(current_setting('teste.p1')::uuid)::text);
select pg_temp.checar('A8 o esperado em caixa subiu exatamente 30,00',
  (current_setting('teste.esperado_antes')::numeric + 30.00)::text,
  public.esperado_em_caixa(current_setting('teste.sessao')::uuid)::text);
select pg_temp.checar('A9 e o pedido SAIU da fila de a receber', 'false',
  pg_temp.na_fila(current_setting('teste.p1')::uuid)::text);
select pg_temp.checar('A10 dinheiro entregue MENOR que o devido e recusado', 'false',
  (pg_temp.receber(pg_temp.venda('88000002-0000-0000-0000-000000000002'),
    jsonb_build_array(pg_temp.linha_dinheiro(10.00, 5.00))) ->> 'ok'));
select pg_temp.checar('A11 sem informar o entregue, nao ha troco', 'NULO',
  coalesce((pg_temp.receber(pg_temp.venda('88000003-0000-0000-0000-000000000003'),
    jsonb_build_array(pg_temp.linha_dinheiro(10.00))) -> 'linhas' -> 0 ->> 'troco'), 'NULO'));

-- =============================================================================
-- BLOCO B — PIX E O QUE NÃO É PAPEL NA GAVETA (RN-CAIXA-014)
-- =============================================================================
select set_config('teste.p4', pg_temp.venda('88000004-0000-0000-0000-000000000004', 2)::text, true);
select set_config('teste.esperado_b',
  public.esperado_em_caixa(current_setting('teste.sessao')::uuid)::text, true);
select set_config('teste.b', pg_temp.receber(current_setting('teste.p4')::uuid,
  jsonb_build_array(pg_temp.linha_pix(20.00)))::text, true);

select pg_temp.checar('B1 recebimento em Pix aceito', 'true',
  (current_setting('teste.b')::jsonb ->> 'ok'));
select pg_temp.checar('B2 e o pedido esta pago', 'confirmed',
  pg_temp.campo(current_setting('teste.p4')::uuid, 'payment_status'));
-- O CENTRO DO BLOCO: Pix é recebimento, não papel na caixa.
select pg_temp.checar('B3 Pix NAO entra na gaveta', 'false',
  (current_setting('teste.b')::jsonb -> 'linhas' -> 0 ->> 'na_gaveta'));
select pg_temp.checar('B4 e NAO gerou movimento fisico', '0',
  pg_temp.movimentos(current_setting('teste.p4')::uuid)::text);
select pg_temp.checar('B5 o dinheiro esperado na gaveta NAO mudou',
  current_setting('teste.esperado_b'),
  public.esperado_em_caixa(current_setting('teste.sessao')::uuid)::text);
-- Mas continua vinculado à sessão, senão o fechamento por método mentiria.
select pg_temp.checar('B6 mas o pagamento aponta para a sessao do caixa', 'true',
  (pg_temp.pagamento(current_setting('teste.p4')::uuid, 'cash_session_id') is not null)::text);
-- Dinheiro que o operador diz que NÃO entrou agora também não vira gaveta.
select set_config('teste.p5', pg_temp.venda('88000005-0000-0000-0000-000000000005')::text, true);
select pg_temp.checar('B7 dinheiro fora da gaveta e aceito', 'true',
  (pg_temp.receber(current_setting('teste.p5')::uuid,
    jsonb_build_array(pg_temp.linha_dinheiro(10.00, null, false))) ->> 'ok'));
-- RN-CAIXA-014: dinheiro que nao entrou agora nao pode contar como papel na
-- gaveta -- e marcar que entrou quando nao entrou e como se fecha um caixa
-- com numero falso.
select pg_temp.checar('B8 e NAO gera movimento fisico', '0',
  pg_temp.movimentos(current_setting('teste.p5')::uuid)::text);
select pg_temp.checar('B9 mas o pagamento existe e o pedido esta pago', 'confirmed',
  pg_temp.campo(current_setting('teste.p5')::uuid, 'payment_status'));

-- =============================================================================
-- BLOCO C — DIVISÃO (§1.7): a soma fecha EXATAMENTE, ou não passa
-- =============================================================================
select set_config('teste.p6', pg_temp.venda('88000006-0000-0000-0000-000000000006', 5)::text, true);
select set_config('teste.c', pg_temp.receber(current_setting('teste.p6')::uuid,
  jsonb_build_array(pg_temp.linha_dinheiro(30.00, 30.00), pg_temp.linha_pix(20.00)))::text, true);

select pg_temp.checar('C1 divisao dinheiro + Pix aceita', 'true',
  (current_setting('teste.c')::jsonb ->> 'ok'));
select pg_temp.checar('C2 com duas linhas gravadas', '2',
  pg_temp.linhas_gravadas(current_setting('teste.p6')::uuid)::text);
select pg_temp.checar('C3 somando o total do pedido', '50.00',
  (current_setting('teste.c')::jsonb ->> 'total'));
-- Só a parte em dinheiro vira papel.
select pg_temp.checar('C4 so a parte em DINHEIRO entrou na gaveta', '30.00',
  pg_temp.movimentado(current_setting('teste.p6')::uuid)::text);
select pg_temp.checar('C5 num unico movimento', '1',
  pg_temp.movimentos(current_setting('teste.p6')::uuid)::text);

select set_config('teste.p7', pg_temp.venda('88000007-0000-0000-0000-000000000007', 5)::text, true);
select set_config('teste.c6', pg_temp.receber(current_setting('teste.p7')::uuid,
  jsonb_build_array(pg_temp.linha_dinheiro(30.00), pg_temp.linha_pix(10.00)))::text, true);
select pg_temp.checar('C6 soma MENOR que o total e recusada', 'true',
  (current_setting('teste.c6')::jsonb ->> 'soma_divergente'));
select pg_temp.checar('C7 e o servidor diz os dois numeros', '40.00/50.00',
  (current_setting('teste.c6')::jsonb ->> 'somado') || '/' ||
  (current_setting('teste.c6')::jsonb ->> 'total'));
select pg_temp.checar('C8 soma MAIOR tambem e recusada: nao ha "sobra"', 'true',
  (pg_temp.receber(current_setting('teste.p7')::uuid,
    jsonb_build_array(pg_temp.linha_dinheiro(60.00, 60.00))) ->> 'soma_divergente'));
-- A RECUSA NÃO DEIXA RASTRO: o pedido continua exatamente como estava.
select pg_temp.checar('C9 nenhuma linha foi gravada na recusa', '0',
  pg_temp.linhas_gravadas(current_setting('teste.p7')::uuid)::text);
select pg_temp.checar('C10 o pedido continua PENDENTE', 'pending',
  pg_temp.campo(current_setting('teste.p7')::uuid, 'payment_status'));
select pg_temp.checar('C11 e continua na fila de a receber', 'true',
  pg_temp.na_fila(current_setting('teste.p7')::uuid)::text);
select pg_temp.checar('C12 a MESMA forma duas vezes e recusada', 'false',
  (pg_temp.receber(current_setting('teste.p7')::uuid,
    jsonb_build_array(pg_temp.linha_dinheiro(25.00), pg_temp.linha_dinheiro(25.00))) ->> 'ok'));

-- =============================================================================
-- BLOCO D — O QUE O SERVIDOR RECUSA
-- =============================================================================
select pg_temp.checar('D1 pedido ja pago recusa segundo recebimento', 'true',
  (pg_temp.receber(current_setting('teste.p1')::uuid,
    jsonb_build_array(pg_temp.linha_dinheiro(30.00))) ->> 'ja_pago'));
select pg_temp.checar('D2 e continua com UM pagamento so', '1',
  pg_temp.pagos(current_setting('teste.p1')::uuid)::text);

select set_config('teste.p8', pg_temp.venda('88000008-0000-0000-0000-000000000008')::text, true);
select pg_temp.checar('D3 fixture: cancela o pedido', 'true',
  (public.comando_pedido(current_setting('teste.p8')::uuid, 'cancelar',
    '{"motivo":"cliente desistiu"}'::jsonb) ->> 'ok'));
select pg_temp.checar('D4 pedido CANCELADO nao recebe', 'false',
  (pg_temp.receber(current_setting('teste.p8')::uuid,
    jsonb_build_array(pg_temp.linha_dinheiro(10.00))) ->> 'ok'));
select pg_temp.checar('D5 e nao gravou pagamento', '0',
  pg_temp.pagos(current_setting('teste.p8')::uuid)::text);

-- Bandeira: o DEV nao tem NENHUMA cadastrada, e essa e a razao de o cartao
-- nao funcionar hoje. O teste afirma a REGRA, sem fabricar cadastro.
select pg_temp.checar('D6 forma que exige bandeira, sem bandeira, e recusada', 'false',
  (pg_temp.receber(pg_temp.venda('88000009-0000-0000-0000-000000000009'),
    jsonb_build_array(jsonb_build_object(
      'forma_id', current_setting('teste.credito', true), 'valor', 10.00))) ->> 'ok'));
select pg_temp.checar('D7 troco em forma que nao e dinheiro e recusado', 'false',
  (pg_temp.receber(pg_temp.venda('8800000a-0000-0000-0000-00000000000a'),
    jsonb_build_array(jsonb_build_object(
      'forma_id', current_setting('teste.pix', true),
      'valor', 10.00, 'recebido', 20.00))) ->> 'ok'));
select pg_temp.checar('D8 sem nenhuma linha e recusado', 'false',
  (pg_temp.receber(pg_temp.venda('8800000b-0000-0000-0000-00000000000b'),
    '[]'::jsonb) ->> 'ok'));

-- =============================================================================
-- BLOCO E — CONCORRÊNCIA: DOIS CLIQUES, DUAS ABAS (§9)
-- =============================================================================
select set_config('teste.p9', pg_temp.venda('8800000c-0000-0000-0000-00000000000c')::text, true);
select set_config('teste.chave', gen_random_uuid()::text, true);

select set_config('teste.e1', pg_temp.receber(current_setting('teste.p9')::uuid,
  jsonb_build_array(pg_temp.linha_dinheiro(10.00)), current_setting('teste.chave'))::text, true);
select pg_temp.checar('E1 o primeiro envio paga', 'true',
  (current_setting('teste.e1')::jsonb ->> 'ok'));
select pg_temp.checar('E2 e diz que nao existia antes', 'false',
  (current_setting('teste.e1')::jsonb ->> 'ja_existia'));

-- DUPLO CLIQUE: mesma tentativa, mesma chave.
select set_config('teste.e3', pg_temp.receber(current_setting('teste.p9')::uuid,
  jsonb_build_array(pg_temp.linha_dinheiro(10.00)), current_setting('teste.chave'))::text, true);
select pg_temp.checar('E3 o segundo clique NAO e erro', 'true',
  (current_setting('teste.e3')::jsonb ->> 'ok'));
select pg_temp.checar('E4 e sim repeticao reconhecida', 'true',
  (current_setting('teste.e3')::jsonb ->> 'ja_existia'));
select pg_temp.checar('E5 continua havendo UM pagamento', '1',
  pg_temp.pagos(current_setting('teste.p9')::uuid)::text);
select pg_temp.checar('E6 e UM movimento de gaveta', '1',
  pg_temp.movimentos(current_setting('teste.p9')::uuid)::text);

-- DUAS ABAS: tentativas diferentes, mesmo pedido. A segunda encontra pago.
select pg_temp.checar('E7 outro terminal, com OUTRA chave, encontra pago', 'true',
  (pg_temp.receber(current_setting('teste.p9')::uuid,
    jsonb_build_array(pg_temp.linha_dinheiro(10.00))) ->> 'ja_pago'));
select pg_temp.checar('E8 e nao duplicou nada', '1',
  pg_temp.pagos(current_setting('teste.p9')::uuid)::text);

-- FILA VELHA: a tela tinha o pedido aberto, alguem cancelou no meio.
select set_config('teste.p10', pg_temp.venda('8800000d-0000-0000-0000-00000000000d')::text, true);
select pg_temp.checar('E9 fixture: cancelado enquanto a tela estava aberta', 'true',
  (public.comando_pedido(current_setting('teste.p10')::uuid, 'cancelar',
    '{"motivo":"desistiu no balcao"}'::jsonb) ->> 'ok'));
select pg_temp.checar('E10 confirmar com a tela velha e recusado', 'false',
  (pg_temp.receber(current_setting('teste.p10')::uuid,
    jsonb_build_array(pg_temp.linha_dinheiro(10.00))) ->> 'ok'));
select pg_temp.checar('E11 sem nenhum pagamento fantasma', '0',
  pg_temp.pagos(current_setting('teste.p10')::uuid)::text);

-- =============================================================================
-- BLOCO F — ESTORNADO VOLTA A SER RECEBÍVEL (D-2026-09-26-79)
-- =============================================================================
select set_config('teste.p11', pg_temp.venda('8800000e-0000-0000-0000-00000000000e')::text, true);
select pg_temp.checar('F1 paga', 'true',
  (pg_temp.receber(current_setting('teste.p11')::uuid,
    jsonb_build_array(pg_temp.linha_dinheiro(10.00))) ->> 'ok'));
select pg_temp.checar('F2 fixture: producao iniciada', 'true',
  (public.comando_pedido(current_setting('teste.p11')::uuid,'iniciar_producao','{}'::jsonb) ->> 'ok'));
select pg_temp.checar('F3 estorna SEM cancelar', 'true',
  (public.reverter_pagamento(current_setting('teste.p11')::uuid,
     'maquininha recusou depois') ->> 'ok'));
select pg_temp.checar('F4 o pedido segue VIVO', 'in_production',
  pg_temp.campo(current_setting('teste.p11')::uuid, 'status'));
select pg_temp.checar('F5 e sem pagamento confirmado', '0',
  pg_temp.pagos(current_setting('teste.p11')::uuid)::text);
select pg_temp.checar('F6 voltou para a fila', 'true',
  pg_temp.na_fila(current_setting('teste.p11')::uuid)::text);
-- E O QUE IMPORTA: pode ser recebido DE NOVO.
select pg_temp.checar('F7 e pode ser recebido outra vez', 'true',
  (pg_temp.receber(current_setting('teste.p11')::uuid,
    jsonb_build_array(pg_temp.linha_pix(10.00))) ->> 'ok'));
select pg_temp.checar('F8 ficando pago de novo', 'confirmed',
  pg_temp.campo(current_setting('teste.p11')::uuid, 'payment_status'));
select pg_temp.checar('F9 e saindo da fila', 'false',
  pg_temp.na_fila(current_setting('teste.p11')::uuid)::text);

-- =============================================================================
-- BLOCO G — PAGAR NÃO MEXE NA PRODUÇÃO (§1.1, item 3)
-- =============================================================================
select set_config('teste.p12', pg_temp.venda('8800000f-0000-0000-0000-00000000000f')::text, true);
select set_config('teste.status_antes',
  pg_temp.campo(current_setting('teste.p12')::uuid, 'status'), true);
select pg_temp.checar('G1 paga', 'true',
  (pg_temp.receber(current_setting('teste.p12')::uuid,
    jsonb_build_array(pg_temp.linha_dinheiro(10.00))) ->> 'ok'));
select pg_temp.checar('G2 o status operacional NAO mudou',
  current_setting('teste.status_antes'),
  pg_temp.campo(current_setting('teste.p12')::uuid, 'status'));
select pg_temp.checar('G3 nao foi concluido automaticamente', 'false',
  (pg_temp.campo(current_setting('teste.p12')::uuid, 'status') = 'completed')::text);
select pg_temp.checar('G4 a funcao NAO escreve em orders.status', '0',
  (select count(*)::text from pg_proc
    where proname = 'registrar_pagamento' and pronamespace = 'public'::regnamespace
      and prosrc ilike '%set status =%'));
select pg_temp.checar('G5 ela so muda o payment_status', '1',
  (select count(*)::text from pg_proc
    where proname = 'registrar_pagamento' and pronamespace = 'public'::regnamespace
      and prosrc like '%set payment_status = ''confirmed''%'));

-- =============================================================================
-- BLOCO H — CAIXA FECHADO (§1.8, RN-CAIXA-001/003)
-- =============================================================================
select set_config('teste.p13', pg_temp.venda('88000010-0000-0000-0000-000000000010')::text, true);
select pg_temp.checar('H1 fixture: fecha o caixa', 'true',
  (public.fechar_caixa(jsonb_build_object('contado',
     public.esperado_em_caixa(current_setting('teste.sessao')::uuid))) ->> 'ok'));
select pg_temp.checar('H2 nao ha caixa aberto', '0',
  (select count(*)::text from public.cash_sessions where status='open'));

select set_config('teste.h', pg_temp.receber(current_setting('teste.p13')::uuid,
  jsonb_build_array(pg_temp.linha_dinheiro(10.00)))::text, true);
select pg_temp.checar('H3 o recebimento e RECUSADO pelo servidor', 'false',
  (current_setting('teste.h')::jsonb ->> 'ok'));
select pg_temp.checar('H4 com o motivo nomeado, para a tela poder explicar', 'true',
  (current_setting('teste.h')::jsonb ->> 'sem_caixa'));
select pg_temp.checar('H5 e o pedido continua pendente e integro', 'pending',
  pg_temp.campo(current_setting('teste.p13')::uuid, 'payment_status'));
select pg_temp.checar('H6 na fila de a receber', 'true',
  pg_temp.na_fila(current_setting('teste.p13')::uuid)::text);
-- MONTAR a venda continua funcionando com o caixa fechado: é só o RECEBIMENTO
-- que a regra bloqueia (§1.8).
select pg_temp.checar('H7 mas CRIAR venda continua funcionando', 'true',
  (pg_temp.venda('88000011-0000-0000-0000-000000000011') is not null)::text);
select pg_temp.checar('H8 e a exceção depende de permissao propria, nao de fallback', 'true',
  (select prosrc like '%cash.bypass_session%' from pg_proc
    where proname='registrar_pagamento' and pronamespace='public'::regnamespace)::text);
select pg_temp.checar('H9 este papel NAO tem a permissao de excecao', 'false',
  public.has_permission('cash.bypass_session')::text);

-- =============================================================================
-- BLOCO I — QUEM RECEBE NÃO NECESSARIAMENTE LÊ O FINANCEIRO
--
-- Assimetria REAL, descoberta ao escrever esta suíte: `payments_select` exige
-- `finance.view`, e `pagamento_do_pedido` é SECURITY INVOKER. Um operador de
-- balcão com `payments.register` REGISTRA o pagamento e NÃO enxerga a tabela.
--
-- Isso não afrouxa nada — o servidor continua recusando o que tem de recusar —
-- mas explica por que o histórico "Recebido de fato" pode aparecer vazio para
-- esse operador, e por que a fila do PDV (que é DEFINER) continua correta.
-- =============================================================================
select pg_temp.checar('I1 o papel registra pagamento', 'true',
  public.has_permission('payments.register')::text);
select pg_temp.checar('I2 mas NAO enxerga a tabela de pagamentos', 'false',
  public.has_permission('finance.view')::text);
select pg_temp.checar('I3 por isso a leitura direta devolve vazio', '0',
  (select count(*)::text from public.payments
    where order_id = current_setting('teste.p1')::uuid));
select pg_temp.checar('I4 embora o pagamento exista de verdade', '1',
  pg_temp.pagos(current_setting('teste.p1')::uuid)::text);
select pg_temp.checar('I5 pagamento_do_pedido e INVOKER, e e por isso', 'false',
  (select prosecdef::text from pg_proc
    where proname='pagamento_do_pedido' and pronamespace='public'::regnamespace));
-- O que IMPORTA: a fila do PDV nao depende disso, porque e DEFINER com
-- checagem propria. O operador continua vendo o que tem de cobrar.
select pg_temp.checar('I6 mas a fila do PDV continua correta', 'false',
  pg_temp.na_fila(current_setting('teste.p1')::uuid)::text);
select pg_temp.checar('I7 e mostra o que ainda ha para receber', 'true',
  pg_temp.na_fila(current_setting('teste.p13')::uuid)::text);

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
