-- =============================================================================
-- TESTES DO CANCELAMENTO COM ESTORNO — FASE 12 (PDV), ETAPA 1
--
-- 04-REGRAS-NEGOCIO.md RN-CAIXA-019 · 09-PDV-FRENTE-DE-CAIXA.md §1.5
-- CLAUDE.md §21, §28, §33, §34 · Decisão: D-2026-09-25-78
--
-- A PERGUNTA QUE ESTE ARQUIVO RESPONDE: é possível terminar com dinheiro
-- devolvido e pedido vivo, ou com pedido cancelado e dinheiro retido?
--
-- Os dois estados são inaceitáveis, e o segundo existia de verdade antes desta
-- etapa. O bloco E é o coração: força a falha no meio da operação e prova que
-- NADA ficou gravado.
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
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('99999999-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona12@teste.local','x',now(),now(),now()),
  ('99999999-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','socancela12@teste.local','x',now(),now(),now()),
  ('99999999-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','soestorna12@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a9a9a9a9-0000-0000-0000-000000000001','Dona F12','owner',false,'active'),
  ('a9a9a9a9-0000-0000-0000-000000000002','So cancela F12','counter',false,'active'),
  ('a9a9a9a9-0000-0000-0000-000000000003','So estorna F12','counter',false,'active');

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b9b9b9b9-0000-0000-0000-000000000001','99999999-1111-1111-1111-111111111111','a9a9a9a9-0000-0000-0000-000000000001',true),
  ('b9b9b9b9-0000-0000-0000-000000000002','99999999-2222-2222-2222-222222222222','a9a9a9a9-0000-0000-0000-000000000002',true),
  ('b9b9b9b9-0000-0000-0000-000000000003','99999999-3333-3333-3333-333333333333','a9a9a9a9-0000-0000-0000-000000000003',true);

insert into public.user_roles (app_user_id, role_id)
select 'b9b9b9b9-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';

-- Dois papéis deliberadamente incompletos: cada um tem UMA das duas permissões
-- que o cancelamento com estorno exige. São eles que provam que a exigência é
-- de ambas, e não de qualquer uma.
insert into public.roles (id, name, description, is_system, is_active) values
  ('c9c9c9c9-0000-0000-0000-00000000000a','So cancela F12','cancela e nao estorna',false,true),
  ('c9c9c9c9-0000-0000-0000-00000000000b','So estorna F12','estorna e nao cancela',false,true);

insert into public.role_permissions (role_id, permission_id)
select 'c9c9c9c9-0000-0000-0000-00000000000a', id from public.permissions
 where code in ('orders.view','orders.cancel','orders.create_manual','payments.register','cash.open','cash.close');
insert into public.role_permissions (role_id, permission_id)
select 'c9c9c9c9-0000-0000-0000-00000000000b', id from public.permissions
 where code in ('orders.view','finance.reverse','payments.register');

insert into public.user_roles (app_user_id, role_id) values
  ('b9b9b9b9-0000-0000-0000-000000000002','c9c9c9c9-0000-0000-0000-00000000000a'),
  ('b9b9b9b9-0000-0000-0000-000000000003','c9c9c9c9-0000-0000-0000-00000000000b');

-- O ambiente pode ter caixa aberto de verdade. Dentro da transação ele sai do
-- caminho; o ROLLBACK o devolve intacto. Sem isso o teste mediria o estado do
-- ambiente em vez da regra.
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
  'c9c9c9c9-0000-0000-0000-0000000000f1','Shalon F12','5500000000000','Rua T','1','Centro',
  'Cidade','XX','00000-000', -20.0, -40.0, 10.0, 40, 60, 20, 30, true, 'America/Sao_Paulo');

delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 10, 5.00, true, 1);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order)
values ('a9a9a9a9-1000-0000-0000-000000000001','G F12',8,2,1);
insert into public.categories (id, name, slug, sort_order)
values ('b9b9b9b9-1000-0000-0000-00000000000c','Cat F12','cat-f12',1);
insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active)
values ('b9b9b9b9-1000-0000-0000-000000000001','b9b9b9b9-1000-0000-0000-00000000000c',
        'pizza','Pizza F12','pizza-f12',1,true);
insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available)
values ('a9a9a9a9-2000-0000-0000-000000000001','b9b9b9b9-1000-0000-0000-000000000001',
        'a9a9a9a9-1000-0000-0000-000000000001', 40.00, true, true);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
select set_config('teste.debito',   (select id::text from public.payment_methods where code='debito'), true);

-- `debito` tem `requires_brand`, e o ambiente pode não ter bandeira cadastrada.
-- Sem esta linha o pagamento de teste seria recusado por falta de bandeira, e o
-- cenário mediria o cadastro em vez da regra de estorno.
insert into public.payment_brands (id, payment_method_id, name, is_active, sort_order)
select 'c9c9c9c9-0000-0000-0000-0000000000b1', m.id, 'Bandeira F12', true, 99
  from public.payment_methods m where m.code = 'debito'
  and not exists (select 1 from public.payment_brands b
                   where b.payment_method_id = m.id and b.is_active);

select set_config('teste.bandeira',
  (select b.id::text from public.payment_brands b
    join public.payment_methods m on m.id = b.payment_method_id
   where m.code='debito' and b.is_active limit 1), true);

-- Helpers ---------------------------------------------------------------------

create or replace function pg_temp.pedido(p_idem text)
returns uuid language plpgsql as $$
declare v jsonb;
begin
  v := public.criar_pedido(jsonb_build_object(
    'idempotency_key', p_idem,
    'tracking_token', md5(p_idem) || md5(p_idem || ':2'),
    'origem', 'counter',
    'modalidade', 'pickup',
    'cliente', jsonb_build_object('nome','Cliente F12','whatsapp','(11) 99000-0001'),
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id','b9b9b9b9-1000-0000-0000-000000000001',
      'variacao_id','a9a9a9a9-2000-0000-0000-000000000001','quantidade',1)),
    'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))
  ), '');
  return (v ->> 'pedido_id')::uuid;
end;
$$;

-- Paga o TOTAL do pedido, lido do próprio pedido. Valor fixo no teste é
-- armadilha: `registrar_pagamento` exige soma exata, e qualquer mudança de
-- preço na fixture derrubaria a suíte inteira por um motivo que não é o que
-- ela quer medir.
create or replace function pg_temp.pagar(p_pedido uuid, p_forma text)
returns jsonb language sql as $$
  select public.registrar_pagamento(p_pedido, jsonb_build_object(
    'linhas', jsonb_build_array(jsonb_build_object(
      'forma_id', p_forma,
      'valor', (select o.total from public.orders o where o.id = p_pedido),
      'bandeira_id', case when p_forma = current_setting('teste.debito', true)
                          then current_setting('teste.bandeira', true) end)),
    'idempotency_key', gen_random_uuid()::text));
$$;

-- Contém a exceção para que o `raise` da função não aborte a suíte. O bloco
-- `exception` cria savepoint implícito: é justamente isso que faz o rollback
-- parcial acontecer e permite conferir, no cenário seguinte, que nada ficou.
create or replace function pg_temp.tentar_cancelar(p_pedido uuid, p_motivo text)
returns text language plpgsql as $$
begin
  begin
    return public.cancelar_pedido_com_estorno(p_pedido, p_motivo)::text;
  exception when others then
    return 'EXCECAO';
  end;
end;
$$;

-- Produz um estado que a aplicação NÃO produz, para testar a reação a ele.
--
-- É `security definer` de propósito: `orders` tem RLS, e um UPDATE direto sob
-- o papel `authenticated` é FILTRADO em silêncio — zero linhas, nenhum erro. A
-- primeira versão da suíte caiu nessa armadilha e três cenários mediram um
-- estado que nunca havia sido criado.
create or replace function pg_temp.forcar(p_pedido uuid, p_status text, p_motivo text)
returns void language plpgsql security definer as $$
begin
  update public.orders
     set status = p_status,
         cancellation_reason = case when p_status = 'cancelled' then p_motivo
                                    else cancellation_reason end,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
         rejection_reason = case when p_status = 'rejected' then p_motivo
                                 else rejection_reason end
   where id = p_pedido;
  if not found then
    raise exception 'fixture nao aplicada: pedido % nao encontrado', p_pedido;
  end if;
