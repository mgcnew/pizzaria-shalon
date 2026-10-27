-- =============================================================================
-- TESTES DA TROCA DE FORMA DE PAGAMENTO — D-2026-10-24-167 (migration 0174)
--
-- 04-REGRAS-NEGOCIO.md RN-FIN-003/004, RN-CAIXA-012/015/016 · CLAUDE.md §24, §25, §28, §34
--
-- AS PERGUNTAS DESTE ARQUIVO:
--   1. a troca fica na sessão ORIGINAL — e o caixa de hoje não é tocado?
--   2. o esperado da sessão (aberta ou fechada) bate depois da troca?
--   3. o fechamento original continua reconstruível?
--   4. a receita continua no dia em que entrou?
--   5. quem não pode estornar e registrar não troca?
--
-- Os números são por VARIAÇÃO: o DEV pode ter um caixa aberto de verdade, e o
-- teste mede o efeito da operação, não o estado do ambiente. Transação com
-- ROLLBACK: nada é persistido.
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
  ('88888888-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona8@teste.local','x',now(),now(),now()),
  ('88888888-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','atendente8@teste.local','x',now(),now(),now()),
  ('88888888-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','observador8@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a8a8a8a8-0000-0000-0000-000000000001','Dona F7','owner',false,'active'),
  ('a8a8a8a8-0000-0000-0000-000000000002','Atendente F7','counter',false,'active'),
  ('a8a8a8a8-0000-0000-0000-000000000003','Observador F7','counter',false,'active');

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b8b8b8b8-0000-0000-0000-000000000001','88888888-1111-1111-1111-111111111111','a8a8a8a8-0000-0000-0000-000000000001',true),
  ('b8b8b8b8-0000-0000-0000-000000000002','88888888-2222-2222-2222-222222222222','a8a8a8a8-0000-0000-0000-000000000002',true),
  ('b8b8b8b8-0000-0000-0000-000000000003','88888888-3333-3333-3333-333333333333','a8a8a8a8-0000-0000-0000-000000000003',true);

insert into public.user_roles (app_user_id, role_id)
select 'b8b8b8b8-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
select 'b8b8b8b8-0000-0000-0000-000000000002', id from public.roles where name = 'Atendente';

-- Papel que só ENXERGA dinheiro. Prova que ver não é poder mexer.
insert into public.roles (id, name, description, is_system, is_active)
values ('c8c8c8c8-0000-0000-0000-00000000000f','Observador F7','So visualiza', false, true);
insert into public.role_permissions (role_id, permission_id)
select 'c8c8c8c8-0000-0000-0000-00000000000f', id from public.permissions
 where code in ('orders.view','cash.view','finance.view','employees.view');
insert into public.user_roles (app_user_id, role_id)
values ('b8b8b8b8-0000-0000-0000-000000000003','c8c8c8c8-0000-0000-0000-00000000000f');

-- O banco de desenvolvimento pode ter uma sessão de caixa aberta de verdade
-- (alguém operando o painel). Dentro desta transação ela sai do caminho, e o
-- ROLLBACK a devolve intacta: sem isso, `abrir_caixa` encontraria a sessão
-- da pessoa e o teste mediria o estado do ambiente, não a regra.

delete from public.store_settings;
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code, latitude, longitude,
  automatic_delivery_radius_km,
  delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values (
  'ccccccc8-0000-0000-0000-000000000001','Shalon F7','5500000000000','Rua T','1','Centro',
  'Cidade','XX','00000-000', -23.5, -46.6, 4.0, 40, 60, 20, 30, true, 'America/Sao_Paulo'
);

delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 4, 0.00, true, 1);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d8d8d8d8-0000-0000-0000-000000000001','Grande F7', 8, 2, 801);

insert into public.categories (id, name, slug, sort_order) values
  ('c8c8c8c8-0000-0000-0000-000000000001','Pizzas F7','pizzas-f7', 801);

insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active) values
  ('b8b8b8b8-1000-0000-0000-000000000001','c8c8c8c8-0000-0000-0000-000000000001','pizza','Calabresa F7','calabresa-f7', 1, true);

