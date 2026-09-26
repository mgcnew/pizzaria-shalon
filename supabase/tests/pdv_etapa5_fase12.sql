-- =============================================================================
-- PEDIDOS A RECEBER — FASE 12, ETAPA 5
--
-- 09-PDV-FRENTE-DE-CAIXA.md §0.2, §0.3, §1.3, §4.2, §6.1
-- Decisões D-2026-09-26-79 (critério `reversed`) e D-2026-09-26-80 (origem)
--
-- AS PERGUNTAS QUE ESTE ARQUIVO RESPONDE:
--
-- 1. o status operacional gateia o recebimento? (bloco C — não gateia)
-- 2. um pedido estornado e vivo aparece, e segue pagável? (bloco B — o cenário
--    pedido explicitamente na aprovação da Etapa 5)
-- 3. pago, cancelado e rejeitado saem da fila? (bloco A)
-- 4. a consulta escreve alguma coisa, ou depende de caixa aberto? (bloco F)
--
-- NENHUMA CONTAGEM ABSOLUTA DA FILA. O DEV tem pedidos reais, e dois deles
-- entram no critério — uma asserção do tipo "a fila tem 3" quebraria no dia em
-- que a Shalon recebesse um pedido, exatamente como já quebrou em `rls_fase3` e
-- na suíte da Etapa 3. Aqui todo cenário pergunta "ESTE pedido está na fila?"
-- ou compara delta.
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

-- "ESTE pedido está na fila?" — a pergunta independente do ambiente.
create or replace function pg_temp.na_fila(p_pedido uuid)
returns boolean language plpgsql as $h$
declare v boolean;
begin
  execute 'select exists (select 1 from public.pedidos_a_receber() where id = $1)'
    into v using p_pedido;
  return v;
exception when others then return null;
end; $h$;

create or replace function pg_temp.fila_qtd()
returns integer language plpgsql as $h$
declare n integer;
begin
  execute 'select count(*) from public.pedidos_a_receber()' into n;
  return n;
exception when others then return -1;
end; $h$;

-- Um campo da linha daquele pedido na fila.
create or replace function pg_temp.campo(p_pedido uuid, p_campo text)
returns text language plpgsql as $h$
declare v text;
begin
  execute format('select (%I)::text from public.pedidos_a_receber() where id = $1', p_campo)
    into v using p_pedido;
  return v;
end; $h$;

-- Impressão digital dos pedidos, para provar que a consulta não escreve.
create or replace function pg_temp.fp_pedidos()
returns text language sql security definer as $h$
  select md5(string_agg(
    id::text || '|' || status || '|' || payment_status || '|' || total::text || '|'
      || order_number::text || '|' || updated_at::text,
    E'\n' order by id)) from public.orders;
$h$;

create or replace function pg_temp.forcar(p_pedido uuid, p_status text)
returns void language plpgsql security definer as $h$
begin
  update public.orders set status = p_status,
    rejection_reason = case when p_status = 'rejected' then 'fixture' else rejection_reason end
   where id = p_pedido;
  if not found then raise exception 'fixture nao aplicada: % nao encontrado', p_pedido; end if;
end; $h$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('99999999-eeee-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','recebe5@teste.local','x',now(),now(),now()),
  ('99999999-eeee-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','soolha5@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a6a6a6a6-0000-0000-0000-000000000001','Recebe E5','owner',false,'active'),
  ('a6a6a6a6-0000-0000-0000-000000000002','So olha E5','counter',false,'active');

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b6b6b6b6-0000-0000-0000-000000000001','99999999-eeee-1111-1111-111111111111','a6a6a6a6-0000-0000-0000-000000000001',true),
  ('b6b6b6b6-0000-0000-0000-000000000002','99999999-eeee-2222-2222-222222222222','a6a6a6a6-0000-0000-0000-000000000002',true);

-- Dois papéis: um que RECEBE e um que só olha pedidos. É o segundo que prova a
-- exigência de `payments.register`.
insert into public.roles (id, name, description, is_system, is_active) values
  ('c6c6c6c6-0000-0000-0000-00000000000a','Recebe E5','recebe e estorna',false,true),
  ('c6c6c6c6-0000-0000-0000-00000000000b','So olha E5','ve pedidos, nao recebe',false,true);

