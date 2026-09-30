-- =============================================================================
-- FOGAZZA POR SABOR — ENTREGA 1 (modelo, integridade e blindagem)
--
-- 04 RN-FOG-002..006 · D-2026-09-29-98
-- Migration: 20260929150000_fogazza_por_sabor.sql
--
-- O que esta suíte prova:
--   A. o tamanho de fogazza aceita 1 sabor e não tem borda;
--   B. só sabor de pizza usa o tamanho de fogazza, e o card de entrada só
--      aponta para tamanho de fogazza;
--   C. copiar os preços de adicionais exige `catalog.manage`, sobrescreve o
--      destino e deixa auditoria;
--   D. o cardápio público continua igual para a pizza: não oferece o tamanho
--      de fogazza, o preço "a partir de" não cai para o da fogazza, a promoção
--      da fogazza não marca a pizza, e o card de entrada não aparece;
--   E. o motor que já existe calcula a fogazza: preço do sabor, sem meio a
--      meio, sem borda, com adicional pelo preço do tamanho de fogazza.
--
-- Fixtures próprias (sufixo F98). Transação com ROLLBACK: nada persiste.
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

-- Executa um comando e devolve 'ok' ou a mensagem do erro.
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
  ('98989898-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona98@teste.local','x',now(),now(),now()),
  ('98989898-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','semcatalogo98@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a9898989-0000-0000-0000-000000000001','Dona F98','owner',false,'active'),
  ('a9898989-0000-0000-0000-000000000003','Sem catálogo F98','counter',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b9898989-0000-0000-0000-000000000001','98989898-1111-1111-1111-111111111111','a9898989-0000-0000-0000-000000000001',true),
  ('b9898989-0000-0000-0000-000000000003','98989898-3333-3333-3333-333333333333','a9898989-0000-0000-0000-000000000003',true);
insert into public.roles (id, name, is_system, is_active)
values ('c9898989-0000-0000-0000-000000000001','Sem catálogo F98', false, true);
insert into public.user_roles (app_user_id, role_id)
select 'b9898989-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
values ('b9898989-0000-0000-0000-000000000003','c9898989-0000-0000-0000-000000000001');

-- Tamanhos: uma pizza Tradicional, uma Fogazza.
insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d9898989-0000-0000-0000-000000000001','Tradicional F98', 8, 2, 901);
insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order, sold_as) values
  ('d9898989-0000-0000-0000-000000000002','Fogazza F98', 1, 1, 902, 'fogazza');

insert into public.categories (id, name, slug, sort_order) values
  ('c8989898-0000-0000-0000-000000000001','Pizzas F98','pizzas-f98', 901),
  ('c8989898-0000-0000-0000-000000000002','Fogazza F98','fogazza-f98', 902),
  ('c8989898-0000-0000-0000-000000000003','Bebidas F98','bebidas-f98', 903);

insert into public.products (id, category_id, product_type, name, slug, short_description, base_price, sort_order, is_active) values
  ('e9898989-0000-0000-0000-000000000001','c8989898-0000-0000-0000-000000000001','pizza','Calabresa F98','calabresa-f98','Calabresa e cebola', null, 1, true),
  ('e9898989-0000-0000-0000-000000000002','c8989898-0000-0000-0000-000000000001','pizza','Mussarela F98','mussarela-f98','Mussarela', null, 2, true),
  ('e9898989-0000-0000-0000-000000000004','c8989898-0000-0000-0000-000000000003','drink','Guaraná F98','guarana-f98','Gelado', 10.00, 4, true);

-- A pizza custa 50; a fogazza do mesmo sabor, 17 — mais barata de propósito.
insert into public.product_variants (id, product_id, size_id, price) values
  ('f9898989-0000-0000-0000-000000000011','e9898989-0000-0000-0000-000000000001','d9898989-0000-0000-0000-000000000001', 50.00),
  ('f9898989-0000-0000-0000-000000000012','e9898989-0000-0000-0000-000000000001','d9898989-0000-0000-0000-000000000002', 17.00),
  ('f9898989-0000-0000-0000-000000000021','e9898989-0000-0000-0000-000000000002','d9898989-0000-0000-0000-000000000001', 45.00),
  ('f9898989-0000-0000-0000-000000000022','e9898989-0000-0000-0000-000000000002','d9898989-0000-0000-0000-000000000002', 19.00);