-- Pizza de R$ 50,00: todo total deste arquivo é múltiplo de 50.
insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available) values
  ('a8a8a8a8-1000-0000-0000-000000000001','b8b8b8b8-1000-0000-0000-000000000001','d8d8d8d8-0000-0000-0000-000000000001', 50.00, true, true);

-- RN-PGTO-006: bandeira é CADASTRO, não enum de domínio. Por isso elas
-- nascem aqui, como linha de tabela.
insert into public.payment_brands (id, payment_method_id, name, is_active, sort_order)
select 'e8e8e8e8-0000-0000-0000-000000000001', m.id, 'Bandeira Debito F7', true, 1
  from public.payment_methods m where m.code = 'debito';
insert into public.payment_brands (id, payment_method_id, name, is_active, sort_order)
select 'e8e8e8e8-0000-0000-0000-000000000002', m.id, 'Bandeira Credito F7', true, 1
  from public.payment_methods m where m.code = 'credito';
insert into public.payment_brands (id, payment_method_id, name, is_active, sort_order)
select 'e8e8e8e8-0000-0000-0000-000000000003', m.id, 'Vale F7', true, 1
  from public.payment_methods m where m.code = 'voucher';

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
select set_config('teste.debito',   (select id::text from public.payment_methods where code='debito'), true);
select set_config('teste.credito',  (select id::text from public.payment_methods where code='credito'), true);
select set_config('teste.voucher',  (select id::text from public.payment_methods where code='voucher'), true);
select set_config('teste.pixmaq',   (select id::text from public.payment_methods where code='pix_maquininha'), true);
select set_config('teste.pixchave', (select id::text from public.payment_methods where code='pix_chave'), true);

-- Pedido manual: nasce `confirmed` (RN-MAN-004) e não precisa do segredo de
-- origem. É o caminho mais curto até um pedido pagável.
create or replace function pg_temp.pedido(p jsonb default '{}'::jsonb)
returns uuid language plpgsql as $$
declare v_idem text := coalesce(p ->> 'idem', gen_random_uuid()::text); v_r jsonb;
begin
  v_r := public.criar_pedido(
    jsonb_build_object(
      'idempotency_key', v_idem,
      'tracking_token', md5(v_idem) || md5(v_idem || ':2'),
      'origem', 'counter',
      'modalidade', coalesce(p ->> 'modalidade', 'pickup'),
      'cliente', jsonb_build_object('nome', 'Cliente F7',
                 'whatsapp', coalesce(p ->> 'whatsapp', '(11) 98000-0001')),
      'endereco', case when coalesce(p ->> 'modalidade','pickup') = 'pickup' then null
                       else jsonb_build_object('logradouro','Rua F','numero','7','bairro','Centro',
                         'cidade','Cidade','uf','XX','latitude',-23.51,'longitude',-46.61,
                         'confianca','exata','provedor','teste') end,
      'rota', case when coalesce(p ->> 'modalidade','pickup') = 'pickup' then null
                   else jsonb_build_object('distancia_km', 2.0, 'provedor','teste') end,
      'itens', jsonb_build_array(jsonb_build_object(
                 'produto_id','b8b8b8b8-1000-0000-0000-000000000001',
                 'variacao_id','a8a8a8a8-1000-0000-0000-000000000001',
                 'quantidade', coalesce((p ->> 'quantidade')::integer, 1))),
      'pagamento', jsonb_build_object('forma_id',
        coalesce(p ->> 'forma', current_setting('teste.dinheiro', true)))
    ), '');
  return (v_r ->> 'pedido_id')::uuid;
end;
$$;

-- Guarda o esperado atual para o próximo cenário comparar a VARIAÇÃO.
-- Asserção por valor absoluto obrigaria recalcular a mão toda a cadeia a
-- cada cenário novo — e o que cada operação precisa provar é o seu efeito.
create or replace function pg_temp.marcar()
returns void language sql as $$
  select set_config('teste.antes',
    coalesce(public.esperado_em_caixa(current_setting('teste.sessao', true)::uuid), 0)::text, true);
  select null::void;
$$;