insert into public.role_permissions (role_id, permission_id)
select 'c6c6c6c6-0000-0000-0000-00000000000a', id from public.permissions
 -- `orders.accept` entra porque os FIXTURES precisam mover a producao
 -- (`iniciar_producao` e `marcar_pronto` exigem essa permissao). Nao tem
 -- relacao com a fila: a fila exige `payments.register`, e o bloco D prova isso
 -- com um papel que tem `orders.view` e mais nada.
 --
 -- `cash.view` tambem e permissao de FIXTURE, e pela mesma razao. Sem ela o
 -- bloco F nao consegue nem fechar o caixa nem verificar que ele esta fechado:
 -- `esperado_em_caixa` e SECURITY INVOKER (0105) e le `cash_sessions` sob o RLS
 -- de quem chama, cujo `select` exige `cash.view`. Sem a permissao ela devolvia
 -- NULL, `fechar_caixa` respondia "informe o valor contado", e o `count(*)` de
 -- sessoes abertas dava zero porque o RLS filtrava TODAS as linhas -- ou seja,
 -- F3 passava medindo o RLS, nao o fechamento. A fila, por ser DEFINER com
 -- checagem explicita de `payments.register`, nao depende de nada disso.
 where code in ('orders.view','orders.accept','orders.create_manual',
                'payments.register','finance.reverse','cash.open','cash.close',
                'cash.view','orders.cancel');
insert into public.role_permissions (role_id, permission_id)
select 'c6c6c6c6-0000-0000-0000-00000000000b', id from public.permissions
 where code in ('orders.view');

insert into public.user_roles (app_user_id, role_id) values
  ('b6b6b6b6-0000-0000-0000-000000000001','c6c6c6c6-0000-0000-0000-00000000000a'),
  ('b6b6b6b6-0000-0000-0000-000000000002','c6c6c6c6-0000-0000-0000-00000000000b');

-- Ambiente de loja próprio, como as demais suítes fazem.
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
) values ('c6c6c6c6-0000-0000-0000-0000000000f1','Shalon E5','5500000000000','Rua T','1','Centro',
          'Cidade','XX','00000-000', -20.0, -40.0, 10.0, 40, 60, 20, 30, true, 'America/Sao_Paulo');
delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;
delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 10, 5.00, true, 1);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order)
values ('e6e6e6e6-0000-0000-0000-00000000000f','G E5',8,2,1);
insert into public.categories (id, name, slug, sort_order)
values ('d6d6d6d6-0000-0000-0000-00000000000c','Cat E5','cat-e5',1);
insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active)
values ('d6d6d6d6-0000-0000-0000-000000000001','d6d6d6d6-0000-0000-0000-00000000000c',
        'pizza','Pizza E5','pizza-e5',1,true);
insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available)
values ('f6f6f6f6-0000-0000-0000-000000000001','d6d6d6d6-0000-0000-0000-000000000001',
        'e6e6e6e6-0000-0000-0000-00000000000f', 40.00, true, true);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);

-- Helpers de pedido ------------------------------------------------------------
create or replace function pg_temp.pedido(p_idem text, p_troco numeric default null)
returns uuid language plpgsql as $h$
declare v jsonb;
begin
  v := public.criar_pedido(jsonb_build_object(
    'idempotency_key', p_idem,
    'tracking_token', md5(p_idem) || md5(p_idem || ':2'),
    'origem', 'counter',
    'modalidade', 'pickup',
    'cliente', jsonb_build_object('nome','Cliente E5','whatsapp','(11) 96000-0001'),
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id','d6d6d6d6-0000-0000-0000-000000000001',
      'variacao_id','f6f6f6f6-0000-0000-0000-000000000001','quantidade',1)),
    'pagamento', case when p_troco is null
      then jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))
      -- `precisa_troco` E `troco_para`: a primeira liga a regra, a segunda
      -- informa o valor. Só o valor não liga nada (RN-PGTO-005).
      else jsonb_build_object('forma_id', current_setting('teste.dinheiro', true),
                              'precisa_troco', true,
                              'troco_para', p_troco) end
  ), '');
  return (v ->> 'pedido_id')::uuid;
end; $h$;

create or replace function pg_temp.pagar(p_pedido uuid)
returns jsonb language sql as $h$
  select public.registrar_pagamento(p_pedido, jsonb_build_object(
    'linhas', jsonb_build_array(jsonb_build_object(
      'forma_id', current_setting('teste.dinheiro', true),
      'valor', (select o.total from public.orders o where o.id = p_pedido))),
    'idempotency_key', gen_random_uuid()::text));