-- Promoção só na FOGAZZA de calabresa.
insert into public.promotions (id, name, target_type, variant_id, promotional_price, starts_at, ends_at) values
  ('19898989-0000-0000-0000-000000000001','Promo fogazza F98','variant','f9898989-0000-0000-0000-000000000012', 15.00, now() - interval '1 day', now() + interval '7 days');

insert into public.addons (id, name) values
  ('a8989898-0000-0000-0000-000000000001','Bacon F98'),
  ('a8989898-0000-0000-0000-000000000002','Cheddar F98');
insert into public.addon_size_prices (addon_id, size_id, price) values
  ('a8989898-0000-0000-0000-000000000001','d9898989-0000-0000-0000-000000000001', 6.00),
  ('a8989898-0000-0000-0000-000000000002','d9898989-0000-0000-0000-000000000001', 4.00),
  -- Já existe um preço antigo na fogazza: a cópia tem de sobrescrevê-lo.
  ('a8989898-0000-0000-0000-000000000001','d9898989-0000-0000-0000-000000000002', 99.00);

insert into public.crusts (id, name) values ('cb898989-0000-0000-0000-000000000001','Catupiry F98');

-- -----------------------------------------------------------------------------
-- A. O TAMANHO DE FOGAZZA
-- -----------------------------------------------------------------------------
select pg_temp.checar('A1 tamanhos existentes nascem como pizza', 'pizza',
  (select sold_as from public.pizza_sizes where id = 'd9898989-0000-0000-0000-000000000001'));
select pg_temp.checar('A2 fogazza com 2 sabores é recusada', 'recusado',
  (select case when pg_temp.tentar($q$insert into public.pizza_sizes (name, slice_count, max_flavors, sold_as)
     values ('Fogazza dupla F98', 1, 2, 'fogazza')$q$) = 'ok' then 'aceito' else 'recusado' end));
select pg_temp.checar('A3 "vendido como" desconhecido é recusado', 'recusado',
  (select case when pg_temp.tentar($q$insert into public.pizza_sizes (name, slice_count, max_flavors, sold_as)
     values ('Calzone F98', 1, 1, 'calzone')$q$) = 'ok' then 'aceito' else 'recusado' end));
select pg_temp.checar('A4 borda no tamanho de fogazza é recusada',
  'Fogazza não tem borda: o tamanho de fogazza não recebe preço de borda.',
  pg_temp.tentar($q$insert into public.crust_size_prices (crust_id, size_id, price)
     values ('cb898989-0000-0000-0000-000000000001','d9898989-0000-0000-0000-000000000002', 8)$q$));
select pg_temp.checar('A5 borda no tamanho de pizza continua aceita', 'ok',
  pg_temp.tentar($q$insert into public.crust_size_prices (crust_id, size_id, price)
     values ('cb898989-0000-0000-0000-000000000001','d9898989-0000-0000-0000-000000000001', 8)$q$));
select pg_temp.checar('A6 tamanho de pizza com borda não pode virar fogazza',
  'Este tamanho tem preço de borda; fogazza não tem borda.',
  pg_temp.tentar($q$update public.pizza_sizes set sold_as = 'fogazza', max_flavors = 1
     where id = 'd9898989-0000-0000-0000-000000000001'$q$));

-- -----------------------------------------------------------------------------
-- B. QUEM USA O TAMANHO DE FOGAZZA
-- -----------------------------------------------------------------------------
select pg_temp.checar('B1 bebida não recebe o tamanho de fogazza',
  'O tamanho de fogazza só pode ser habilitado em sabores de pizza.',
  pg_temp.tentar($q$insert into public.product_variants (product_id, size_id, price)
     values ('e9898989-0000-0000-0000-000000000004','d9898989-0000-0000-0000-000000000002', 5)$q$));
select pg_temp.checar('B2 sabor com preço de fogazza não deixa de ser pizza',
  'Este sabor tem preço de fogazza: ele precisa continuar sendo do tipo pizza.',
  pg_temp.tentar($q$update public.products set product_type = 'drink'
     where id = 'e9898989-0000-0000-0000-000000000001'$q$));
select pg_temp.checar('B3 card de entrada de fogazza é aceito', 'ok',
  pg_temp.tentar($q$insert into public.products (id, category_id, product_type, name, slug, sort_order,
       flavor_category_id, flavor_size_id)
     values ('e9898989-0000-0000-0000-000000000009','c8989898-0000-0000-0000-000000000002','fogazza',
       'Fogazza salgada F98','fogazza-salgada-f98', 1,
       'c8989898-0000-0000-0000-000000000001','d9898989-0000-0000-0000-000000000002')$q$));