create or replace function pg_temp.variacao()
returns text language sql as $$
  select (coalesce(public.esperado_em_caixa(current_setting('teste.sessao', true)::uuid), 0)
          - current_setting('teste.antes', true)::numeric)::text;
$$;

create or replace function pg_temp.pagar(p_pedido uuid, p_linhas jsonb, p_idem text default null)
returns jsonb language sql as $$
  select public.registrar_pagamento(p_pedido, jsonb_build_object(
    'linhas', p_linhas,
    'idempotency_key', coalesce(p_idem, gen_random_uuid()::text)));
$$;


-- Garante um caixa aberto: o do ambiente, se houver; senão, um do teste.
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-1111-1111-1111-111111111111","role":"authenticated"}';
select public.abrir_caixa('{"fundo":0}'::jsonb)
 where not exists (select 1 from public.cash_sessions where status = 'open');
select set_config('teste.sessao', (select id::text from public.cash_sessions where status='open'), true);

create or replace function pg_temp.troca(p_pedido uuid, p_forma text, p_valor numeric, p_motivo text default 'Cliente pagou de outra forma', p_idem text default null)
returns jsonb language sql as $$
  select public.trocar_forma_de_pagamento(p_pedido, jsonb_build_object(
    'motivo', p_motivo,
    'idempotency_key', coalesce(p_idem, gen_random_uuid()::text),
    'linhas', jsonb_build_array(jsonb_build_object('forma_id', p_forma, 'valor', p_valor,
       'bandeira_id', case when p_forma = current_setting('teste.debito', true)
                           then 'e8e8e8e8-0000-0000-0000-000000000001' end))));
$$;

-- =============================================================================
-- A. SESSÃO ABERTA
-- =============================================================================
select set_config('teste.p1', pg_temp.pedido('{"idem":"88000001-0000-0000-0000-000000000001"}'::jsonb)::text, true);
select pg_temp.checar('pedido pago em dinheiro', 'true',
  (pg_temp.pagar(current_setting('teste.p1', true)::uuid,
    jsonb_build_array(jsonb_build_object('forma_id', current_setting('teste.dinheiro', true), 'valor', 50))) ->> 'ok'));

select pg_temp.marcar();
select pg_temp.checar('troca dinheiro -> debito na sessao aberta', 'true',
  (pg_temp.troca(current_setting('teste.p1', true)::uuid, current_setting('teste.debito', true), 50) ->> 'ok'));
select pg_temp.checar('o dinheiro sai do esperado', '-50.00', pg_temp.variacao());
select pg_temp.checar('o pagamento antigo fica estornado, com motivo', 'reversed|Troca de forma: Cliente pagou de outra forma',
  (select status || '|' || reversal_reason from public.payments
    where order_id = current_setting('teste.p1', true)::uuid and payment_method_family_snapshot = 'cash'));
select pg_temp.checar('o novo pagamento e debito, confirmado, na mesma sessao', 'confirmed|debit|true',
  (select status || '|' || payment_method_family_snapshot || '|' || (cash_session_id = current_setting('teste.sessao', true)::uuid)::text
     from public.payments where order_id = current_setting('teste.p1', true)::uuid and status = 'confirmed'));
select pg_temp.checar('o movimento de dinheiro e compensado por um estorno vinculado', '1',
  (select count(*)::text from public.cash_movements
    where order_id = current_setting('teste.p1', true)::uuid and movement_type = 'refund' and reverses_movement_id is not null
      and cash_session_id = current_setting('teste.sessao', true)::uuid));
select pg_temp.checar('o pedido continua pago', 'confirmed',
  (select payment_status from public.orders where id = current_setting('teste.p1', true)::uuid));
select pg_temp.checar('a intencao do checkout nao e tocada', 'Dinheiro',
  (select payment_method_name_snapshot from public.order_payment_intents where order_id = current_setting('teste.p1', true)::uuid));
select pg_temp.checar('sessao aberta nao gera correcao de fechamento', '0',
  (select count(*)::text from public.cash_session_corrections where cash_session_id = current_setting('teste.sessao', true)::uuid));