$h$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-eeee-1111-1111-111111111111","role":"authenticated"}';

-- FIXTURE AFIRMADO, e não apenas executado. Um `select` solto aqui pode
-- devolver `ok: false` em silêncio, e foi exatamente isso que fez o bloco F
-- medir "não há caixa aberto" acreditando ter fechado um caixa que nunca abriu.
-- Fixture que pode falhar calado é defeito da suíte, não do código.
-- Reutiliza a sessão aberta, se houver; só abre uma quando não houver.
select set_config('teste.sessao',
  coalesce((select id::text from public.cash_sessions where status = 'open'), ''), true);
select case when current_setting('teste.sessao') = ''
            then (public.abrir_caixa('{"fundo":300.00}'::jsonb) ->> 'ok')
            else 'ja estava aberto' end as caixa;
select set_config('teste.sessao',
  coalesce((select id::text from public.cash_sessions where status = 'open'), ''), true);
select pg_temp.checar('fixture: ha caixa aberto', 'true',
  (current_setting('teste.sessao') <> '')::text);

-- Os pedidos de cada cenário.
select set_config('teste.p1', pg_temp.pedido('66000001-0000-0000-0000-000000000001')::text, true);
select set_config('teste.p2', pg_temp.pedido('66000002-0000-0000-0000-000000000002')::text, true);
select set_config('teste.p3', pg_temp.pedido('66000003-0000-0000-0000-000000000003')::text, true);
select set_config('teste.p4', pg_temp.pedido('66000004-0000-0000-0000-000000000004')::text, true);
select set_config('teste.p5', pg_temp.pedido('66000005-0000-0000-0000-000000000005')::text, true);
select set_config('teste.p6', pg_temp.pedido('66000006-0000-0000-0000-000000000006')::text, true);
select set_config('teste.p7', pg_temp.pedido('66000007-0000-0000-0000-000000000007')::text, true);
select set_config('teste.p8', pg_temp.pedido('66000008-0000-0000-0000-000000000008', 100.00)::text, true);

-- P2 em produção, P3 pronto: status operacional diferente, financeiro igual.
--
-- TODO FIXTURE AQUI É AFIRMADO. `comando_pedido` e `registrar_pagamento`
-- devolvem `ok: false` em vez de levantar exceção, então um `select` solto
-- deixaria o cenário seguinte medir um estado que nunca foi alcançado -- e o
-- teste passaria ou falharia falando de outra coisa. Foi assim que a falta de
-- `orders.accept` no papel apareceu como "C5 esperava in_production".
select pg_temp.checar('fixture: producao do P2 iniciada', 'true',
  (public.comando_pedido(current_setting('teste.p2')::uuid, 'iniciar_producao', '{}'::jsonb) ->> 'ok'));
select pg_temp.checar('fixture: producao do P3 iniciada', 'true',
  (public.comando_pedido(current_setting('teste.p3')::uuid, 'iniciar_producao', '{}'::jsonb) ->> 'ok'));
select pg_temp.checar('fixture: P3 marcado pronto', 'true',
  (public.comando_pedido(current_setting('teste.p3')::uuid, 'marcar_pronto', '{}'::jsonb) ->> 'ok'));

-- P4 pago.
select pg_temp.checar('fixture: P4 pago', 'true',
  (pg_temp.pagar(current_setting('teste.p4')::uuid) ->> 'ok'));
-- P5 cancelado.
select pg_temp.checar('fixture: P5 cancelado', 'true',
  (public.comando_pedido(current_setting('teste.p5')::uuid, 'cancelar',
     '{"motivo":"cliente desistiu"}'::jsonb) ->> 'ok'));
reset role;
-- P6 rejeitado por fixture: pedido de balcão nasce aceito, então `rejeitar` não
-- se aplica a ele — o que interessa aqui é o ESTADO, não como se chega nele.
select pg_temp.forcar(current_setting('teste.p6')::uuid, 'rejected');

-- =============================================================================
-- BLOCO A — O CRITÉRIO: QUEM ENTRA E QUEM SAI
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-eeee-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('A1 pedido NAO pago aparece', 'true',
  pg_temp.na_fila(current_setting('teste.p1')::uuid)::text);