end;
$$;

create or replace function pg_temp.status(p_pedido uuid) returns text language sql as $$
  select o.status || '/' || o.payment_status from public.orders o where o.id = p_pedido;
$$;

create or replace function pg_temp.refunds(p_pedido uuid) returns integer language sql as $$
  select count(*)::integer from public.cash_movements m
   where m.order_id = p_pedido and m.movement_type = 'refund';
$$;

create or replace function pg_temp.auditorias(p_pedido uuid) returns integer language sql as $$
  select count(*)::integer from public.audit_logs a
   where a.entity_id = p_pedido and a.action = 'pedido_cancelar_com_estorno';
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-1111-1111-1111-111111111111","role":"authenticated"}';

select set_config('teste.caixa', (public.abrir_caixa('{"fundo":100.00}'::jsonb) ->> 'sessao_id'), true);
select pg_temp.checar('fixture: caixa aberto', '100.00',
  public.esperado_em_caixa(current_setting('teste.caixa', true)::uuid)::text);

-- =============================================================================
-- A. A GUARDA EM comando_pedido
-- =============================================================================

select set_config('teste.p1', pg_temp.pedido('99000001-0000-0000-0000-000000000001')::text, true);

-- Regressão: sem pagamento, nada mudou.
select pg_temp.checar('A1 sem motivo continua recusado', 'Informe o motivo do cancelamento.',
  (public.comando_pedido(current_setting('teste.p1')::uuid, 'cancelar', '{}'::jsonb) ->> 'erro'));

select pg_temp.checar('A2 sem pagamento cancela como antes', 'true',
  (public.comando_pedido(current_setting('teste.p1')::uuid, 'cancelar',
     '{"motivo":"teste de regressao"}'::jsonb) ->> 'ok'));

select pg_temp.checar('A3 e o pedido ficou cancelado', 'cancelled/pending',
  pg_temp.status(current_setting('teste.p1')::uuid));

-- Agora um pedido PAGO.
select set_config('teste.p2', pg_temp.pedido('99000002-0000-0000-0000-000000000002')::text, true);
select pg_temp.checar('A4 fixture: pagamento em dinheiro', 'true',
  (pg_temp.pagar(current_setting('teste.p2')::uuid,
     current_setting('teste.dinheiro', true)) ->> 'ok'));

select set_config('teste.r2',
  public.comando_pedido(current_setting('teste.p2')::uuid, 'cancelar',
    '{"motivo":"cliente desistiu"}'::jsonb)::text, true);

select pg_temp.checar('A5 pedido pago NAO cancela por comando_pedido', 'false',
  (current_setting('teste.r2')::jsonb ->> 'ok'));
select pg_temp.checar('A6 o bloqueio e nomeado', 'pagamento_confirmado',
  (current_setting('teste.r2')::jsonb ->> 'bloqueio'));
select pg_temp.checar('A7 a recusa conduz ao estorno', 'true',
  (current_setting('teste.r2')::jsonb ->> 'exige_estorno'));
select pg_temp.checar('A8 a recusa informa o total pago', '40.00',
  (current_setting('teste.r2')::jsonb ->> 'total_pago'));
select pg_temp.checar('A9 a recusa NAO mexeu no pedido', 'confirmed/confirmed',
  pg_temp.status(current_setting('teste.p2')::uuid));
select pg_temp.checar('A10 nenhum estorno foi criado pela recusa', '0',
  pg_temp.refunds(current_setting('teste.p2')::uuid)::text);

