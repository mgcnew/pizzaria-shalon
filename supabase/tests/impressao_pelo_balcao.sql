-- =============================================================================
-- TESTES DA IMPRESSÃO PELO BALCÃO — D-2026-10-08-116 (entrega 3)
--
-- Migration 0147 · 04-REGRAS-NEGOCIO.md RN-PRINT-001..006 · CLAUDE.md §34
--
-- O QUE ESTE ARQUIVO RESPONDE:
--   1. o pedido de impressão para o balcão leva o documento inteiro?
--   2. só UM aparelho consegue pegar cada pedido (sem imprimir duas vezes)?
--   3. pedido velho é recusado em vez de imprimir fora de hora?
--   4. quem não é da equipe não pega nada?
--
-- Preparo copiado de `operacao_fase6.sql`: pedido criado pelo caminho real
-- do cliente e aceito pela Atendente. Transação com ROLLBACK.
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

-- Diferente de `operacao_fase6.sql`, este teste NÃO mexe no caixa: não
-- precisa dele, e o DEV tem pagamentos ligados às sessões (apagá-las viola
-- `payments_cash_session_id_fkey`).

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
values (true, 'telefone', '+5500000000000', 'Pizzaria Shalon BAL');
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

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select set_config('teste.pedido', (pg_temp.criar('{"idem":"77000001-0000-0000-0000-000000000001","modalidade":"pickup"}'::jsonb) ->> 'pedido_id'), true);
select set_config('teste.nao_aceito', (pg_temp.criar('{"idem":"77000002-0000-0000-0000-000000000002","modalidade":"pickup"}'::jsonb) ->> 'pedido_id'), true);
reset role;

-- =============================================================================
-- ATENDENTE (no celular) pede a impressão ao balcão
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.comando(current_setting('teste.pedido', true)::uuid, 'aceitar');

select pg_temp.checar('balcao sem linhas e recusado', 'Documento sem linhas para o balcão.',
  (public.registrar_impressao(current_setting('teste.pedido', true)::uuid, 'comanda',
    'PEDIDO #1', 'balcao-80mm') ->> 'erro'));

select pg_temp.checar('balcao continua exigindo pedido aceito', 'A comanda só sai depois que o pedido for aceito.',
  (public.registrar_impressao(current_setting('teste.nao_aceito', true)::uuid, 'comanda',
    'PEDIDO #2', 'balcao-80mm', '[{"texto":"PEDIDO #2","estilo":"titulo"}]'::jsonb) ->> 'erro'));

select set_config('teste.imp', (public.registrar_impressao(
  current_setting('teste.pedido', true)::uuid, 'comanda', 'PEDIDO #1',
  'balcao-80mm', '[{"texto":"PEDIDO #1","estilo":"titulo"},{"texto":"1x Calabresa","estilo":"normal"}]'::jsonb)
  ->> 'impressao_id'), true);

select pg_temp.checar('pedido ao balcao nasce SOLICITADO', 'requested',
  (select status from public.order_prints where id = current_setting('teste.imp', true)::uuid));

select pg_temp.checar('pedido ao balcao guarda as linhas inteiras', '2',
  (select jsonb_array_length(content_lines)::text from public.order_prints
    where id = current_setting('teste.imp', true)::uuid));

-- Fora do balcão, as linhas não são guardadas: nada muda para quem já usava.
select set_config('teste.imp_sistema', (public.registrar_impressao(
  current_setting('teste.pedido', true)::uuid, 'comanda', 'PEDIDO #1', 'sistema-80mm',
  '[{"texto":"x","estilo":"normal"}]'::jsonb) ->> 'impressao_id'), true);

select pg_temp.checar('fora do balcao nao guarda linhas', 'true',
  (select (content_lines is null)::text from public.order_prints
    where id = current_setting('teste.imp_sistema', true)::uuid));

select pg_temp.checar('a chamada antiga, sem linhas, continua funcionando', 'true',
  ((public.registrar_impressao(current_setting('teste.pedido', true)::uuid, 'comanda',
    'PEDIDO #1', 'tela') ->> 'ok'))::text);

select pg_temp.checar('impressao que nao e do balcao nao e pega', 'Impressão não encontrada.',
  (public.pegar_impressao_do_balcao(current_setting('teste.imp_sistema', true)::uuid) ->> 'erro'));

reset role;

-- =============================================================================
-- Quem não é da equipe não pega
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

select pg_temp.checar('autenticado sem usuario interno nao pega', 'Sessão não identificada.',
  (public.pegar_impressao_do_balcao(current_setting('teste.imp', true)::uuid) ->> 'erro'));

reset role;

select pg_temp.checar('anon nao executa pegar_impressao_do_balcao', 'false',
  has_function_privilege('anon', 'public.pegar_impressao_do_balcao(uuid)', 'execute')::text);

-- =============================================================================
-- O NOTEBOOK (logado como a dona) pega
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('balcao pega e recebe as linhas', 'PEDIDO #1',
  (public.pegar_impressao_do_balcao(current_setting('teste.imp', true)::uuid) -> 'linhas' -> 0 ->> 'texto'));

reset role;

select pg_temp.checar('depois de pego fica ENVIADO', 'sent',
  (select status from public.order_prints where id = current_setting('teste.imp', true)::uuid));

select pg_temp.checar('registra quem estava no balcao', 'b6b6b6b6-0000-0000-0000-000000000001',
  (select sent_by::text from public.order_prints where id = current_setting('teste.imp', true)::uuid));

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-2222-2222-2222-222222222222","role":"authenticated"}';

-- §34: o segundo aparelho (ou o mesmo evento de novo) não imprime outra vez.
select pg_temp.checar('segundo balcao nao pega o mesmo pedido', 'ja_pega',
  (public.pegar_impressao_do_balcao(current_setting('teste.imp', true)::uuid) ->> 'motivo'));

-- O celular continua podendo dizer se saiu no papel.
select pg_temp.checar('quem pediu confirma que saiu', 'confirmed',
  (public.atualizar_impressao(current_setting('teste.imp', true)::uuid, 'confirmed') ->> 'status'));

-- Pedido velho: não imprime, vira erro com motivo.
select set_config('teste.imp_velha', (public.registrar_impressao(
  current_setting('teste.pedido', true)::uuid, 'comanda', 'PEDIDO #1',
  'balcao-80mm', '[{"texto":"PEDIDO #1","estilo":"titulo"}]'::jsonb) ->> 'impressao_id'), true);

reset role;
update public.order_prints set requested_at = now() - interval '3 minutes'
 where id = current_setting('teste.imp_velha', true)::uuid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('pedido com mais de 2 minutos nao imprime', 'expirou',
  (public.pegar_impressao_do_balcao(current_setting('teste.imp_velha', true)::uuid) ->> 'motivo'));

reset role;

select pg_temp.checar('pedido velho fica como erro, com motivo', 'error',
  (select status from public.order_prints where id = current_setting('teste.imp_velha', true)::uuid));

select pg_temp.checar('order_prints esta na publicacao do realtime', 'true',
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and tablename = 'order_prints')::text);

-- =============================================================================
select n, cenario, esperado, obtido, case when passou then 'OK' else 'FALHOU' end
from resultado_teste order by n;

select 'TOTAL: ' || count(*) || ' cenarios | PASSARAM: ' || count(*) filter (where passou)
  || ' | FALHARAM: ' || count(*) filter (where not passou)
from resultado_teste;

rollback;