select pg_temp.marcar();
select pg_temp.checar('troca debito -> dinheiro', 'true',
  (pg_temp.troca(current_setting('teste.p1', true)::uuid, current_setting('teste.dinheiro', true), 50, 'Voltou a pagar em dinheiro') ->> 'ok'));
select pg_temp.checar('o dinheiro volta ao esperado', '50.00', pg_temp.variacao());

-- Recusas
select pg_temp.checar('mesma forma nao e troca', 'Essa já é a forma registrada neste pedido.',
  (pg_temp.troca(current_setting('teste.p1', true)::uuid, current_setting('teste.dinheiro', true), 50) ->> 'erro'));
select pg_temp.checar('soma diferente do pago e recusada', 'A soma das formas não fecha com o valor já pago.',
  (pg_temp.troca(current_setting('teste.p1', true)::uuid, current_setting('teste.pixmaq', true), 40) ->> 'erro'));
select pg_temp.checar('motivo e obrigatorio', 'Informe o motivo da troca.',
  (pg_temp.troca(current_setting('teste.p1', true)::uuid, current_setting('teste.pixmaq', true), 50, '') ->> 'erro'));
select set_config('teste.p_sem', pg_temp.pedido('{"idem":"88000002-0000-0000-0000-000000000002"}'::jsonb)::text, true);
select pg_temp.checar('pedido sem pagamento nao tem o que trocar', 'Este pedido não tem pagamento confirmado.',
  (pg_temp.troca(current_setting('teste.p_sem', true)::uuid, current_setting('teste.pixmaq', true), 50) ->> 'erro'));

-- Idempotência: a mesma tentativa não troca duas vezes.
select pg_temp.troca(current_setting('teste.p1', true)::uuid, current_setting('teste.pixmaq', true), 50, 'Pix na maquininha', '88aa0000-0000-0000-0000-000000000001');
select pg_temp.checar('reenvio da mesma tentativa nao troca de novo', 'true',
  (pg_temp.troca(current_setting('teste.p1', true)::uuid, current_setting('teste.pixmaq', true), 50, 'Pix na maquininha', '88aa0000-0000-0000-0000-000000000001') ->> 'ja_existia'));
select pg_temp.checar('so um pagamento confirmado depois do reenvio', '1',
  (select count(*)::text from public.payments where order_id = current_setting('teste.p1', true)::uuid and status = 'confirmed'));

reset role;

-- =============================================================================
-- B. SESSÃO JÁ FECHADA — o caso do dia 22/10
-- =============================================================================
-- Pedido pago em DÉBITO por engano; na gaveta entrou dinheiro. O contado inclui
-- esses R$ 50 e o sistema esperava 50 a menos.
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-1111-1111-1111-111111111111","role":"authenticated"}';

select set_config('teste.p2', pg_temp.pedido('{"idem":"88000003-0000-0000-0000-000000000003"}'::jsonb)::text, true);
select pg_temp.pagar(current_setting('teste.p2', true)::uuid,
  jsonb_build_array(jsonb_build_object('forma_id', current_setting('teste.debito', true), 'valor', 50,
    'bandeira_id', 'e8e8e8e8-0000-0000-0000-000000000001')));
select set_config('teste.esp_antes', public.esperado_em_caixa(current_setting('teste.sessao', true)::uuid)::text, true);
select set_config('teste.recebido_em', (select received_at::text from public.payments
  where order_id = current_setting('teste.p2', true)::uuid and status = 'confirmed'), true);

select pg_temp.checar('fecha a sessao contando 50 a mais que o esperado', 'true',
  (public.fechar_caixa(jsonb_build_object('contado', current_setting('teste.esp_antes', true)::numeric + 50,
    'justificativa', 'Pedido lançado como débito, foi dinheiro') ) ->> 'ok'));
select pg_temp.checar('a diferenca do fechamento e +50', '50.00',
  (select difference_amount::text from public.cash_sessions where id = current_setting('teste.sessao', true)::uuid));