-- Rejeitar não foi afetado pela guarda.
select set_config('teste.p3', pg_temp.pedido('99000003-0000-0000-0000-000000000003')::text, true);
-- Pedido de balcão nasce aceito (migration 20260921170000), então `rejeitar`
-- não se aplica a ele. O cenário afirma isso em vez de supor o contrário.
select pg_temp.checar('A11 rejeitar nao se aplica a pedido de balcao',
  'Esta ação não se aplica ao pedido neste momento.',
  (public.comando_pedido(current_setting('teste.p3')::uuid, 'rejeitar', '{}'::jsonb) ->> 'erro'));

-- =============================================================================
-- B. O CAMINHO COMPLETO
-- =============================================================================

select set_config('teste.antes', public.esperado_em_caixa(current_setting('teste.caixa')::uuid)::text, true);
select set_config('teste.rb',
  pg_temp.tentar_cancelar(current_setting('teste.p2')::uuid, 'cliente desistiu'), true);

select pg_temp.checar('B1 cancelamento com estorno funciona', 'true',
  (current_setting('teste.rb')::jsonb ->> 'ok'));
select pg_temp.checar('B2 uma linha estornada', '1',
  (current_setting('teste.rb')::jsonb ->> 'estornadas'));
select pg_temp.checar('B3 o valor devolvido e o que foi pago', '40.00',
  (current_setting('teste.rb')::jsonb ->> 'total'));
select pg_temp.checar('B4 os DOIS eixos mudaram', 'cancelled/reversed',
  pg_temp.status(current_setting('teste.p2')::uuid));
select pg_temp.checar('B5 todos os pagamentos ficaram estornados', '0',
  (select count(*)::text from public.payments p
    where p.order_id = current_setting('teste.p2')::uuid and p.status = 'confirmed'));
select pg_temp.checar('B6 saiu dinheiro da gaveta', '1',
  pg_temp.refunds(current_setting('teste.p2')::uuid)::text);
select pg_temp.checar('B7 o esperado em caixa caiu o valor exato', '-40.00',
  (public.esperado_em_caixa(current_setting('teste.caixa')::uuid)
   - current_setting('teste.antes')::numeric)::text);
select pg_temp.checar('B8 a auditoria registrou o ato', '1',
  pg_temp.auditorias(current_setting('teste.p2')::uuid)::text);
select pg_temp.checar('B9 a auditoria guardou o motivo', 'cliente desistiu',
  (select a.reason from public.audit_logs a
    where a.entity_id = current_setting('teste.p2')::uuid
      and a.action = 'pedido_cancelar_com_estorno'));
select pg_temp.checar('B10 a transicao entrou no historico', '1',
  (select count(*)::text from public.order_status_history h
    where h.order_id = current_setting('teste.p2')::uuid and h.to_status = 'cancelled'));

-- Sem pagamento também funciona, e não inventa estorno.
select set_config('teste.p4', pg_temp.pedido('99000004-0000-0000-0000-000000000004')::text, true);
select set_config('teste.rb4',
  pg_temp.tentar_cancelar(current_setting('teste.p4')::uuid, 'sem pagamento nenhum'), true);
select pg_temp.checar('B11 sem pagamento cancela pela funcao nova', 'true',
  (current_setting('teste.rb4')::jsonb ->> 'ok'));
select pg_temp.checar('B12 e nao estorna nada', '0',
  (current_setting('teste.rb4')::jsonb ->> 'estornadas'));
select pg_temp.checar('B13 nenhum movimento de estorno', '0',
  pg_temp.refunds(current_setting('teste.p4')::uuid)::text);

-- =============================================================================
-- C. IDEMPOTÊNCIA E CONCORRÊNCIA
-- =============================================================================

select set_config('teste.rc',
  pg_temp.tentar_cancelar(current_setting('teste.p2')::uuid, 'cliente desistiu'), true);

select pg_temp.checar('C1 segunda chamada nao e erro', 'true',
  (current_setting('teste.rc')::jsonb ->> 'ok'));