select pg_temp.checar('B4 card apontando para tamanho de PIZZA é recusado',
  'O tamanho escolhido não é um tamanho de fogazza.',
  pg_temp.tentar($q$update public.products set flavor_size_id = 'd9898989-0000-0000-0000-000000000001'
     where id = 'e9898989-0000-0000-0000-000000000009'$q$));
select pg_temp.checar('B5 escolha de sabor só em produto do tipo fogazza', 'recusado',
  (select case when pg_temp.tentar($q$update public.products
       set flavor_category_id = 'c8989898-0000-0000-0000-000000000001',
           flavor_size_id = 'd9898989-0000-0000-0000-000000000002'
     where id = 'e9898989-0000-0000-0000-000000000004'$q$) = 'ok' then 'aceito' else 'recusado' end));
select pg_temp.checar('B6 categoria sem tamanho (ou o contrário) é recusada', 'recusado',
  (select case when pg_temp.tentar($q$update public.products set flavor_size_id = null
     where id = 'e9898989-0000-0000-0000-000000000009'$q$) = 'ok' then 'aceito' else 'recusado' end));
select pg_temp.checar('B7 tamanho usado por card não deixa de ser fogazza',
  'Este tamanho é usado por um card de fogazza e não pode deixar de ser fogazza.',
  pg_temp.tentar($q$update public.pizza_sizes set sold_as = 'pizza'
     where id = 'd9898989-0000-0000-0000-000000000002'$q$));

-- -----------------------------------------------------------------------------
-- C. COPIAR PREÇOS DE ADICIONAIS
-- -----------------------------------------------------------------------------
select pg_temp.checar('C1 anon não executa a cópia', 'false',
  has_function_privilege('anon', 'public.copiar_precos_adicionais(uuid, uuid)', 'execute')::text);

set local role authenticated;
set local request.jwt.claims = '{"sub":"98989898-3333-3333-3333-333333333333","role":"authenticated"}';
select pg_temp.checar('C2 sem catalog.manage a cópia é recusada',
  'Você não tem permissão para alterar o catálogo.',
  pg_temp.tentar($q$select public.copiar_precos_adicionais('d9898989-0000-0000-0000-000000000001','d9898989-0000-0000-0000-000000000002')$q$));
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"98989898-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('C3 a dona copia os 2 adicionais da Tradicional', '2',
  (public.copiar_precos_adicionais('d9898989-0000-0000-0000-000000000001','d9898989-0000-0000-0000-000000000002') ->> 'copiados'));
select pg_temp.checar('C4 mesmo tamanho nos dois lados é recusado', 'Escolha dois tamanhos diferentes.',
  pg_temp.tentar($q$select public.copiar_precos_adicionais('d9898989-0000-0000-0000-000000000001','d9898989-0000-0000-0000-000000000001')$q$));
reset role;

select pg_temp.checar('C5 o preço antigo da fogazza foi sobrescrito (99 → 6)', '6.00',
  (select price::text from public.addon_size_prices
    where addon_id = 'a8989898-0000-0000-0000-000000000001' and size_id = 'd9898989-0000-0000-0000-000000000002'));
select pg_temp.checar('C6 o adicional que faltava foi criado (4,00)', '4.00',
  (select price::text from public.addon_size_prices
    where addon_id = 'a8989898-0000-0000-0000-000000000002' and size_id = 'd9898989-0000-0000-0000-000000000002'));
select pg_temp.checar('C7 a cópia ficou na auditoria, com quem fez', 'Dona F98',
  (select e.full_name from public.audit_logs a join public.employees e on e.id = a.actor_employee_id
    where a.action = 'adicionais_copiar_precos' and a.entity_id = 'd9898989-0000-0000-0000-000000000002'
    order by a.created_at desc limit 1));

-- -----------------------------------------------------------------------------
-- D. BLINDAGEM DO CARDÁPIO (como o cliente, anônimo)
-- -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('D1 a página da pizza não oferece o tamanho de fogazza', 'Tradicional F98',
  (select string_agg(tamanho_nome, ',') from public.tamanhos_publicos('e9898989-0000-0000-0000-000000000001')));
select pg_temp.checar('D2 "a partir de" da pizza ignora a fogazza mais barata', '50.00',
  (select preco::text from public.cardapio_publico() where slug = 'calabresa-f98'));
select pg_temp.checar('D3 promoção só na fogazza não marca a pizza em promoção', 'false',
  (select em_promocao::text from public.cardapio_publico() where slug = 'calabresa-f98'));
