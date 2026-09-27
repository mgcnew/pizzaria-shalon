-- =============================================================================
-- CAIXA NO PDV — FASE 12, ETAPA 8
--
-- 09-PDV-FRENTE-DE-CAIXA.md §4.1, §4.3, §4.4 · RN-CAIXA-001..016 · PI-F12-01
--
-- O PDV passou a mostrar o MESMO `PainelDoCaixa` de `/admin/caixa`, chamando
-- as mesmas autoridades. Esta suíte prova que elas continuam sendo as donas
-- das regras. A única mudança estrutural da etapa é uma linha de RBAC
-- (`cash.adjust` para o Atendente), provada em `rbac_etapa8_fase12.sql`.
--
-- AS PERGUNTAS QUE ESTE ARQUIVO RESPONDE:
--
-- 1. abrir, suprir, sangrar e fechar seguem o contrato? (blocos A, B, C)
-- 2. sangria maior que a gaveta é recusada? (bloco B — é, e é o centro)
-- 3. o esperado reflete dinheiro e IGNORA Pix? (bloco C)
-- 4. caixa fechado bloqueia receber, e só isso? (bloco D)
-- 5. quem pode o quê? (bloco E — o Atendente depois de `cash.adjust`)
-- 6. PI-F12-01 continua latente, sem ter sido agravada? (bloco F)
--
-- NENHUM DADO REAL É APAGADO. A suíte reutiliza a sessão de caixa que houver e
-- mede DELTA — lição das Etapas 5/6/7, quando o `delete from cash_sessions`
-- passou a violar `payments_cash_session_id_fkey`.
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

create or replace function pg_temp.sessao_aberta() returns uuid
language sql security definer as $h$
  select id from public.cash_sessions where status = 'open' order by opened_at desc limit 1; $h$;

create or replace function pg_temp.esperado() returns numeric
language sql security definer as $h$
  select coalesce(public.esperado_em_caixa(pg_temp.sessao_aberta()), 0); $h$;

create or replace function pg_temp.abertas() returns integer
language sql security definer as $h$
  select count(*)::integer from public.cash_sessions where status = 'open'; $h$;

create or replace function pg_temp.movimentos(p_tipo text) returns integer
language sql security definer as $h$
  select count(*)::integer from public.cash_movements
   where cash_session_id = pg_temp.sessao_aberta() and movement_type = p_tipo; $h$;

/** Impressão digital SÓ dos pagamentos capturados no início da suíte. */
create or replace function pg_temp.fp_reais() returns text
language sql security definer as $h$
  select coalesce(md5(string_agg(id::text||'|'||amount::text||'|'||status, E'\n' order by id)), 'vazio')
    from public.payments
   where id::text = any(string_to_array(current_setting('teste.ids_reais', true), ',')); $h$;

