-- =============================================================================
-- FOGAZZA MONTADA NO CARD
--
-- 04 RN-FOG-003, RN-FOG-009 · D-2026-09-30-102
-- Migration: 20260930120000_fogazza_montada_no_card.sql (depois da 0134–0137)
--
-- O que esta suíte prova:
--   T. fogazza não tem tamanho: o banco recusa tamanho de pizza no produto
--      fogazza, e produto com tamanho não vira fogazza;
--   U. `montar_fogazza`: exige catalog.manage, cria o tamanho de fogazza
--      quando falta, liga o card à categoria, põe e tira sabores com preço,
--      recusa sabor de outra categoria e preço zero, volta a fogazza comum e
--      deixa auditoria.
--
-- Fixtures próprias (sufixo F94). Transação com ROLLBACK: nada persiste.
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

create or replace function pg_temp.tentar(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;
grant execute on function pg_temp.tentar(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('94949494-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona94@teste.local','x',now(),now(),now()),
  ('94949494-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','semcatalogo94@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a9494949-0000-0000-0000-000000000001','Dona F94','owner',false,'active'),
  ('a9494949-0000-0000-0000-000000000003','Sem catálogo F94','counter',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b9494949-0000-0000-0000-000000000001','94949494-1111-1111-1111-111111111111','a9494949-0000-0000-0000-000000000001',true),
  ('b9494949-0000-0000-0000-000000000003','94949494-3333-3333-3333-333333333333','a9494949-0000-0000-0000-000000000003',true);
insert into public.roles (id, name, is_system, is_active)
values ('c9494949-0000-0000-0000-000000000001','Sem catálogo F94', false, true);
insert into public.user_roles (app_user_id, role_id)
select 'b9494949-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
values ('b9494949-0000-0000-0000-000000000003','c9494949-0000-0000-0000-000000000001');

-- Nenhum tamanho de fogazza ativo: a montagem precisa criar o dela.
update public.pizza_sizes set is_active = false where sold_as = 'fogazza';
update public.pizza_sizes set name = name || ' (antigo F94)' where lower(name) = 'fogazza';

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d9494949-0000-0000-0000-000000000001','Tradicional F94', 8, 2, 901);

insert into public.categories (id, name, slug, sort_order) values
  ('c4949494-0000-0000-0000-000000000001','Doces F94','doces-f94', 901),
  ('c4949494-0000-0000-0000-000000000002','Salgadas F94','salgadas-f94', 902),
  ('c4949494-0000-0000-0000-000000000003','Fogazzas F94','fogazzas-f94', 903);

insert into public.products (id, category_id, product_type, name, slug, base_price, sort_order, is_active) values
  ('e9494949-0000-0000-0000-000000000001','c4949494-0000-0000-0000-000000000001','pizza','Chocolate F94','chocolate-f94', 40.00, 1, true),
  ('e9494949-0000-0000-0000-000000000002','c4949494-0000-0000-0000-000000000001','pizza','Morango F94','morango-f94', null, 2, true),
  ('e9494949-0000-0000-0000-000000000003','c4949494-0000-0000-0000-000000000002','pizza','Calabresa F94','calabresa-f94', 45.00, 3, true),
  ('e9494949-0000-0000-0000-000000000009','c4949494-0000-0000-0000-000000000003','fogazza','Fogazza doce F94','fogazza-doce-f94', 17.00, 9, true);
insert into public.product_variants (id, product_id, size_id, price) values
  ('f9494949-0000-0000-0000-000000000021','e9494949-0000-0000-0000-000000000002','d9494949-0000-0000-0000-000000000001', 45.00);

-- -----------------------------------------------------------------------------
-- T. FOGAZZA NÃO TEM TAMANHO (RN-FOG-009)
-- -----------------------------------------------------------------------------
select pg_temp.checar('T1 produto fogazza recusa tamanho de pizza',
  'Fogazza não tem tamanho: a fogazza comum tem preço próprio, e o card vende os sabores.',
  pg_temp.tentar($q$insert into public.product_variants (product_id, size_id, price)
     values ('e9494949-0000-0000-0000-000000000009','d9494949-0000-0000-0000-000000000001', 17)$q$));
select pg_temp.checar('T2 produto com tamanho não vira fogazza',
  'Este produto tem tamanhos; fogazza não tem tamanho. Remova os tamanhos antes.',
  pg_temp.tentar($q$update public.products set product_type = 'fogazza'
     where id = 'e9494949-0000-0000-0000-000000000002'$q$));

-- -----------------------------------------------------------------------------
-- U. MONTAR A FOGAZZA
-- -----------------------------------------------------------------------------
select pg_temp.checar('U1 anon não executa a montagem', 'false',
  has_function_privilege('anon', 'public.montar_fogazza(uuid, uuid, jsonb)', 'execute')::text);

set local role authenticated;
set local request.jwt.claims = '{"sub":"94949494-3333-3333-3333-333333333333","role":"authenticated"}';
select pg_temp.checar('U2 sem catalog.manage é recusado', 'Você não tem permissão para alterar o catálogo.',
  pg_temp.tentar($q$select public.montar_fogazza('e9494949-0000-0000-0000-000000000009',
     'c4949494-0000-0000-0000-000000000001', '[]'::jsonb)$q$));
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"94949494-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('U3 a dona monta: cria o tamanho e põe 2 sabores', 'true|2|0',
  (select concat_ws('|', r ->> 'tamanho_criado', r ->> 'entram', r ->> 'saem')
     from (select public.montar_fogazza('e9494949-0000-0000-0000-000000000009',
             'c4949494-0000-0000-0000-000000000001',
             '[{"produto_id":"e9494949-0000-0000-0000-000000000001","preco":22},
               {"produto_id":"e9494949-0000-0000-0000-000000000002","preco":24}]'::jsonb) as r) t));
reset role;
select pg_temp.checar('U4 o card ficou ligado à categoria e ao tamanho "Fogazza"', 'Doces F94|Fogazza|fogazza|1',
  (select concat_ws('|', c.name, s.name, s.sold_as, s.max_flavors)
     from public.products p
     join public.categories c on c.id = p.flavor_category_id
     join public.pizza_sizes s on s.id = p.flavor_size_id
    where p.id = 'e9494949-0000-0000-0000-000000000009'));

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('U5 o cliente vê os 2 sabores com o preço de cada um', 'Chocolate F94=22.00,Morango F94=24.00',
  (select string_agg(nome || '=' || preco::text, ',' order by nome)
     from public.sabores_da_fogazza('e9494949-0000-0000-0000-000000000009')));
select pg_temp.checar('U6 a pizza de preço único continua vendendo pelo preço dela', '40.00',
  (public.montar_item('{"produto_id":"e9494949-0000-0000-0000-000000000001"}'::jsonb) ->> 'preco_unitario'));
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"94949494-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('U7 muda preço de um, tira o outro; reaproveita o tamanho', 'false|1|1',
  (select concat_ws('|', r ->> 'tamanho_criado', r ->> 'entram', r ->> 'saem')
     from (select public.montar_fogazza('e9494949-0000-0000-0000-000000000009',
             'c4949494-0000-0000-0000-000000000001',
             '[{"produto_id":"e9494949-0000-0000-0000-000000000001","preco":23},
               {"produto_id":"e9494949-0000-0000-0000-000000000002","preco":null}]'::jsonb) as r) t));
select pg_temp.checar('U8 sabor de outra categoria é recusado', 'Um dos sabores não é pizza desta categoria.',
  pg_temp.tentar($q$select public.montar_fogazza('e9494949-0000-0000-0000-000000000009',
     'c4949494-0000-0000-0000-000000000001',
     '[{"produto_id":"e9494949-0000-0000-0000-000000000003","preco":20}]'::jsonb)$q$));
select pg_temp.checar('U9 preço zero é recusado', 'Informe um preço maior que zero para cada sabor que entra.',
  pg_temp.tentar($q$select public.montar_fogazza('e9494949-0000-0000-0000-000000000009',
     'c4949494-0000-0000-0000-000000000001',
     '[{"produto_id":"e9494949-0000-0000-0000-000000000001","preco":0}]'::jsonb)$q$));
reset role;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('U10 fica só o sabor que entrou, com o preço novo', 'Chocolate F94=23.00',
  (select string_agg(nome || '=' || preco::text, ',' order by nome)
     from public.sabores_da_fogazza('e9494949-0000-0000-0000-000000000009')));
reset role;
select pg_temp.checar('U11 o sabor que saiu fica com a variação desativada, não apagada', 'false|24.00',
  (select pv.is_active::text || '|' || pv.price::text from public.product_variants pv
     join public.pizza_sizes s on s.id = pv.size_id and s.name = 'Fogazza'
    where pv.product_id = 'e9494949-0000-0000-0000-000000000002'));
select pg_temp.checar('U12 um só tamanho de fogazza ativo', '1',
  (select count(*)::text from public.pizza_sizes where sold_as = 'fogazza' and is_active));

set local role authenticated;
set local request.jwt.claims = '{"sub":"94949494-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('U13 sem categoria volta a ser fogazza comum', 'true',
  (public.montar_fogazza('e9494949-0000-0000-0000-000000000009', null, '[]'::jsonb) ->> 'fogazza_comum'));
reset role;
select pg_temp.checar('U14 ...com o card desligado', 'nulo',
  (select coalesce(flavor_category_id::text, 'nulo') from public.products
    where id = 'e9494949-0000-0000-0000-000000000009'));
select pg_temp.checar('U15 a montagem ficou na auditoria, com quem fez', 'Dona F94|3',
  (select min(e.full_name) || '|' || count(*)
     from public.audit_logs a join public.employees e on e.id = a.actor_employee_id
    where a.action = 'fogazza_montar' and a.entity_id = 'e9494949-0000-0000-0000-000000000009'));

-- -----------------------------------------------------------------------------
-- RESULTADO
-- -----------------------------------------------------------------------------
select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