-- Um caixa NOVO está aberto agora. A troca não pode encostar nele.
select pg_temp.checar('abre o caixa de hoje', 'true', (public.abrir_caixa('{"fundo":30}'::jsonb) ->> 'ok'));
select set_config('teste.hoje', (select id::text from public.cash_sessions where status='open'), true);
select set_config('teste.esp_hoje', public.esperado_em_caixa(current_setting('teste.hoje', true)::uuid)::text, true);

select pg_temp.checar('troca em sessao fechada', 'true',
  (pg_temp.troca(current_setting('teste.p2', true)::uuid, current_setting('teste.dinheiro', true), 50, 'Cliente pagou em dinheiro') ->> 'ok'));

select pg_temp.checar('o caixa de hoje nao foi tocado', 'true',
  (public.esperado_em_caixa(current_setting('teste.hoje', true)::uuid) = current_setting('teste.esp_hoje', true)::numeric)::text);
select pg_temp.checar('a sessao continua fechada', 'closed',
  (select status from public.cash_sessions where id = current_setting('teste.sessao', true)::uuid));
select pg_temp.checar('o esperado do dia passa a incluir o dinheiro', 'true',
  (select (expected_cash_amount = current_setting('teste.esp_antes', true)::numeric + 50)::text
     from public.cash_sessions where id = current_setting('teste.sessao', true)::uuid));
select pg_temp.checar('a diferenca do dia zera; a contagem fisica nao muda', '0.00',
  (select difference_amount::text from public.cash_sessions where id = current_setting('teste.sessao', true)::uuid));
select pg_temp.checar('o fechamento original fica guardado', '50.00',
  (select before_snapshot ->> 'diferenca' from public.cash_session_corrections
    where cash_session_id = current_setting('teste.sessao', true)::uuid and correction_type = 'payment_change'));
select pg_temp.checar('a correcao guarda o depois e o pedido', '0.00',
  (select after_snapshot ->> 'diferenca' from public.cash_session_corrections
    where cash_session_id = current_setting('teste.sessao', true)::uuid and correction_type = 'payment_change'));
select pg_temp.checar('a receita nao muda de dia', 'true',
  (select (received_at::text = current_setting('teste.recebido_em', true))::text from public.payments
    where order_id = current_setting('teste.p2', true)::uuid and status = 'confirmed'));
select pg_temp.checar('a sessao aparece como corrigida', 'true',
  (select (e ->> 'corrigida') from jsonb_array_elements(public.sessoes_de_caixa(50)) e
    where e ->> 'sessao_id' = current_setting('teste.sessao', true)) );
select pg_temp.checar('a troca fica na auditoria, com motivo', 'Cliente pagou em dinheiro',
  (select reason from public.audit_logs where action = 'pagamento_trocar_forma'
    and entity_id = current_setting('teste.p2', true)::uuid order by created_at desc limit 1));

-- Trocar de volta CRIA uma diferença onde ela era zero: ganha justificativa.
select pg_temp.checar('trocar de volta em sessao fechada', 'true',
  (pg_temp.troca(current_setting('teste.p2', true)::uuid, current_setting('teste.debito', true), 50, 'Era débito mesmo') ->> 'ok'));
select pg_temp.checar('a diferenca volta a +50 e continua justificada', 'true',
  (select (difference_amount = 50 and length(difference_reason) >= 3)::text
     from public.cash_sessions where id = current_setting('teste.sessao', true)::uuid));
select pg_temp.checar('duas correcoes registradas', '2',
  (select count(*)::text from public.cash_session_corrections
    where cash_session_id = current_setting('teste.sessao', true)::uuid and correction_type = 'payment_change'));

reset role;

-- =============================================================================
-- C. QUEM PODE
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-3333-3333-3333-333333333333","role":"authenticated"}';
select pg_temp.checar('observador nao troca forma', 'Você não tem permissão para trocar a forma de pagamento.',
  (pg_temp.troca(current_setting('teste.p2', true)::uuid, current_setting('teste.dinheiro', true), 50) ->> 'erro'));
reset role;

set local role anon;
select pg_temp.checar('anon nao executa a troca', 'false',
  has_function_privilege('anon', 'public.trocar_forma_de_pagamento(uuid, jsonb)', 'execute')::text);
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