-- -----------------------------------------------------------------------------
-- FIXTURES — dois papéis, e a diferença entre eles é o assunto do bloco E.
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('99999999-8888-1111-1111-111111111111','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','gerente8@teste.local','x',now(),now(),now()),
  ('99999999-8888-2222-2222-222222222222','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','balconista8@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('aaaa8888-0000-0000-0000-000000000001','Gerente E8','owner',false,'active'),
  ('aaaa8888-0000-0000-0000-000000000002','Balconista E8','counter',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('bbbb8888-0000-0000-0000-000000000001','99999999-8888-1111-1111-111111111111','aaaa8888-0000-0000-0000-000000000001',true),
  ('bbbb8888-0000-0000-0000-000000000002','99999999-8888-2222-2222-222222222222','aaaa8888-0000-0000-0000-000000000002',true);
insert into public.roles (id, name, description, is_system, is_active) values
  ('cccc8888-0000-0000-0000-00000000000a','Gerente E8','opera o caixa inteiro',false,true),
  ('cccc8888-0000-0000-0000-00000000000b','Balconista E8','espelha o Atendente do sistema',false,true);

-- O GERENTE tem tudo de caixa.
insert into public.role_permissions (role_id, permission_id)
select 'cccc8888-0000-0000-0000-00000000000a', id from public.permissions
 where code in ('orders.view','orders.accept','orders.create_manual','catalog.view',
                'payments.register','finance.view','finance.reverse',
                'cash.open','cash.close','cash.view','cash.adjust','cash.reopen');

-- O BALCONISTA copia EXATAMENTE as permissões do papel Atendente do sistema.
-- Não é escolha de teste: é o RBAC que está no banco, e é o que torna o bloco
-- E uma medição do sistema real, não de um papel inventado.
insert into public.role_permissions (role_id, permission_id)
select 'cccc8888-0000-0000-0000-00000000000b', p.id
  from public.permissions p
  join public.role_permissions rp on rp.permission_id = p.id
  join public.roles r on r.id = rp.role_id
 where r.name = 'Atendente' and r.is_system;

insert into public.user_roles (app_user_id, role_id) values
  ('bbbb8888-0000-0000-0000-000000000001','cccc8888-0000-0000-0000-00000000000a'),
  ('bbbb8888-0000-0000-0000-000000000002','cccc8888-0000-0000-0000-00000000000b');

delete from public.store_settings;
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code, latitude, longitude,
  automatic_delivery_radius_km, delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values ('cccc8888-0000-0000-0000-0000000000f1','Shalon E8','5500000000000','Rua T','1','Centro',
          'Cidade','XX','00000-000', -20.0, -40.0, 10.0, 40, 60, 20, 30, true, 'America/Sao_Paulo');
delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;
delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 10, 5.00, true, 1);
insert into public.categories (id, name, slug, sort_order)
values ('dddd8888-0000-0000-0000-00000000000c','Cat E8','cat-e8',1);
insert into public.products (id, category_id, product_type, name, slug, base_price,
                             sort_order, is_active, is_temporarily_available)
values ('dddd8888-0000-0000-0000-000000000001','dddd8888-0000-0000-0000-00000000000c',
        'drink','Refri E8','refri-e8',10.00,1,true,true);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
select set_config('teste.pix', (select id::text from public.payment_methods where code='pix_maquininha'), true);

create or replace function pg_temp.venda(p_idem text, p_qtd integer default 1)
returns uuid language plpgsql as $h$
declare v jsonb;
begin
  v := public.criar_pedido(jsonb_build_object(
    'idempotency_key', p_idem,
    'tracking_token', md5(p_idem) || md5(p_idem || ':8'),
    'origem','counter','modalidade','pickup', 'cliente','{}'::jsonb,
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id','dddd8888-0000-0000-0000-000000000001','quantidade', p_qtd)),
    'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))
  ), '');
  if not (v ->> 'ok')::boolean then raise exception 'fixture: %', v ->> 'erro'; end if;
  return (v ->> 'pedido_id')::uuid;
end; $h$;

create or replace function pg_temp.receber(p_pedido uuid, p_forma text, p_valor numeric)
returns jsonb language sql as $h$
  select public.registrar_pagamento(p_pedido, jsonb_build_object(
    'linhas', jsonb_build_array(jsonb_build_object(
      'forma_id', current_setting(p_forma, true), 'valor', p_valor)),
    'idempotency_key', gen_random_uuid()::text)); $h$;

-- A GUARDA MEDE OS PAGAMENTOS QUE JA EXISTIAM, nao a tabela inteira: esta
-- suite CRIA pagamentos, e um md5 do total mudaria por construcao. O que
-- precisa ser provado e outra coisa -- que os reais atravessam intactos.
select set_config('teste.ids_reais',
  (select coalesce(string_agg(id::text, ','), '') from public.payments), true);
select pg_temp.checar('guarda: ha pagamentos reais para preservar', 'true',
  (current_setting('teste.ids_reais') <> '')::text);
select set_config('teste.fp_pag', pg_temp.fp_reais(), true);

-- =============================================================================
-- BLOCO A — ABERTURA (RN-CAIXA-001/002)
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-8888-1111-1111-111111111111","role":"authenticated"}';

-- O DEV tem uma sessão real aberta. Fecha-se dentro da transação para poder
-- exercitar a ABERTURA; o rollback devolve tudo.
select pg_temp.checar('A0 fixture: fecha a sessao que estiver aberta', 'true',
  (case when pg_temp.abertas() > 0
        then (public.fechar_caixa(jsonb_build_object('contado', pg_temp.esperado())) ->> 'ok')
        else 'true' end));
select pg_temp.checar('A1 nao ha caixa aberto agora', '0', pg_temp.abertas()::text);

select set_config('teste.a', public.abrir_caixa('{"fundo":150.00}'::jsonb)::text, true);
select pg_temp.checar('A2 abrir caixa pelo PDV funciona', 'true',
  (current_setting('teste.a')::jsonb ->> 'ok'));
select pg_temp.checar('A3 e passa a haver UMA sessao aberta', '1', pg_temp.abertas()::text);
-- O fundo VIRA o esperado inicial, e vira por um movimento, nao por um campo
-- solto: e assim que o fechamento consegue explicar de onde veio cada real.
select pg_temp.checar('A4 o esperado comeca no fundo', '150.00', pg_temp.esperado()::text);
-- O FUNDO NAO E UM MOVIMENTO. `esperado_em_caixa` soma
-- `opening_amount + entradas - saidas`, e o fundo e a COLUNA da sessao. Eu
-- tinha escrito este cenario esperando um movimento `opening`; o banco me
-- corrigiu, e o cenario passa a registrar onde o fundo realmente mora.
select pg_temp.checar('A5 o fundo mora na coluna da sessao, nao num movimento', '150.00',
  (select opening_amount::text from public.cash_sessions where id = pg_temp.sessao_aberta()));
select pg_temp.checar('A6 e a abertura nao gera movimento nenhum', '0',
  (select count(*)::text from public.cash_movements
    where cash_session_id = pg_temp.sessao_aberta()));
-- RN-CAIXA-006: uma sessao ativa por vez. Duas pessoas abrindo ao mesmo tempo
-- no balcao e o caso real, nao o hipotetico.
select pg_temp.checar('A7 SEGUNDA abertura concorrente e recusada', 'false',
  (public.abrir_caixa('{"fundo":50.00}'::jsonb) ->> 'ok'));
select pg_temp.checar('A8 e continua havendo UMA sessao', '1', pg_temp.abertas()::text);
select pg_temp.checar('A9 sem ter mexido no esperado', '150.00', pg_temp.esperado()::text);
-- RN-CAIXA-002: fundo zero e legitimo.
select set_config('teste.sessao', pg_temp.sessao_aberta()::text, true);

-- =============================================================================
-- BLOCO B — SUPRIMENTO E SANGRIA (RN-CAIXA-008/009)
-- =============================================================================
select pg_temp.checar('B1 suprimento (reforco) e aceito', 'true',
  (public.movimentar_caixa(jsonb_build_object('tipo','supply','valor',100.00,
     'motivo','troco para o movimento da noite',
     'idempotency_key', gen_random_uuid()::text)) ->> 'ok'));
select pg_temp.checar('B2 e o esperado sobe exatamente 100,00', '250.00', pg_temp.esperado()::text);
select pg_temp.checar('B3 com movimento proprio registrado', '1', pg_temp.movimentos('supply')::text);

select pg_temp.checar('B4 sangria dentro do saldo e aceita', 'true',
  (public.movimentar_caixa(jsonb_build_object('tipo','withdrawal','valor',80.00,
     'motivo','deposito no banco',
     'idempotency_key', gen_random_uuid()::text)) ->> 'ok'));
select pg_temp.checar('B5 e o esperado cai exatamente 80,00', '170.00', pg_temp.esperado()::text);
select pg_temp.checar('B6 com movimento de sangria', '1', pg_temp.movimentos('withdrawal')::text);

-- O CENTRO DO BLOCO: saldo negativo e impossibilidade FISICA, nao saldo.
select set_config('teste.b7', public.movimentar_caixa(jsonb_build_object(
  'tipo','withdrawal','valor', 170.01, 'motivo','tentativa de tirar mais do que ha',
  'idempotency_key', gen_random_uuid()::text))::text, true);
select pg_temp.checar('B7 sangria MAIOR que o esperado e recusada', 'false',
  (current_setting('teste.b7')::jsonb ->> 'ok'));
select pg_temp.checar('B8 com a razao dita ao operador', 'true',
  ((current_setting('teste.b7')::jsonb ->> 'erro') ilike '%maior que o dinheiro%')::text);
select pg_temp.checar('B9 e o esperado NAO mudou', '170.00', pg_temp.esperado()::text);
select pg_temp.checar('B10 nenhuma segunda sangria foi gravada', '1',
  pg_temp.movimentos('withdrawal')::text);
-- Tirar exatamente tudo e legitimo: zera, nao fica negativo.
select pg_temp.checar('B11 sangria do valor EXATO e aceita', 'true',
  (public.movimentar_caixa(jsonb_build_object('tipo','withdrawal','valor',170.00,
     'motivo','fecha a gaveta para conferencia',
     'idempotency_key', gen_random_uuid()::text)) ->> 'ok'));
select pg_temp.checar('B12 e o esperado fica em zero, nao negativo', '0.00', pg_temp.esperado()::text);
select pg_temp.checar('B13 repor com suprimento volta a funcionar', 'true',
  (public.movimentar_caixa(jsonb_build_object('tipo','supply','valor',200.00,
     'motivo','volta o fundo',
     'idempotency_key', gen_random_uuid()::text)) ->> 'ok'));
select pg_temp.checar('B14 esperado de volta em 200,00', '200.00', pg_temp.esperado()::text);

-- Idempotencia: o duplo clique no balcao nao vira dois reforcos.
select set_config('teste.chave', gen_random_uuid()::text, true);
select pg_temp.checar('B15 primeiro envio do suprimento', 'true',
  (public.movimentar_caixa(jsonb_build_object('tipo','supply','valor',10.00,
     'motivo','duplo clique', 'idempotency_key', current_setting('teste.chave'))) ->> 'ok'));
select pg_temp.checar('B16 reenvio da MESMA tentativa nao e erro', 'true',
  (public.movimentar_caixa(jsonb_build_object('tipo','supply','valor',10.00,
     'motivo','duplo clique', 'idempotency_key', current_setting('teste.chave'))) ->> 'ok'));
select pg_temp.checar('B17 e o esperado subiu UMA vez so', '210.00', pg_temp.esperado()::text);

-- =============================================================================
-- BLOCO C — O ESPERADO É DINHEIRO FÍSICO, E SÓ (RN-CAIXA-014)
-- =============================================================================
select set_config('teste.p1', pg_temp.venda('99000001-0000-0000-0000-000000000001', 3)::text, true);
select set_config('teste.antes_c', pg_temp.esperado()::text, true);
select pg_temp.checar('C1 recebe 30,00 em DINHEIRO', 'true',
  (pg_temp.receber(current_setting('teste.p1')::uuid, 'teste.dinheiro', 30.00) ->> 'ok'));
select pg_temp.checar('C2 e o esperado sobe exatamente 30,00',
  (current_setting('teste.antes_c')::numeric + 30.00)::text, pg_temp.esperado()::text);

select set_config('teste.p2', pg_temp.venda('99000002-0000-0000-0000-000000000002', 2)::text, true);
select set_config('teste.antes_c2', pg_temp.esperado()::text, true);
select pg_temp.checar('C3 recebe 20,00 em PIX', 'true',
  (pg_temp.receber(current_setting('teste.p2')::uuid, 'teste.pix', 20.00) ->> 'ok'));
select pg_temp.checar('C4 e o esperado NAO muda: Pix nao e papel na gaveta',
  current_setting('teste.antes_c2'), pg_temp.esperado()::text);
select pg_temp.checar('C5 o Pix nao gerou movimento de venda', '1',
  pg_temp.movimentos('sale_receipt')::text);

-- =============================================================================
-- BLOCO D — CAIXA FECHADO (§4.4, RN-CAIXA-001)
-- =============================================================================
select set_config('teste.p3', pg_temp.venda('99000003-0000-0000-0000-000000000003')::text, true);
select set_config('teste.esperado_fim', pg_temp.esperado()::text, true);
select pg_temp.checar('D1 fecha o caixa com o contado igual ao esperado', 'true',
  (public.fechar_caixa(jsonb_build_object('contado', pg_temp.esperado())) ->> 'ok'));
select pg_temp.checar('D2 nao ha mais caixa aberto', '0', pg_temp.abertas()::text);
-- §4.4: o PDV continua funcionando; so o RECEBIMENTO para.
select pg_temp.checar('D3 CRIAR venda continua funcionando', 'true',
  (pg_temp.venda('99000004-0000-0000-0000-000000000004') is not null)::text);
select set_config('teste.d4', pg_temp.receber(current_setting('teste.p3')::uuid,
  'teste.dinheiro', 10.00)::text, true);
select pg_temp.checar('D4 mas RECEBER e recusado', 'false',
  (current_setting('teste.d4')::jsonb ->> 'ok'));
select pg_temp.checar('D5 com a bandeira que a tela usa para explicar', 'true',
  (current_setting('teste.d4')::jsonb ->> 'sem_caixa'));
select pg_temp.checar('D6 e o pedido continua pendente', 'pending',
  (select payment_status from public.orders where id = current_setting('teste.p3')::uuid));

-- =============================================================================
-- BLOCO E — PERMISSÕES DO ATENDENTE, DEPOIS DA DECISÃO DA ETAPA 8
--
-- A Etapa 8 concedeu `cash.adjust` ao papel Atendente (D-2026-09-26-82):
-- ele é o operador normal do PDV e precisa suprir e sangrar a gaveta no
-- plantão. `cash.reopen` continua FORA dele, e este bloco prova as duas
-- coisas na mesma execução.
--
-- A concessão abaixo é a própria migration `20260926180000`, aplicada aqui de
-- forma idempotente. Enquanto ela não estiver persistida no DEV, esta suíte a
-- ensaia dentro da própria transação; depois de persistida, o insert não faz
-- nada. O que se mede em seguida é idêntico nos dois casos, e a prova estrita
-- do diff de RBAC é a suíte `rbac_etapa8_fase12.sql`.
-- =============================================================================
reset role;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
  join public.permissions p on p.code = 'cash.adjust'
 where r.name = 'Atendente' and r.is_system
on conflict do nothing;

-- O papel de teste copiou as permissões do Atendente ANTES deste insert, então
-- precisa acompanhar — é o que mantém o bloco medindo o sistema real.
insert into public.role_permissions (role_id, permission_id)
select 'cccc8888-0000-0000-0000-00000000000b', p.id from public.permissions p
 where p.code = 'cash.adjust' on conflict do nothing;

select pg_temp.checar('E1 o papel Atendente existe e e do sistema', 'true',
  (select exists (select 1 from public.roles where name = 'Atendente' and is_system))::text);
select pg_temp.checar('E2 e suas permissoes de caixa sao exatamente estas',
  'cash.adjust, cash.close, cash.open, cash.view',
  (select string_agg(p.code, ', ' order by p.code)
     from public.roles r
     join public.role_permissions rp on rp.role_id = r.id
     join public.permissions p on p.id = rp.permission_id
    where r.name = 'Atendente' and r.is_system and p.code like 'cash.%'));
select pg_temp.checar('E3 cash.reopen continua FORA do Atendente', 'false',
  (select exists (select 1
     from public.roles r
     join public.role_permissions rp on rp.role_id = r.id
     join public.permissions p on p.id = rp.permission_id
    where r.name = 'Atendente' and r.is_system and p.code = 'cash.reopen'))::text);

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-8888-2222-2222-222222222222","role":"authenticated"}';
select pg_temp.checar('E4 o balconista ABRE o caixa', 'true',
  (public.abrir_caixa('{"fundo":40.00}'::jsonb) ->> 'ok'));
select pg_temp.checar('E5 e enxerga o esperado', '40.00', pg_temp.esperado()::text);
select set_config('teste.sessao_e', pg_temp.sessao_aberta()::text, true);
select pg_temp.checar('E6 agora FAZ suprimento', 'true',
  (public.movimentar_caixa(jsonb_build_object('tipo','supply','valor',10.00,
     'motivo','troco do plantao','idempotency_key', gen_random_uuid()::text)) ->> 'ok'));
select pg_temp.checar('E7 e o esperado sobe', '50.00', pg_temp.esperado()::text);
select pg_temp.checar('E8 e FAZ sangria', 'true',
  (public.movimentar_caixa(jsonb_build_object('tipo','withdrawal','valor',10.00,
     'motivo','sobra para o cofre','idempotency_key', gen_random_uuid()::text)) ->> 'ok'));
select pg_temp.checar('E9 voltando o esperado', '40.00', pg_temp.esperado()::text);
-- A permissão nova NÃO afrouxou a regra de saldo: quem guarda o dinheiro
-- continua sendo o servidor, e ele recusa tirar o que não está na gaveta.
select set_config('teste.e10', public.movimentar_caixa(jsonb_build_object(
  'tipo','withdrawal','valor',999.00,'motivo','tentativa',
  'idempotency_key', gen_random_uuid()::text))::text, true);
select pg_temp.checar('E10 mas sangria acima do esperado continua recusada', 'false',
  (current_setting('teste.e10')::jsonb ->> 'ok'));
select pg_temp.checar('E11 e a recusa agora e de SALDO, nao de permissao', 'true',
  ((current_setting('teste.e10')::jsonb ->> 'erro') ilike '%esperado%')::text);
select pg_temp.checar('E12 o esperado sobreviveu a recusa', '40.00', pg_temp.esperado()::text);
select pg_temp.checar('E13 o balconista FECHA o caixa', 'true',
  (public.fechar_caixa(jsonb_build_object('contado', 40.00)) ->> 'ok'));
-- A sessão vem do `set_config` do E5, não de `sessao_aberta()`: depois do E13
-- não há sessão aberta, e passar `null` faria o cenário medir o argumento nulo
-- em vez da permissão que falta.
select pg_temp.checar('E14 e NAO reabre a sessao que ele mesmo fechou: reopen nao e dele', 'false',
  (public.reabrir_caixa(current_setting('teste.sessao_e')::uuid, 'tentativa') ->> 'ok'));

-- =============================================================================
-- BLOCO F — FECHAMENTO, DIFERENÇA E PI-F12-01
-- =============================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-8888-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('F0 fixture: abre um caixa para conferir', 'true',
  (public.abrir_caixa('{"fundo":100.00}'::jsonb) ->> 'ok'));
-- O ID FICA GUARDADO AQUI, e não é preciosismo: `closed_at` recebe `now()`,
-- que é FIXO dentro da transação, então todas as sessões fechadas por esta
-- suíte têm o mesmo instante e `order by closed_at desc limit 1` escolhe uma
-- delas ao acaso. F7 e F8 falharam medindo a sessão errada — a real do DEV,
-- fechada no A0 — quando o bloco E passou a fechar uma sessão a mais.
select set_config('teste.sessao_f', pg_temp.sessao_aberta()::text, true);

-- RN-CAIXA-012: diferença não impede fechar, mas EXIGE justificativa.
select set_config('teste.f1', public.fechar_caixa(
  jsonb_build_object('contado', 90.00))::text, true);
select pg_temp.checar('F1 contado diferente SEM justificativa e recusado', 'false',
  (current_setting('teste.f1')::jsonb ->> 'ok'));
select pg_temp.checar('F2 e o servidor diz que exige justificativa', 'true',
  (current_setting('teste.f1')::jsonb ->> 'exige_justificativa'));
select pg_temp.checar('F3 mostrando esperado e contado', '100.00/90.00',
  (current_setting('teste.f1')::jsonb ->> 'esperado') || '/' ||
  (current_setting('teste.f1')::jsonb ->> 'contado'));
select pg_temp.checar('F4 e a diferenca calculada pelo SERVIDOR', '-10.00',
  (current_setting('teste.f1')::jsonb ->> 'diferenca'));
select pg_temp.checar('F5 o caixa continua ABERTO apos a recusa', '1', pg_temp.abertas()::text);
select pg_temp.checar('F6 com justificativa, fecha', 'true',
  (public.fechar_caixa(jsonb_build_object('contado', 90.00,
     'justificativa','faltou troco, conferido duas vezes')) ->> 'ok'));
select pg_temp.checar('F7 e a diferenca fica GRAVADA, nao corrigida', '-10.00',
  (select difference_amount::text from public.cash_sessions
    where id = current_setting('teste.sessao_f')::uuid));
-- O esperado NAO e ajustado para bater com o contado: a diferenca e o fato.
select pg_temp.checar('F8 o esperado gravado continua sendo o do servidor', '100.00',
  (select expected_cash_amount::text from public.cash_sessions
    where id = current_setting('teste.sessao_f')::uuid));

-- PI-F12-01: a guarda da sangria existe; a do estorno NAO. Continua assim, e
-- esta etapa nao agravou nem corrigiu — apenas mediu.
select pg_temp.checar('F9 movimentar_caixa TEM a guarda de saldo', 'true',
  (select prosrc ilike '%maior que o dinheiro esperado%' from pg_proc
    where proname='movimentar_caixa' and pronamespace='public'::regnamespace)::text);
select pg_temp.checar('F10 reverter_pagamento NAO tem essa guarda', 'false',
  (select prosrc ilike '%maior que o dinheiro esperado%' from pg_proc
    where proname='reverter_pagamento' and pronamespace='public'::regnamespace)::text);
-- O segundo efeito descrito em PI-F12-01: com o esperado negativo, nao existe
-- contado que feche sem diferenca, porque contado negativo e proibido. A
-- constraint esta aqui, escrita como o Postgres a normaliza.
select pg_temp.checar('F11 o CHECK do contado nao-negativo continua la',
  'CHECK (((counted_cash_amount IS NULL) OR (counted_cash_amount >= (0)::numeric)))',
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.cash_sessions'::regclass and conname = 'cash_sessions_contado'));

-- =============================================================================
-- BLOCO G — NADA DE NOVO FOI CRIADO
-- =============================================================================
select pg_temp.checar('G1 nenhuma tabela de caixa paralela', '0',
  (select count(*)::text from pg_tables
    where schemaname='public' and tablename ilike '%pdv%'));
select pg_temp.checar('G2 abrir_caixa segue exigindo cash.open', 'true',
  (select prosrc like '%cash.open%' from pg_proc
    where proname='abrir_caixa' and pronamespace='public'::regnamespace)::text);
select pg_temp.checar('G3 movimentar_caixa segue exigindo cash.adjust', 'true',
  (select prosrc like '%cash.adjust%' from pg_proc
    where proname='movimentar_caixa' and pronamespace='public'::regnamespace)::text);
select pg_temp.checar('G4 fechar_caixa segue exigindo cash.close', 'true',
  (select prosrc like '%cash.close%' from pg_proc
    where proname='fechar_caixa' and pronamespace='public'::regnamespace)::text);
select pg_temp.checar('G5 so existem dois tipos de documento impresso', 'true',
  (select pg_get_constraintdef(oid) ilike '%comanda%alteracao%' from pg_constraint
    where conname = 'order_prints_documento')::text);

reset role;

-- GUARDA FINAL: os pagamentos reais atravessaram a suite intactos.
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
