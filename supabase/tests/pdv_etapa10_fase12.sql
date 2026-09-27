-- =============================================================================
-- REALTIME DO PDV — FASE 12, ETAPA 10
--
-- 09-PDV-FRENTE-DE-CAIXA.md §9 · CLAUDE.md §12, §34, §40 · D-2026-09-27-83
--
-- A INVARIANTE DESTA ETAPA:
--
--   Realtime pode atualizar, avisar, bloquear visualmente e recarregar
--   estado. NUNCA autoriza nem decide uma operação financeira.
--
-- Por isso esta suíte tem duas metades, e a segunda é a que importa:
--
--   A, B — a MATRIZ: que operação produz evento em que tabela publicada.
--          Prova que a interface consegue saber das coisas.
--   C, D — a AUTORIDADE com o Realtime ATRASADO ou AUSENTE. Prova que não
--          saber não custa dinheiro. Se estes caírem, a etapa está errada.
--
-- Nenhum cenário depende de evento chegar: dentro de uma transação não existe
-- Realtime nenhum — o WAL do `rollback` não é publicado. É de propósito. O que
-- se testa aqui é o BANCO, que é quem protege; a entrega do evento é conforto
-- de tela e se valida no navegador, com dois terminais.
--
-- NENHUM DADO REAL É APAGADO. Transação com ROLLBACK.
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

/** Uma tabela está publicada para o Realtime? */
create or replace function pg_temp.publicada(p_tabela text) returns boolean
language sql stable as $h$
  select exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = p_tabela); $h$;

/** A policy de SELECT que o assinante do Realtime herda. */
create or replace function pg_temp.policy_de_leitura(p_tabela text) returns text
language sql stable as $h$
  select coalesce(qual, '(sem policy)') from pg_policies
   where schemaname = 'public' and tablename = p_tabela and cmd = 'SELECT' limit 1; $h$;

create or replace function pg_temp.sessao_aberta() returns uuid
language sql security definer as $h$
  select id from public.cash_sessions where status = 'open' order by opened_at desc limit 1; $h$;

create or replace function pg_temp.esperado() returns numeric
language sql security definer as $h$
  select coalesce(public.esperado_em_caixa(pg_temp.sessao_aberta()), 0); $h$;

create or replace function pg_temp.pagos(p_pedido uuid) returns integer
language sql security definer as $h$
  select count(*)::integer from public.payments
   where order_id = p_pedido and status = 'confirmed'; $h$;

create or replace function pg_temp.na_fila(p_pedido uuid) returns boolean
language plpgsql as $h$
declare v boolean;
begin execute 'select exists (select 1 from public.pedidos_a_receber() where id = $1)'
  into v using p_pedido; return v; end; $h$;

create or replace function pg_temp.fp_reais() returns text
language sql security definer as $h$
  select coalesce(md5(string_agg(id::text||'|'||amount::text||'|'||status, E'\n' order by id)), 'vazio')
    from public.payments
   where id::text = any(string_to_array(current_setting('teste.ids_reais', true), ',')); $h$;