select pg_temp.checar('A2 e com status financeiro pending', 'pending',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'status_financeiro'));
select pg_temp.checar('A3 pedido PAGO nao aparece', 'false',
  pg_temp.na_fila(current_setting('teste.p4')::uuid)::text);
select pg_temp.checar('A4 e de fato esta pago', 'confirmed',
  (select payment_status from public.orders where id = current_setting('teste.p4')::uuid));
select pg_temp.checar('A5 pedido CANCELADO nao aparece', 'false',
  pg_temp.na_fila(current_setting('teste.p5')::uuid)::text);
select pg_temp.checar('A6 mesmo estando com payment_status pending', 'cancelled/pending',
  (select status || '/' || payment_status from public.orders
    where id = current_setting('teste.p5')::uuid));
select pg_temp.checar('A7 pedido REJEITADO nao aparece', 'false',
  pg_temp.na_fila(current_setting('teste.p6')::uuid)::text);
select pg_temp.checar('A8 mesmo estando com payment_status pending', 'rejected/pending',
  (select status || '/' || payment_status from public.orders
    where id = current_setting('teste.p6')::uuid));

-- =============================================================================
-- BLOCO B — O PEDIDO ESTORNADO E VIVO
--
-- O cenário exigido na aprovação da Etapa 5, percorrido inteiro:
-- pago → estornado → operacionalmente vivo → aparece com `reversed` → e SEGUE
-- elegível para `registrar_pagamento`.
-- =============================================================================
select pg_temp.checar('B1 antes de tudo, o pedido esta na fila como pending', 'pending',
  pg_temp.campo(current_setting('teste.p7')::uuid, 'status_financeiro'));

select pg_temp.checar('B2 paga', 'true', (pg_temp.pagar(current_setting('teste.p7')::uuid) ->> 'ok'));
select pg_temp.checar('B3 e sai da fila, porque esta pago', 'false',
  pg_temp.na_fila(current_setting('teste.p7')::uuid)::text);

-- Avança a produção: o pedido fica VIVO e adiantado. Afirmado, porque o cenário
-- inteiro do estorno depende de o pedido REALMENTE estar em produção.
select pg_temp.checar('B3b fixture: producao do P7 iniciada', 'true',
  (public.comando_pedido(current_setting('teste.p7')::uuid, 'iniciar_producao', '{}'::jsonb) ->> 'ok'));

select pg_temp.checar('B4 estorna SEM cancelar', 'true',
  (public.reverter_pagamento(current_setting('teste.p7')::uuid,
     'cliente desistiu do pagamento, pedido segue') ->> 'ok'));

select pg_temp.checar('B5 o pedido continua VIVO', 'in_production',
  (select status from public.orders where id = current_setting('teste.p7')::uuid));
select pg_temp.checar('B6 e o financeiro virou reversed', 'reversed',
  (select payment_status from public.orders where id = current_setting('teste.p7')::uuid));
select pg_temp.checar('B7 nao ha pagamento confirmado: o cliente deve', '0',
  (select count(*)::text from public.payments
    where order_id = current_setting('teste.p7')::uuid and status = 'confirmed'));

-- O CORAÇÃO DA DECISÃO D-2026-09-26-79.
select pg_temp.checar('B8 ELE VOLTA para a fila', 'true',
  pg_temp.na_fila(current_setting('teste.p7')::uuid)::text);
select pg_temp.checar('B9 e aparece como ESTORNADO, nao como pendente', 'reversed',
  pg_temp.campo(current_setting('teste.p7')::uuid, 'status_financeiro'));
select pg_temp.checar('B10 com o status operacional preservado', 'in_production',
  pg_temp.campo(current_setting('teste.p7')::uuid, 'status_operacional'));

-- E a razão de ele estar na fila: o banco aceita receber.
select pg_temp.checar('B11 e SEGUE elegivel para registrar_pagamento', 'true',
  (pg_temp.pagar(current_setting('teste.p7')::uuid) ->> 'ok'));
select pg_temp.checar('B12 depois de pago de novo, sai da fila', 'false',
  pg_temp.na_fila(current_setting('teste.p7')::uuid)::text);
select pg_temp.checar('B13 e o financeiro voltou a confirmed', 'confirmed',
  (select payment_status from public.orders where id = current_setting('teste.p7')::uuid));