select pg_temp.checar('C2 e diz que ja estava cancelado', 'true',
  (current_setting('teste.rc')::jsonb ->> 'ja_cancelado'));
select pg_temp.checar('C3 nao estorna de novo', '0',
  (current_setting('teste.rc')::jsonb ->> 'estornadas'));
select pg_temp.checar('C4 continua havendo UM estorno so', '1',
  pg_temp.refunds(current_setting('teste.p2')::uuid)::text);

-- Estado legado: cancelado E pago, que existia antes da guarda. O caminho novo
-- CONSERTA em vez de recusar.
select set_config('teste.p5', pg_temp.pedido('99000005-0000-0000-0000-000000000005')::text, true);
select pg_temp.checar('C5 fixture legado: pago', 'true',
  (pg_temp.pagar(current_setting('teste.p5')::uuid,
     current_setting('teste.dinheiro', true)) ->> 'ok'));

-- Produz o estado inconsistente do jeito que ele nascia: por fora da guarda.
select pg_temp.forcar(current_setting('teste.p5')::uuid, 'cancelled', 'legado');

select pg_temp.checar('C6 o estado legado existe mesmo', 'cancelled/confirmed',
  pg_temp.status(current_setting('teste.p5')::uuid));

select set_config('teste.rc5',
  pg_temp.tentar_cancelar(current_setting('teste.p5')::uuid, 'reparo de estado antigo'), true);

select pg_temp.checar('C7 o reparo acontece', 'true',
  (current_setting('teste.rc5')::jsonb ->> 'ok'));
select pg_temp.checar('C8 e estorna o que ficou para tras', '1',
  (current_setting('teste.rc5')::jsonb ->> 'estornadas'));
select pg_temp.checar('C9 o estado fica coerente', 'cancelled/reversed',
  pg_temp.status(current_setting('teste.p5')::uuid));

-- Rejeitado não é cancelado.
-- Rejeitado produzido por fixture: o comando `rejeitar` não é aplicável a
-- pedido de balcão, e o que interessa aqui é o estado, não como se chega nele.
select pg_temp.forcar(current_setting('teste.p3')::uuid, 'rejected', 'fixture');

select pg_temp.checar('C10 a funcao nova recusa cancelar o rejeitado', 'false',
  (pg_temp.tentar_cancelar(current_setting('teste.p3')::uuid, 'tentando cancelar')::jsonb ->> 'ok'));
select pg_temp.checar('C11 e diz por que', 'Pedido rejeitado não é cancelado. A rejeição já encerrou o pedido.',
  (pg_temp.tentar_cancelar(current_setting('teste.p3')::uuid, 'tentando cancelar')::jsonb ->> 'erro'));

-- =============================================================================
-- D. PERMISSÕES E MOTIVO
-- =============================================================================

select set_config('teste.p6', pg_temp.pedido('99000006-0000-0000-0000-000000000006')::text, true);
select pg_temp.checar('D1 fixture: pago em dinheiro', 'true',
  (pg_temp.pagar(current_setting('teste.p6')::uuid,
     current_setting('teste.dinheiro', true)) ->> 'ok'));

select pg_temp.checar('D2 motivo vazio recusado', 'false',
  (pg_temp.tentar_cancelar(current_setting('teste.p6')::uuid, '')::jsonb ->> 'ok'));
select pg_temp.checar('D3 motivo curto recusado', 'false',
  (pg_temp.tentar_cancelar(current_setting('teste.p6')::uuid, 'ab')::jsonb ->> 'ok'));
select pg_temp.checar('D4 recusa por motivo nao mexeu no pedido', 'confirmed/confirmed',
  pg_temp.status(current_setting('teste.p6')::uuid));

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('D5 quem so cancela nao consegue', 'false',
  (pg_temp.tentar_cancelar(current_setting('teste.p6')::uuid, 'sem poder estornar')::jsonb ->> 'ok'));