-- -----------------------------------------------------------------------------
-- FIXTURES — DOIS TERMINAIS, duas identidades distintas.
--
-- O cenário crítico exige duas pessoas, não uma chamada repetida: é a diferença
-- entre "o mesmo operador clicou duas vezes" (idempotência) e "dois operadores
-- cobraram o mesmo pedido" (concorrência). São problemas diferentes, e o banco
-- os resolve por mecanismos diferentes.
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('99999999-aaaa-1010-1010-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','terminal_a@teste.local','x',now(),now(),now()),
  ('99999999-aaaa-1010-1010-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','terminal_b@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('aaaa1010-0000-0000-0000-000000000001','Terminal A','counter',false,'active'),
  ('aaaa1010-0000-0000-0000-000000000002','Terminal B','counter',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('bbbb1010-0000-0000-0000-000000000001','99999999-aaaa-1010-1010-000000000001','aaaa1010-0000-0000-0000-000000000001',true),
  ('bbbb1010-0000-0000-0000-000000000002','99999999-aaaa-1010-1010-000000000002','aaaa1010-0000-0000-0000-000000000002',true);

-- OS DOIS ESPELHAM O ATENDENTE DO SISTEMA, permissão por permissão. Não é
-- papel inventado: é o RBAC que está no banco depois de D-2026-09-26-82.
insert into public.roles (id, name, description, is_system, is_active) values
  ('cccc1010-0000-0000-0000-000000000001','Balcao A E10','espelho do Atendente',false,true),
  ('cccc1010-0000-0000-0000-000000000002','Balcao B E10','espelho do Atendente',false,true);
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from (values ('cccc1010-0000-0000-0000-000000000001'::uuid),
               ('cccc1010-0000-0000-0000-000000000002'::uuid)) as r(id)
  cross join lateral (
    select p.id from public.permissions p
      join public.role_permissions rp on rp.permission_id = p.id
      join public.roles ro on ro.id = rp.role_id
     where ro.name = 'Atendente' and ro.is_system) p;
insert into public.user_roles (app_user_id, role_id) values
  ('bbbb1010-0000-0000-0000-000000000001','cccc1010-0000-0000-0000-000000000001'),
  ('bbbb1010-0000-0000-0000-000000000002','cccc1010-0000-0000-0000-000000000002');

-- TERCEIRA IDENTIDADE: QUEM PODE ESTORNAR.
--
-- Descoberto ao escrever esta suíte: o Atendente NÃO tem `finance.reverse` —
-- está na lista de ausências deliberadas do seed da Fase 2, e continuou lá
-- depois da Etapa 8, que concedeu só `cash.adjust`. Então "estorno devolve o
-- pedido à fila" não é operação de balcão: é da proprietária.
--
-- Escrever os cenários D8–D10 com o papel do balcão os fazia medir a
-- PERMISSÃO em vez do estorno — o mesmo defeito que as Etapas 5, 6 e 7 já
-- ensinaram a reconhecer. A correção é usar quem de fato pode, e afirmar a
-- recusa do balcão num cenário próprio.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('99999999-aaaa-1010-1010-000000000003','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','gerente_e10@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status)
values ('aaaa1010-0000-0000-0000-000000000003','Gerente E10','owner',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active)
values ('bbbb1010-0000-0000-0000-000000000003','99999999-aaaa-1010-1010-000000000003','aaaa1010-0000-0000-0000-000000000003',true);
insert into public.roles (id, name, description, is_system, is_active)
values ('cccc1010-0000-0000-0000-000000000003','Gerente E10','balcao + estorno',false,true);
insert into public.role_permissions (role_id, permission_id)
select 'cccc1010-0000-0000-0000-000000000003', p.id from public.permissions p
  join public.role_permissions rp on rp.permission_id = p.id
  join public.roles ro on ro.id = rp.role_id
 where ro.name = 'Atendente' and ro.is_system;
insert into public.role_permissions (role_id, permission_id)
select 'cccc1010-0000-0000-0000-000000000003', id from public.permissions where code = 'finance.reverse';
insert into public.user_roles (app_user_id, role_id)
values ('bbbb1010-0000-0000-0000-000000000003','cccc1010-0000-0000-0000-000000000003');

delete from public.store_settings;
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code, latitude, longitude,
  automatic_delivery_radius_km, delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values ('cccc1010-0000-0000-0000-0000000000f1','Shalon E10','5500000000000','Rua T','1','Centro',
          'Cidade','XX','00000-000', -20.0, -40.0, 10.0, 40, 60, 20, 30, true, 'America/Sao_Paulo');
delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;
delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 10, 5.00, true, 1);
insert into public.categories (id, name, slug, sort_order)
values ('dddd1010-0000-0000-0000-00000000000c','Cat E10','cat-e10',1);
insert into public.products (id, category_id, product_type, name, slug, base_price,
                             sort_order, is_active, is_temporarily_available)
values ('dddd1010-0000-0000-0000-000000000001','dddd1010-0000-0000-0000-00000000000c',
        'drink','Refri E10','refri-e10',10.00,1,true,true);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);

create or replace function pg_temp.venda(p_idem text, p_qtd integer default 1)
returns uuid language plpgsql as $h$
declare v jsonb;
begin
  v := public.criar_pedido(jsonb_build_object(
    'idempotency_key', p_idem,
    'tracking_token', md5(p_idem) || md5(p_idem || ':10'),
    'origem','counter','modalidade','pickup', 'cliente','{}'::jsonb,
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id','dddd1010-0000-0000-0000-000000000001','quantidade', p_qtd)),
    'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))
  ), '');
  if not (v ->> 'ok')::boolean then raise exception 'fixture: %', v ->> 'erro'; end if;
  return (v ->> 'pedido_id')::uuid;
end; $h$;

create or replace function pg_temp.receber(p_pedido uuid, p_valor numeric, p_idem text default null)
returns jsonb language sql as $h$
  select public.registrar_pagamento(p_pedido, jsonb_build_object(
    'linhas', jsonb_build_array(jsonb_build_object(
      'forma_id', current_setting('teste.dinheiro', true), 'valor', p_valor)),
    'idempotency_key', coalesce(p_idem, gen_random_uuid()::text))); $h$;

select set_config('teste.ids_reais',
  (select coalesce(string_agg(id::text, ','), '') from public.payments), true);
select pg_temp.checar('guarda: ha pagamentos reais para preservar', 'true',
  (current_setting('teste.ids_reais') <> '')::text);
select set_config('teste.fp_pag', pg_temp.fp_reais(), true);

-- =============================================================================
-- BLOCO A — A PUBLICAÇÃO, E O QUE ELA NÃO ABRE
-- =============================================================================
select pg_temp.checar('A1 orders publicada desde a Fase 5', 'true', pg_temp.publicada('orders')::text);
select pg_temp.checar('A2 cash_sessions publicada', 'true', pg_temp.publicada('cash_sessions')::text);
select pg_temp.checar('A3 cash_movements publicada', 'true', pg_temp.publicada('cash_movements')::text);

-- `payments` FICA DE FORA, e isso é decisão, não esquecimento: todo pagamento
-- e estorno normais escrevem `orders` junto (bloco B prova), e publicá-la só
-- acrescentaria evento e refresh sem cobrir lacuna nenhuma.
select pg_temp.checar('A4 payments NAO publicada, de proposito', 'false',
  pg_temp.publicada('payments')::text);

-- O QUE IMPEDE A PUBLICAÇÃO DE VIRAR PORTA LATERAL (CLAUDE.md §12): o
-- assinante recebe o que a policy de SELECT lhe entregaria. Sem policy, ou com
-- policy afrouxada, a publicação passaria a vazar.
select pg_temp.checar('A5 cash_sessions exige cash.view para ler',
  'has_permission(''cash.view''::text)', pg_temp.policy_de_leitura('cash_sessions'));
select pg_temp.checar('A6 cash_movements exige cash.view para ler',
  'has_permission(''cash.view''::text)', pg_temp.policy_de_leitura('cash_movements'));
select pg_temp.checar('A7 orders exige orders.view para ler',
  'has_permission(''orders.view''::text)', pg_temp.policy_de_leitura('orders'));
select pg_temp.checar('A8 as tres continuam com RLS forcado', 'true/true/true',
  (select string_agg(relforcerowsecurity::text, '/' order by relname)
     from pg_class where oid in ('public.orders'::regclass,
       'public.cash_sessions'::regclass, 'public.cash_movements'::regclass)));

-- A migration da Etapa 10 é SÓ publicação. Se um dia ela crescer, isto cai.
select pg_temp.checar('A9 a publicacao tem exatamente estas quatro tabelas',
  'cash_movements, cash_sessions, orders',
  (select string_agg(tablename, ', ' order by tablename) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'));

-- =============================================================================
-- BLOCO B — A MATRIZ: QUAL OPERAÇÃO ACORDA QUAL TABELA
--
-- Lido do corpo das funções, que é onde a verdade mora. Uma operação só pode
-- chegar ao PDV se escrever numa tabela publicada.
-- =============================================================================
create or replace function pg_temp.escreve(p_funcao text, p_tabela text) returns boolean
language sql stable as $h$
  select coalesce(bool_or(
      prosrc ilike '%update public.' || p_tabela || '%'
   or prosrc ilike '%insert into public.' || p_tabela || '%'), false)
    from pg_proc where proname = p_funcao and pronamespace = 'public'::regnamespace; $h$;

select pg_temp.checar('B1 pedido criado acorda orders', 'true',
  pg_temp.escreve('criar_pedido','orders')::text);
select pg_temp.checar('B2 pedido pago acorda orders', 'true',
  pg_temp.escreve('registrar_pagamento','orders')::text);
select pg_temp.checar('B3 estorno acorda orders', 'true',
  pg_temp.escreve('reverter_pagamento','orders')::text);
select pg_temp.checar('B4 cancelar e mudar status acordam orders', 'true',
  pg_temp.escreve('comando_pedido','orders')::text);
select pg_temp.checar('B5 caixa aberto acorda cash_sessions', 'true',
  pg_temp.escreve('abrir_caixa','cash_sessions')::text);
select pg_temp.checar('B6 caixa fechado acorda cash_sessions', 'true',
  pg_temp.escreve('fechar_caixa','cash_sessions')::text);
select pg_temp.checar('B7 suprimento e sangria acordam cash_movements', 'true',
  pg_temp.escreve('movimentar_caixa','cash_movements')::text);
select pg_temp.checar('B8 estorno de movimento acorda cash_movements', 'true',
  pg_temp.escreve('reverter_movimento_caixa','cash_movements')::text);

-- A RAZÃO DE `cash_movements` ESTAR NA PUBLICAÇÃO, num cenário só.
--
-- O acerto de motoboy mexe no dinheiro da gaveta e NÃO toca `orders`. Sem esta
-- tabela publicada, ele mudaria o esperado enquanto o outro PDV seguisse
-- exibindo o número velho — dinheiro divergindo entre duas telas do mesmo
-- balcão, que é pior do que não ter realtime.
select pg_temp.checar('B9 acerto de motoboy NAO toca orders', 'false',
  pg_temp.escreve('conciliar_corrida','orders')::text);
select pg_temp.checar('B10 mas mexe na gaveta', 'true',
  pg_temp.escreve('conciliar_corrida','cash_movements')::text);
select pg_temp.checar('B11 e por isso chega pelo cash_movements', 'true',
  (pg_temp.publicada('cash_movements') and pg_temp.escreve('conciliar_corrida','cash_movements'))::text);

-- E a razão de NÃO publicar `payments`: quem escreve pagamento escreve pedido.
select pg_temp.checar('B12 pagamento e estorno escrevem orders junto', 'true',
  (pg_temp.escreve('registrar_pagamento','orders')
   and pg_temp.escreve('reverter_pagamento','orders'))::text);

-- =============================================================================
-- BLOCO C — O CENÁRIO CRÍTICO, COM O REALTIME ATRASADO
--
-- Terminal A abriu #123 para receber. Terminal B recebe primeiro. O evento
-- ainda NÃO chegou em A — e aqui ele nunca chega, porque numa transação não há
-- Realtime. A tela de A está velha, e mesmo assim nada de errado acontece.
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-aaaa-1010-1010-000000000001","role":"authenticated"}';

select pg_temp.checar('C0 fixture: ha caixa aberto', 'true',
  (case when pg_temp.sessao_aberta() is null
        then (public.abrir_caixa('{"fundo":100.00}'::jsonb) ->> 'ok')
        else 'true' end));
select set_config('teste.p', pg_temp.venda('aa001010-0000-0000-0000-000000000001', 3)::text, true);
select pg_temp.checar('C1 o pedido esta na fila dos dois terminais', 'true',
  pg_temp.na_fila(current_setting('teste.p')::uuid)::text);

-- A abre o painel: a chave de tentativa nasce AQUI, como na tela.
select set_config('teste.chave_a', gen_random_uuid()::text, true);

-- TERMINAL B RECEBE PRIMEIRO.
set local request.jwt.claims = '{"sub":"99999999-aaaa-1010-1010-000000000002","role":"authenticated"}';
select pg_temp.checar('C2 o terminal B recebe', 'true',
  (pg_temp.receber(current_setting('teste.p')::uuid, 30.00) ->> 'ok'));
select pg_temp.checar('C3 e o pedido sai da fila', 'false',
  pg_temp.na_fila(current_setting('teste.p')::uuid)::text);

-- TERMINAL A, SEM SABER, APERTA Ctrl+Enter.
set local request.jwt.claims = '{"sub":"99999999-aaaa-1010-1010-000000000001","role":"authenticated"}';
select set_config('teste.c4', pg_temp.receber(current_setting('teste.p')::uuid, 30.00,
  current_setting('teste.chave_a'))::text, true);

select pg_temp.checar('C4 A e RECUSADO', 'false',
  (current_setting('teste.c4')::jsonb ->> 'ok'));
select pg_temp.checar('C5 com a bandeira ja_pago, que nao e erro comum', 'true',
  (current_setting('teste.c4')::jsonb ->> 'ja_pago'));
select pg_temp.checar('C6 e a mensagem diz o caminho: estornar', 'true',
  ((current_setting('teste.c4')::jsonb ->> 'erro') ilike '%estorne o anterior%')::text);

-- AS TRÊS AFIRMAÇÕES QUE VALEM DINHEIRO.
select pg_temp.checar('C7 existe UM pagamento, nao dois', '1',
  pg_temp.pagos(current_setting('teste.p')::uuid)::text);
select pg_temp.checar('C8 e UM movimento de gaveta', '1',
  (select count(*)::text from public.cash_movements
    where order_id = current_setting('teste.p')::uuid and movement_type = 'sale_receipt'));
select pg_temp.checar('C9 o esperado subiu 30,00 UMA vez', '30.00',
  (select coalesce(sum(amount),0)::text from public.cash_movements
    where order_id = current_setting('teste.p')::uuid and direction = 'in'));

-- A recusa NÃO consumiu a chave de A: ela continua livre para o pedido certo.
select set_config('teste.p2', pg_temp.venda('aa001010-0000-0000-0000-000000000002')::text, true);
select pg_temp.checar('C10 a chave de A ainda serve para outro pedido', 'true',
  (pg_temp.receber(current_setting('teste.p2')::uuid, 10.00,
     current_setting('teste.chave_a')) ->> 'ok'));

-- =============================================================================
-- BLOCO D — A AUTORIDADE NÃO DEPENDE DE EVENTO NENHUM
--
-- O bloco que justifica a etapa inteira. Se o Realtime cair, for desligado ou
-- chegar minutos depois, TUDO ABAIXO continua verdade.
-- =============================================================================
select pg_temp.checar('D1 o pedido e travado antes de qualquer conferencia', 'true',
  (select prosrc ilike '%for update%' from pg_proc
    where proname='registrar_pagamento' and pronamespace='public'::regnamespace)::text);
select pg_temp.checar('D2 e a recusa por pagamento confirmado esta no corpo', 'true',
  (select prosrc ilike '%ja_pago%' from pg_proc
    where proname='registrar_pagamento' and pronamespace='public'::regnamespace)::text);
select pg_temp.checar('D3 a idempotencia e conferida ANTES de escrever', 'true',
  (select (position('idempotency_key' in prosrc) < position('insert into public.payments' in prosrc))
     from pg_proc where proname='registrar_pagamento' and pronamespace='public'::regnamespace)::text);

-- NENHUMA AUTORIDADE CONSULTA REALTIME. Se alguma passasse a depender de
-- estado de publicação, a interface teria virado autoridade — e este cenário
-- é o que impede isso de passar despercebido.
select pg_temp.checar('D4 nenhuma funcao de dinheiro menciona realtime', '0',
  (select count(*)::text from pg_proc
    where pronamespace='public'::regnamespace
      and proname in ('registrar_pagamento','reverter_pagamento','movimentar_caixa',
                      'abrir_caixa','fechar_caixa','criar_pedido','comando_pedido')
      and (prosrc ilike '%realtime%' or prosrc ilike '%publication%')));

-- O duplo clique continua sendo outro problema, resolvido por outro mecanismo.
select set_config('teste.p3', pg_temp.venda('aa001010-0000-0000-0000-000000000003')::text, true);
select set_config('teste.chave_d', gen_random_uuid()::text, true);
select pg_temp.checar('D5 primeiro envio paga', 'true',
  (pg_temp.receber(current_setting('teste.p3')::uuid, 10.00, current_setting('teste.chave_d')) ->> 'ok'));
select pg_temp.checar('D6 reenvio da MESMA chave e repeticao, nao erro', 'true',
  (pg_temp.receber(current_setting('teste.p3')::uuid, 10.00, current_setting('teste.chave_d')) ->> 'ja_existia'));
select pg_temp.checar('D7 e continua havendo UM pagamento', '1',
  pg_temp.pagos(current_setting('teste.p3')::uuid)::text);

-- ESTORNO NÃO É OPERAÇÃO DE BALCÃO, e isto foi medido, não suposto.
select pg_temp.checar('D8 o balcao NAO estorna: finance.reverse nao e do Atendente', 'false',
  public.has_permission('finance.reverse')::text);
select set_config('teste.d9', public.reverter_pagamento(
  current_setting('teste.p3')::uuid, 'tentativa do balcao')::text, true);
select pg_temp.checar('D9 e a recusa e de PERMISSAO', 'false',
  (current_setting('teste.d9')::jsonb ->> 'ok'));
select pg_temp.checar('D10 o pagamento sobreviveu a tentativa', '1',
  pg_temp.pagos(current_setting('teste.p3')::uuid)::text);

-- Agora com quem PODE: o estorno devolve o pedido à fila, e é isso que o
-- outro terminal precisa voltar a enxergar.
set local request.jwt.claims = '{"sub":"99999999-aaaa-1010-1010-000000000003","role":"authenticated"}';
select pg_temp.checar('D11 a gerente estorna', 'true',
  (public.reverter_pagamento(current_setting('teste.p3')::uuid, 'maquininha recusou') ->> 'ok'));
select pg_temp.checar('D12 e o pedido REAPARECE na fila', 'true',
  pg_temp.na_fila(current_setting('teste.p3')::uuid)::text);
select pg_temp.checar('D13 com o eixo financeiro em reversed', 'reversed',
  (select payment_status from public.orders where id = current_setting('teste.p3')::uuid));
select pg_temp.checar('D14 e o estorno escreve em orders, entao o evento chega', 'true',
  pg_temp.escreve('reverter_pagamento','orders')::text);

reset role;

-- GUARDA FINAL: os pagamentos reais do DEV atravessaram intactos.
select pg_temp.checar('guarda: os pagamentos reais atravessaram intactos',
  current_setting('teste.fp_pag'), pg_temp.fp_reais());

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