-- =============================================================================
-- BLOCO C — OS DOIS EIXOS SÃO INDEPENDENTES
--
-- §4.2: `aceito`, `em produção` e `pronto` convivem na mesma lista. O status
-- operacional NÃO gateia o recebimento.
-- =============================================================================
select pg_temp.checar('C1 pedido ACEITO e nao pago aparece', 'true',
  pg_temp.na_fila(current_setting('teste.p1')::uuid)::text);
select pg_temp.checar('C2 EM PRODUCAO e nao pago aparece', 'true',
  pg_temp.na_fila(current_setting('teste.p2')::uuid)::text);
select pg_temp.checar('C3 PRONTO e nao pago aparece', 'true',
  pg_temp.na_fila(current_setting('teste.p3')::uuid)::text);
select pg_temp.checar('C4 e cada um mantem o proprio status operacional', 'confirmed',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'status_operacional'));
select pg_temp.checar('C5 o segundo em producao', 'in_production',
  pg_temp.campo(current_setting('teste.p2')::uuid, 'status_operacional'));
select pg_temp.checar('C6 e o terceiro pronto', 'ready_for_pickup',
  pg_temp.campo(current_setting('teste.p3')::uuid, 'status_operacional'));
-- Os tres com financeiro IGUAL: e o financeiro que decide a fila.
select pg_temp.checar('C7 os tres com o mesmo status financeiro', 'pending/pending/pending',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'status_financeiro') || '/' ||
  pg_temp.campo(current_setting('teste.p2')::uuid, 'status_financeiro') || '/' ||
  pg_temp.campo(current_setting('teste.p3')::uuid, 'status_financeiro'));
-- E o inverso: pagar NAO mexeu na producao (RN-CAIXA-018).
select pg_temp.checar('C8 pagar nao avancou a producao do P4', 'confirmed',
  (select status from public.orders where id = current_setting('teste.p4')::uuid));

-- =============================================================================
-- BLOCO D — PERMISSÕES
-- =============================================================================
reset role;
select pg_temp.checar('D1 anon sem execute', 'false',
  has_function_privilege('anon','public.pedidos_a_receber()','execute')::text);
select pg_temp.checar('D2 PUBLIC sem execute', 'false',
  has_function_privilege('public','public.pedidos_a_receber()','execute')::text);
select pg_temp.checar('D3 authenticated com execute', 'true',
  has_function_privilege('authenticated','public.pedidos_a_receber()','execute')::text);
select pg_temp.checar('D4 exige payments.register no corpo', 'true',
  (select (prosrc like '%has_permission%payments.register%') from pg_proc
    where proname='pedidos_a_receber' and pronamespace='public'::regnamespace)::text);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('D5 anon nem executa', '-1', pg_temp.fila_qtd()::text);
reset role;

-- Quem só olha pedidos NAO ve a fila de recebimento: cobrar e outra permissao.
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-eeee-2222-2222-222222222222","role":"authenticated"}';
select pg_temp.checar('D6 sem payments.register a fila vem vazia', '0', pg_temp.fila_qtd()::text);
select pg_temp.checar('D7 e o pedido pendente nao aparece para ele', 'false',
  pg_temp.na_fila(current_setting('teste.p1')::uuid)::text);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-eeee-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('D8 com payments.register ele aparece', 'true',
  pg_temp.na_fila(current_setting('teste.p1')::uuid)::text);

-- =============================================================================
-- BLOCO E — OS CAMPOS QUE O OPERADOR PRECISA
-- =============================================================================
select pg_temp.checar('E1 numero do pedido', 'true',
  (pg_temp.campo(current_setting('teste.p1')::uuid, 'numero')::bigint > 0)::text);
-- §0.3: origem e modalidade SEPARADAS. `counter` e origem Balcao; a modalidade
-- continua sendo pickup. Nao existe modalidade `balcao`.
select pg_temp.checar('E2 origem e counter (Balcao)', 'counter',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'origem'));
select pg_temp.checar('E3 modalidade e pickup (Retirada)', 'pickup',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'modalidade'));
select pg_temp.checar('E4 e as duas sao colunas diferentes', 'true',
  (pg_temp.campo(current_setting('teste.p1')::uuid, 'origem')
   <> pg_temp.campo(current_setting('teste.p1')::uuid, 'modalidade'))::text);