select pg_temp.checar('D6 e a mensagem fala das DUAS permissoes', 'true',
  (pg_temp.tentar_cancelar(current_setting('teste.p6')::uuid, 'sem poder estornar')::jsonb
     ->> 'erro' like '%duas permiss%')::text);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-3333-3333-3333-333333333333","role":"authenticated"}';

select pg_temp.checar('D7 quem so estorna nao consegue', 'false',
  (pg_temp.tentar_cancelar(current_setting('teste.p6')::uuid, 'sem poder cancelar')::jsonb ->> 'ok'));

reset role;
-- O grant é afirmado pelo CATÁLOGO, e não chamando a função como `anon`.
--
-- A primeira versão deste cenário trocava de papel e esperava exceção — e
-- passava a medir CACHE DE PLANO: `tentar_cancelar` já havia sido chamada
-- antes na mesma transação, e o plano reaproveitado não revalidou o EXECUTE.
-- O teste dizia "anon não executa" olhando para a coisa errada, e passava a
-- reportar a permissão do ÚLTIMO papel usado.
--
-- Conferido à parte, em transação limpa: chamada como `anon`, a função devolve
-- SQLSTATE 42501. Aqui a asserção é sobre o privilégio, que é o que a
-- migration controla e o que não se engana com cache.
select pg_temp.checar('D8 anon NAO tem execute na funcao', 'false',
  has_function_privilege('anon',
    'public.cancelar_pedido_com_estorno(uuid,text)', 'execute')::text);
select pg_temp.checar('D8b PUBLIC tambem nao tem', 'false',
  has_function_privilege('public',
    'public.cancelar_pedido_com_estorno(uuid,text)', 'execute')::text);
select pg_temp.checar('D8c authenticated tem', 'true',
  has_function_privilege('authenticated',
    'public.cancelar_pedido_com_estorno(uuid,text)', 'execute')::text);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('D9 depois de tudo isso o pedido segue intacto', 'confirmed/confirmed',
  pg_temp.status(current_setting('teste.p6')::uuid));

-- =============================================================================
-- E. ATOMICIDADE — O CORAÇÃO DESTA ETAPA
--
-- Dinheiro recebido, caixa fechado, nenhum outro aberto. `reverter_pagamento`
-- recusa, porque tirar dinheiro exige gaveta aberta. A operação inteira tem de
-- desaparecer: sem estorno, sem cancelamento, sem auditoria.
-- =============================================================================

select pg_temp.checar('E1 fixture: fecha o caixa', 'true',
  (public.fechar_caixa(jsonb_build_object('contado',
     public.esperado_em_caixa(current_setting('teste.caixa')::uuid))) ->> 'ok'));

select pg_temp.checar('E2 nao ha caixa aberto', '0',
  (select count(*)::text from public.cash_sessions where status = 'open'));

select set_config('teste.re', pg_temp.tentar_cancelar(
  current_setting('teste.p6')::uuid, 'gaveta fechada'), true);

select pg_temp.checar('E3 a operacao FALHA', 'EXCECAO', current_setting('teste.re'));
select pg_temp.checar('E4 o pagamento continua confirmado', 'confirmed/confirmed',
  pg_temp.status(current_setting('teste.p6')::uuid));
select pg_temp.checar('E5 nenhuma linha de pagamento foi estornada', '1',
  (select count(*)::text from public.payments p
    where p.order_id = current_setting('teste.p6')::uuid and p.status = 'confirmed'));
select pg_temp.checar('E6 nenhum movimento de estorno ficou', '0',
  pg_temp.refunds(current_setting('teste.p6')::uuid)::text);
select pg_temp.checar('E7 o movimento original NAO foi marcado como revertido', '0',
  (select count(*)::text from public.cash_movements m
    where m.order_id = current_setting('teste.p6')::uuid
      and m.movement_type = 'sale_receipt' and m.reversed_at is not null));
select pg_temp.checar('E8 nenhuma auditoria do ato ficou', '0',
  pg_temp.auditorias(current_setting('teste.p6')::uuid)::text);
