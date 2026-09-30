-- =============================================================================
-- O ENDEREÇO SALVO USADO NO PEDIDO TEM DE SER DO PRÓPRIO CLIENTE
--
-- D-2026-09-30-105 · Migration: 20260930180000_endereco_salvo_do_proprio_cliente.sql
--
-- `criar_pedido` só aproveita `endereco.id` se for de um endereço ATIVO do
-- cliente do pedido. Id alheio, inativo ou inventado vira endereço novo do
-- cliente certo — o pedido não é recusado.
--
-- A regra está no bloco de endereço, comum ao público e ao balcão; aqui é
-- exercitada pelo caminho interno, que dispensa o segredo de origem.
-- Fixtures próprias (sufixo F91). Transação com ROLLBACK: nada persiste.
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
values ('91919191-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona91@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status)
values ('a9191919-0000-0000-0000-000000000001','Dona F91','owner',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active)
values ('b9191919-0000-0000-0000-000000000001','91919191-1111-1111-1111-111111111111','a9191919-0000-0000-0000-000000000001',true);
insert into public.user_roles (app_user_id, role_id)
select 'b9191919-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';

-- A configuração da loja é ajustada, não recriada: apagá-la esbarraria em
-- caixa e movimentos já existentes no banco.
update public.store_settings
   set latitude = -23.5, longitude = -46.6, automatic_delivery_radius_km = 4.0,
       delivery_minimum_enabled = false;
delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;
delete from public.delivery_fee_bands;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 4, 5.00, true, 1);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d9191919-0000-0000-0000-000000000001','Grande F91', 8, 2, 901);
insert into public.categories (id, name, slug, sort_order) values
  ('c1919191-0000-0000-0000-000000000001','Pizzas F91','pizzas-f91', 901);
insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active) values
  ('e9191919-0000-0000-0000-000000000001','c1919191-0000-0000-0000-000000000001','pizza','Calabresa F91','calabresa-f91', 1, true);
insert into public.product_variants (id, product_id, size_id, price) values
  ('f9191919-0000-0000-0000-000000000001','e9191919-0000-0000-0000-000000000001','d9191919-0000-0000-0000-000000000001', 40.00);

-- A: o cliente do pedido, com um endereço ativo e um inativo.
-- B: outra pessoa, com endereço salvo.
insert into public.customers (id, name, whatsapp_normalized) values
  ('09191919-0000-0000-0000-00000000000a','Cliente A F91','11990000091'),
  ('09191919-0000-0000-0000-00000000000b','Cliente B F91','11990000191');
insert into public.customer_addresses (id, customer_id, street, number, neighborhood, city, state, is_active) values
  ('19191919-0000-0000-0000-0000000000a1','09191919-0000-0000-0000-00000000000a','Rua A1 F91','1','Centro','Cidade','XX', true),
  ('19191919-0000-0000-0000-0000000000a2','09191919-0000-0000-0000-00000000000a','Rua A2 F91','2','Centro','Cidade','XX', false),
  ('19191919-0000-0000-0000-0000000000b1','09191919-0000-0000-0000-00000000000b','Rua B1 F91','3','Centro','Cidade','XX', true);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);

-- Pedido de entrega do cliente A mandando o `endereco.id` dado.
create or replace function pg_temp.pedido_de_a(p_endereco_id text, p_rua text)
returns jsonb language plpgsql as $$
declare v_idem text := gen_random_uuid()::text;
begin
  return public.criar_pedido(jsonb_build_object(
    'idempotency_key', v_idem,
    'tracking_token', md5(v_idem) || md5(v_idem || ':2'),
    'origem', 'phone',
    'modalidade', 'delivery',
    'cliente', jsonb_build_object('nome','Cliente A F91','whatsapp','(11) 99000-0091'),
    'endereco', jsonb_build_object('id', p_endereco_id,
      'logradouro', p_rua, 'numero','9','bairro','Centro','cidade','Cidade','uf','XX',
      'latitude',-23.51,'longitude',-46.61,'confianca','exata','provedor','teste'),
    'rota', jsonb_build_object('distancia_km', 2.0, 'provedor','teste'),
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id','e9191919-0000-0000-0000-000000000001',
      'variacao_id','f9191919-0000-0000-0000-000000000001','quantidade', 1)),
    'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))
  ), '');
end;
$$;
grant execute on function pg_temp.pedido_de_a(text, text) to authenticated;

create or replace function pg_temp.endereco_do_pedido(p jsonb) returns text
language sql as $$
  select o.delivery_address_snapshot ->> 'endereco_id' from public.orders o
   where o.id = (p ->> 'pedido_id')::uuid
$$;

-- -----------------------------------------------------------------------------
-- E. O DONO DO ENDEREÇO
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"91919191-1111-1111-1111-111111111111","role":"authenticated"}';
create temporary table r91 (caso text, r jsonb) on commit drop;
insert into r91 values
  ('proprio',   pg_temp.pedido_de_a('19191919-0000-0000-0000-0000000000a1', 'Rua A1 F91')),
  ('alheio',    pg_temp.pedido_de_a('19191919-0000-0000-0000-0000000000b1', 'Rua Nova B F91')),
  ('inativo',   pg_temp.pedido_de_a('19191919-0000-0000-0000-0000000000a2', 'Rua Nova I F91')),
  ('inventado', pg_temp.pedido_de_a(gen_random_uuid()::text, 'Rua Nova X F91'));
reset role;

select pg_temp.checar('E1 os quatro pedidos foram criados (nenhum é recusado)', 'true,true,true,true',
  (select string_agg(r ->> 'ok', ',' order by caso) from r91));
select pg_temp.checar('E2 endereço ativo do próprio cliente é reaproveitado', '19191919-0000-0000-0000-0000000000a1',
  (select pg_temp.endereco_do_pedido(r) from r91 where caso = 'proprio'));
select pg_temp.checar('E3 id de outro cliente não entra no pedido', 'Rua Nova B F91|09191919-0000-0000-0000-00000000000a',
  (select a.street || '|' || a.customer_id from r91
     join public.customer_addresses a on a.id::text = pg_temp.endereco_do_pedido(r)
    where caso = 'alheio'));
select pg_temp.checar('E4 ...e o endereço do outro cliente fica intacto', 'Rua B1 F91|09191919-0000-0000-0000-00000000000b',
  (select street || '|' || customer_id from public.customer_addresses
    where id = '19191919-0000-0000-0000-0000000000b1'));
select pg_temp.checar('E5 endereço inativo do cliente vira endereço novo', 'Rua Nova I F91|true',
  (select a.street || '|' || a.is_active from r91
     join public.customer_addresses a on a.id::text = pg_temp.endereco_do_pedido(r)
    where caso = 'inativo'));
select pg_temp.checar('E6 id inventado vira endereço novo, salvo para o cliente', 'Rua Nova X F91|09191919-0000-0000-0000-00000000000a',
  (select a.street || '|' || a.customer_id from r91
     join public.customer_addresses a on a.id::text = pg_temp.endereco_do_pedido(r)
    where caso = 'inventado'));
select pg_temp.checar('E7 criar_pedido segue DEFINER e executável pelo público', 'true|true',
  (select p.prosecdef::text || '|' || has_function_privilege('anon', p.oid, 'execute')::text
     from pg_proc p where p.proname = 'criar_pedido' and p.pronamespace = 'public'::regnamespace));

-- -----------------------------------------------------------------------------
-- RESULTADO
-- -----------------------------------------------------------------------------
select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