select pg_temp.checar('E5 nome do cliente, do snapshot', 'Cliente E5',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'cliente_nome'));
select pg_temp.checar('E6 total', '40.00',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'total'));
select pg_temp.checar('E7 idade em minutos, calculada no banco', 'true',
  (pg_temp.campo(current_setting('teste.p1')::uuid, 'idade_minutos')::integer >= 0)::text);
select pg_temp.checar('E8 forma esperada, da intencao', 'Dinheiro',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'forma_esperada'));
select pg_temp.checar('E9 valor esperado', '40.00',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'valor_esperado'));
-- Sem troco: as tres colunas de troco sao coerentes.
select pg_temp.checar('E10 sem troco, precisa_troco false', 'false',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'precisa_troco'));
select pg_temp.checar('E11 e troco_para nulo', 'NULO',
  coalesce(pg_temp.campo(current_setting('teste.p1')::uuid, 'troco_para'), 'NULO'));
-- Com troco (P8, "levo R$ 100").
select pg_temp.checar('E12 com troco, precisa_troco true', 'true',
  pg_temp.campo(current_setting('teste.p8')::uuid, 'precisa_troco'));
select pg_temp.checar('E13 troco para 100', '100.00',
  pg_temp.campo(current_setting('teste.p8')::uuid, 'troco_para'));
select pg_temp.checar('E14 e o troco esperado e CALCULADO', '60.00',
  pg_temp.campo(current_setting('teste.p8')::uuid, 'troco_esperado'));
select pg_temp.checar('E15 criado_em presente', 'true',
  (pg_temp.campo(current_setting('teste.p1')::uuid, 'criado_em') is not null)::text);

-- =============================================================================
-- BLOCO F — A CONSULTA NÃO ESCREVE, E NÃO DEPENDE DE GAVETA
-- =============================================================================
select set_config('teste.fp', pg_temp.fp_pedidos(), true);
select pg_temp.fila_qtd();
select pg_temp.na_fila(current_setting('teste.p1')::uuid);
select pg_temp.campo(current_setting('teste.p2')::uuid, 'status_operacional');
select pg_temp.checar('F1 consultar a fila NAO alterou pedido nenhum',
  current_setting('teste.fp'), pg_temp.fp_pedidos());

-- §4.4 e decisão 7 de D-2026-09-25-78: o PDV existe com o caixa fechado, e
-- consultar pendentes não é operação de caixa.
select pg_temp.checar('F2 fixture: fecha o caixa', 'true',
  (public.fechar_caixa(jsonb_build_object('contado',
     public.esperado_em_caixa(current_setting('teste.sessao')::uuid))) ->> 'ok'));
select pg_temp.checar('F3 nao ha caixa aberto', '0',
  (select count(*)::text from public.cash_sessions where status='open'));
select pg_temp.checar('F4 e a fila continua respondendo', 'true',
  pg_temp.na_fila(current_setting('teste.p1')::uuid)::text);
select pg_temp.checar('F5 com os mesmos campos', 'pending',
  pg_temp.campo(current_setting('teste.p1')::uuid, 'status_financeiro'));
select pg_temp.checar('F6 e sem ter alterado nada', current_setting('teste.fp'),
  pg_temp.fp_pedidos());

-- A funcao e STABLE: declaracao, nao intencao.
select pg_temp.checar('F7 declarada STABLE', 's',
  (select provolatile::text from pg_proc
    where proname='pedidos_a_receber' and pronamespace='public'::regnamespace));
select pg_temp.checar('F8 search_path fixado', 'true',
  (select (proconfig::text like '%search_path=%') from pg_proc
    where proname='pedidos_a_receber' and pronamespace='public'::regnamespace)::text);
-- Nenhuma tabela nova de fila foi criada.
select pg_temp.checar('F9 nenhuma tabela de fila foi criada', '0',
  (select count(*)::text from pg_tables
    where schemaname='public' and (tablename ilike '%fila%' or tablename ilike '%a_receber%'
      or tablename ilike '%queue%')));
-- E nenhuma modalidade nova.
select pg_temp.checar('F10 a modalidade continua aceitando SO delivery e pickup',
  'CHECK ((fulfillment_type = ANY (ARRAY[''delivery''::text, ''pickup''::text])))',
  (select pg_get_constraintdef(oid) from pg_constraint where conname='orders_modalidade'));

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