select pg_temp.checar('D4 card de entrada fora do cardápio até a entrega 2', '0',
  (select count(*)::text from public.cardapio_publico() where slug = 'fogazza-salgada-f98'));
select pg_temp.checar('D5 ...e fora do link direto', '0',
  (select count(*)::text from public.produto_publico('fogazza-salgada-f98')));
select pg_temp.checar('D6 ...e fora da busca', '0',
  (select count(*)::text from public.buscar_catalogo('fogazza salgada f98')));
select pg_temp.checar('D7 buscar "fogazza" não devolve a PIZZA de calabresa', '0',
  (select count(*)::text from public.buscar_catalogo('fogazza calabresa f98')));
select pg_temp.checar('D8 a busca da pizza continua achando e cobrando a pizza', '50.00',
  (select preco::text from public.buscar_catalogo('calabresa f98') where slug = 'calabresa-f98'));
select pg_temp.checar('D9 sabores do tamanho de fogazza: os 2, com o preço de fogazza', 'Calabresa F98=15.00,Mussarela F98=19.00',
  (select string_agg(s.nome || '=' || s.preco::text, ',' order by s.nome)
     from public.sabores_publicos('d9898989-0000-0000-0000-000000000002') s
    where s.slug like '%-f98'));

-- -----------------------------------------------------------------------------
-- E. O MOTOR JÁ EXISTENTE CALCULA A FOGAZZA
-- -----------------------------------------------------------------------------
select pg_temp.checar('E1 fogazza de calabresa: preço do sabor, com a promoção', '15.00',
  (public.montar_item('{"produto_id":"e9898989-0000-0000-0000-000000000001","variacao_id":"f9898989-0000-0000-0000-000000000012"}'::jsonb) ->> 'preco_unitario'));
select pg_temp.checar('E2 fogazza não aceita meio a meio',
  'Este tamanho não aceita essa quantidade de sabores.',
  (public.montar_item('{"produto_id":"e9898989-0000-0000-0000-000000000001","variacao_id":"f9898989-0000-0000-0000-000000000012","sabores":["f9898989-0000-0000-0000-000000000012","f9898989-0000-0000-0000-000000000022"]}'::jsonb) ->> 'erro'));
select pg_temp.checar('E3 fogazza não aceita borda',
  'Esta borda não está disponível para o tamanho escolhido.',
  (public.montar_item('{"produto_id":"e9898989-0000-0000-0000-000000000001","variacao_id":"f9898989-0000-0000-0000-000000000012","borda_id":"cb898989-0000-0000-0000-000000000001"}'::jsonb) ->> 'erro'));
select pg_temp.checar('E4 adicional cobrado pelo preço copiado (15 + 6)', '21.00',
  (public.montar_item('{"produto_id":"e9898989-0000-0000-0000-000000000001","variacao_id":"f9898989-0000-0000-0000-000000000012","adicionais":["a8989898-0000-0000-0000-000000000001"]}'::jsonb) ->> 'preco_unitario'));
reset role;

-- Acabou o ingrediente: o sabor esgotado some da pizza E da fogazza.
update public.products set is_temporarily_available = false
 where id = 'e9898989-0000-0000-0000-000000000002';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('E5 sabor esgotado: a fogazza dele fica indisponível', 'false',
  (select disponivel::text from public.sabores_publicos('d9898989-0000-0000-0000-000000000002')
    where slug = 'mussarela-f98'));
select pg_temp.checar('E6 ...e a pizza também', 'false',
  (select disponivel::text from public.cardapio_publico() where slug = 'mussarela-f98'));
reset role;

-- Pausar SÓ a fogazza não mexe na pizza.
update public.products set is_temporarily_available = true
 where id = 'e9898989-0000-0000-0000-000000000002';
update public.product_variants set is_temporarily_available = false
 where id = 'f9898989-0000-0000-0000-000000000022';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('E7 fogazza pausada: indisponível na lista de sabores', 'false',
  (select disponivel::text from public.sabores_publicos('d9898989-0000-0000-0000-000000000002')
    where slug = 'mussarela-f98'));
select pg_temp.checar('E8 ...e a pizza continua à venda', 'true',
  (select disponivel::text from public.tamanhos_publicos('e9898989-0000-0000-0000-000000000002')
    where tamanho_nome = 'Tradicional F98'));
reset role;

-- -----------------------------------------------------------------------------
-- RESULTADO
-- -----------------------------------------------------------------------------
select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