select pg_temp.checar('E9 nenhuma transicao entrou no historico', '0',
  (select count(*)::text from public.order_status_history h
    where h.order_id = current_setting('teste.p6')::uuid and h.to_status = 'cancelled'));

-- =============================================================================
-- F. A REGRA DO CAIXA ABERTO, E QUANDO ELA NÃO SE APLICA
-- =============================================================================

-- Fundo suficiente para absorver o estorno. Com fundo zero o esperado ficaria
-- negativo, e `fechar_caixa` recusaria o contado por constraint — o cenário
-- passaria a medir aquela constraint em vez do estorno.
--
-- Fica registrado o que isso revela: `reverter_pagamento` insere o movimento
-- de saída SEM a guarda que `movimentar_caixa` aplica à sangria, então um
-- estorno pode levar o esperado a negativo. É comportamento anterior a esta
-- etapa e não é alterado aqui.
select pg_temp.checar('F1 abre outro caixa', 'true',
  (public.abrir_caixa('{"fundo":100.00}'::jsonb) ->> 'ok'));
select set_config('teste.caixa2',
  (select id::text from public.cash_sessions where status='open'), true);

select set_config('teste.rf', pg_temp.tentar_cancelar(
  current_setting('teste.p6')::uuid, 'agora com gaveta aberta'), true);

select pg_temp.checar('F2 com caixa aberto o estorno acontece', 'true',
  (current_setting('teste.rf')::jsonb ->> 'ok'));
select pg_temp.checar('F3 e o pedido fica cancelado', 'cancelled/reversed',
  pg_temp.status(current_setting('teste.p6')::uuid));
select pg_temp.checar('F4 o estorno caiu no caixa ABERTO, nao no fechado', '1',
  (select count(*)::text from public.cash_movements m
    where m.order_id = current_setting('teste.p6')::uuid
      and m.movement_type = 'refund'
      and m.cash_session_id = current_setting('teste.caixa2')::uuid));

-- Cartão não passa pela gaveta: estorno não depende de caixa aberto.
select set_config('teste.p7', pg_temp.pedido('99000007-0000-0000-0000-000000000007')::text, true);
select pg_temp.checar('F5 fixture: pago em debito', 'true',
  (pg_temp.pagar(current_setting('teste.p7')::uuid,
     current_setting('teste.debito', true)) ->> 'ok'));
select pg_temp.checar('F6 debito nao gera movimento na gaveta', '0',
  (select count(*)::text from public.cash_movements m
    where m.order_id = current_setting('teste.p7')::uuid));

select pg_temp.checar('F7 fecha o caixa de novo', 'true',
  (public.fechar_caixa(jsonb_build_object('contado',
     public.esperado_em_caixa(current_setting('teste.caixa2')::uuid))) ->> 'ok'));

select set_config('teste.rf7', pg_temp.tentar_cancelar(
  current_setting('teste.p7')::uuid, 'estorno de cartao sem gaveta'), true);

select pg_temp.checar('F8 cartao estorna SEM caixa aberto', 'true',
  (current_setting('teste.rf7')::jsonb ->> 'ok'));
select pg_temp.checar('F9 e o pedido fica cancelado', 'cancelled/reversed',
  pg_temp.status(current_setting('teste.p7')::uuid));
select pg_temp.checar('F10 e nenhum movimento de gaveta foi inventado', '0',
  pg_temp.refunds(current_setting('teste.p7')::uuid)::text);

reset role;

-- =============================================================================
-- RESULTADO
-- =============================================================================
select
  case when passou then 'OK    ' else 'FALHOU' end
    || ' | ' || lpad(n::text, 3) || ' | ' || rpad(cenario, 52)
    || ' | esperado=' || coalesce(esperado,'(null)') || ' obtido=' || coalesce(obtido,'(null)') as resultado
from resultado_teste where not passou
union all
select 'TOTAL: ' || count(*) || ' cenarios | PASSARAM: ' || count(*) filter (where passou)
  || ' | FALHARAM: ' || count(*) filter (where not passou)
from resultado_teste;

rollback;
