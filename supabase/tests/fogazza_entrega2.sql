-- =============================================================================
-- FOGAZZA POR SABOR — ENTREGA 2 (vitrine)
--
-- 04 RN-FOG-003, RN-FOG-006, RN-FOG-007 · D-2026-09-29-99
-- Migration: 20260929160000_fogazza_vitrine.sql (depois da 0134)
--
-- O que esta suíte prova:
--   F. o card de entrada aparece no cardápio, no link direto e na busca, com
--      o "a partir de" dos sabores, e lista só os sabores da categoria dele;
--   G. a disponibilidade: card pausado (ou a categoria dele) pausa as
--      fogazzas, inclusive no motor de preço; sem card, a fogazza não se
--      vende; a pizza com os tamanhos de pizza pausados sai do cardápio sem
--      levar a fogazza junto;
--   H. o painel vê o mesmo que o cliente, e as leituras novas são públicas.
--
-- Fixtures próprias (sufixo F97). Transação com ROLLBACK: nada persiste.
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
values ('97979797-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona97@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status)
values ('a9797979-0000-0000-0000-000000000001','Dona F97','owner',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active)
values ('b9797979-0000-0000-0000-000000000001','97979797-1111-1111-1111-111111111111','a9797979-0000-0000-0000-000000000001',true);
insert into public.user_roles (app_user_id, role_id)
select 'b9797979-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d9797979-0000-0000-0000-000000000001','Tradicional F97', 8, 2, 901);
insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order, sold_as) values
  ('d9797979-0000-0000-0000-000000000002','Fogazza F97', 1, 1, 902, 'fogazza');

insert into public.categories (id, name, slug, sort_order) values
  ('c7979797-0000-0000-0000-000000000001','Pizzas F97','pizzas-f97', 901),
  ('c7979797-0000-0000-0000-000000000002','Doces F97','doces-f97', 902),
  ('c7979797-0000-0000-0000-000000000003','Fogazzas F97','fogazzas-f97', 903);

insert into public.products (id, category_id, product_type, name, slug, short_description, base_price, sort_order, is_active) values
  ('e9797979-0000-0000-0000-000000000001','c7979797-0000-0000-0000-000000000001','pizza','Calabresa F97','calabresa-f97','Calabresa e cebola', null, 1, true),
  ('e9797979-0000-0000-0000-000000000002','c7979797-0000-0000-0000-000000000001','pizza','Mussarela F97','mussarela-f97','Mussarela', null, 2, true),
  ('e9797979-0000-0000-0000-000000000003','c7979797-0000-0000-0000-000000000002','pizza','Brigadeiro F97','brigadeiro-f97','Chocolate', null, 3, true),
  ('e9797979-0000-0000-0000-000000000005','c7979797-0000-0000-0000-000000000001','pizza','Inativa F97','inativa-f97','Fora do cardápio', null, 5, false),
  ('e9797979-0000-0000-0000-000000000008','c7979797-0000-0000-0000-000000000003','fogazza','Fogazza simples F97','fogazza-simples-f97','Preço próprio', 12.00, 8, true);
insert into public.products (id, category_id, product_type, name, slug, short_description, base_price, sort_order, is_active,
                             flavor_category_id, flavor_size_id) values
  ('e9797979-0000-0000-0000-000000000009','c7979797-0000-0000-0000-000000000003','fogazza','Fogazza salgada F97','fogazza-salgada-f97','Escolha o sabor', null, 9, true,
   'c7979797-0000-0000-0000-000000000001','d9797979-0000-0000-0000-000000000002');

insert into public.product_variants (id, product_id, size_id, price) values
  ('f9797979-0000-0000-0000-000000000011','e9797979-0000-0000-0000-000000000001','d9797979-0000-0000-0000-000000000001', 50.00),
  ('f9797979-0000-0000-0000-000000000012','e9797979-0000-0000-0000-000000000001','d9797979-0000-0000-0000-000000000002', 17.00),
  ('f9797979-0000-0000-0000-000000000021','e9797979-0000-0000-0000-000000000002','d9797979-0000-0000-0000-000000000001', 45.00),
  ('f9797979-0000-0000-0000-000000000022','e9797979-0000-0000-0000-000000000002','d9797979-0000-0000-0000-000000000002', 19.00),
  ('f9797979-0000-0000-0000-000000000031','e9797979-0000-0000-0000-000000000003','d9797979-0000-0000-0000-000000000001', 40.00),
  ('f9797979-0000-0000-0000-000000000032','e9797979-0000-0000-0000-000000000003','d9797979-0000-0000-0000-000000000002', 20.00),
  ('f9797979-0000-0000-0000-000000000052','e9797979-0000-0000-0000-000000000005','d9797979-0000-0000-0000-000000000002', 10.00);

insert into public.promotions (id, name, target_type, variant_id, promotional_price, starts_at, ends_at) values
  ('19797979-0000-0000-0000-000000000001','Promo fogazza F97','variant','f9797979-0000-0000-0000-000000000012', 15.00, now() - interval '1 day', now() + interval '7 days');

-- -----------------------------------------------------------------------------
-- F. VITRINE (como o cliente, anônimo)
-- -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select pg_temp.checar('F1 card no cardápio: de 17, a partir de 15 (promoção), até 19, com escolha, disponível',
  '17.00|15.00|19.00|true|true|true',
  (select concat_ws('|', preco_de, preco, preco_max, em_promocao::text, tem_tamanhos::text, disponivel::text)
     from public.cardapio_publico() where slug = 'fogazza-salgada-f97'));
select pg_temp.checar('F2 o link direto abre o card', '1|true',
  (select count(*) || '|' || bool_and(tem_tamanhos)
     from public.produto_publico('fogazza-salgada-f97')));
select pg_temp.checar('F3 sabores: só os da categoria do card, com o preço de fogazza',
  'Calabresa F97=15.00,Mussarela F97=19.00',
  (select string_agg(nome || '=' || preco::text, ',' order by nome)
     from public.sabores_da_fogazza('e9797979-0000-0000-0000-000000000009')));
select pg_temp.checar('F4 buscar "fogazza calabresa" acha o card, não a pizza', 'fogazza-salgada-f97',
  (select string_agg(slug, ',') from public.buscar_catalogo('fogazza calabresa f97')));
select pg_temp.checar('F5 buscar "calabresa": a pizza primeiro, o card depois',
  'calabresa-f97,fogazza-salgada-f97',
  (select string_agg(slug, ',') from (
     select slug from public.buscar_catalogo('calabresa f97')) b));
select pg_temp.checar('F6 a busca mostra o card pelo preço dos sabores', '15.00',
  (select preco::text from public.buscar_catalogo('fogazza salgada f97')
    where slug = 'fogazza-salgada-f97'));
select pg_temp.checar('F7 fogazza de preço próprio continua produto simples', '12.00|false|true',
  (select concat_ws('|', preco, tem_tamanhos::text, disponivel::text)
     from public.cardapio_publico() where slug = 'fogazza-simples-f97'));
select pg_temp.checar('F8 a pizza continua cobrando a pizza', '45.00',
  (select preco::text from public.cardapio_publico() where slug = 'mussarela-f97'));

-- -----------------------------------------------------------------------------
-- G. DISPONIBILIDADE
-- -----------------------------------------------------------------------------
select pg_temp.checar('G1 sem card para a categoria, a fogazza não se vende', 'false',
  public.variante_disponivel('f9797979-0000-0000-0000-000000000032')::text);
select pg_temp.checar('G2 ...e o motor de preço recusa',
  'Um dos sabores está indisponível no tamanho escolhido.',
  (public.montar_item('{"produto_id":"e9797979-0000-0000-0000-000000000003","variacao_id":"f9797979-0000-0000-0000-000000000032"}'::jsonb) ->> 'erro'));
select pg_temp.checar('G3 ...sem mexer na pizza do sabor', '40.00',
  (public.montar_item('{"produto_id":"e9797979-0000-0000-0000-000000000003","variacao_id":"f9797979-0000-0000-0000-000000000031"}'::jsonb) ->> 'preco_unitario'));
reset role;

-- Tamanho de pizza da Calabresa pausado; a fogazza dela continua ativa.
update public.product_variants set is_temporarily_available = false
 where id = 'f9797979-0000-0000-0000-000000000011';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('G4 pizza só com a fogazza à venda sai do cardápio como pizza', 'false',
  (select disponivel::text from public.cardapio_publico() where slug = 'calabresa-f97'));
select pg_temp.checar('G5 ...e a fogazza dela continua à venda', 'true',
  (select disponivel::text from public.sabores_da_fogazza('e9797979-0000-0000-0000-000000000009')
    where slug = 'calabresa-f97'));
select pg_temp.checar('G6 ...e o motor de preço aceita', '15.00',
  (public.montar_item('{"produto_id":"e9797979-0000-0000-0000-000000000001","variacao_id":"f9797979-0000-0000-0000-000000000012"}'::jsonb) ->> 'preco_unitario'));
reset role;
update public.product_variants set is_temporarily_available = true
 where id = 'f9797979-0000-0000-0000-000000000011';

-- Card pausado.
update public.products set is_temporarily_available = false
 where id = 'e9797979-0000-0000-0000-000000000009';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('G7 card pausado: indisponível no cardápio', 'false',
  (select disponivel::text from public.cardapio_publico() where slug = 'fogazza-salgada-f97'));
select pg_temp.checar('G8 ...todos os sabores dele indisponíveis', 'false,false',
  (select string_agg(disponivel::text, ',' order by nome)
     from public.sabores_da_fogazza('e9797979-0000-0000-0000-000000000009')));
select pg_temp.checar('G9 ...e o motor de preço recusa a fogazza',
  'Um dos sabores está indisponível no tamanho escolhido.',
  (public.montar_item('{"produto_id":"e9797979-0000-0000-0000-000000000001","variacao_id":"f9797979-0000-0000-0000-000000000012"}'::jsonb) ->> 'erro'));
select pg_temp.checar('G10 ...sem pausar a pizza', '50.00',
  (public.montar_item('{"produto_id":"e9797979-0000-0000-0000-000000000001","variacao_id":"f9797979-0000-0000-0000-000000000011"}'::jsonb) ->> 'preco_unitario'));
reset role;
update public.products set is_temporarily_available = true
 where id = 'e9797979-0000-0000-0000-000000000009';

-- Categoria do card pausada.
update public.categories set is_temporarily_available = false
 where id = 'c7979797-0000-0000-0000-000000000003';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('G11 categoria do card pausada também pausa a fogazza',
  'Um dos sabores está indisponível no tamanho escolhido.',
  (public.montar_item('{"produto_id":"e9797979-0000-0000-0000-000000000001","variacao_id":"f9797979-0000-0000-0000-000000000012"}'::jsonb) ->> 'erro'));
reset role;
update public.categories set is_temporarily_available = true
 where id = 'c7979797-0000-0000-0000-000000000003';

-- Sabores esgotados, um e depois os dois.
update public.products set is_temporarily_available = false
 where id = 'e9797979-0000-0000-0000-000000000001';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('G12 um sabor esgotado: o card continua aberto', 'true',
  (select disponivel::text from public.cardapio_publico() where slug = 'fogazza-salgada-f97'));
reset role;
update public.products set is_temporarily_available = false
 where id = 'e9797979-0000-0000-0000-000000000002';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('G13 todos esgotados: o card fica indisponível', 'false',
  (select disponivel::text from public.cardapio_publico() where slug = 'fogazza-salgada-f97'));
reset role;
update public.products set is_temporarily_available = true
 where id in ('e9797979-0000-0000-0000-000000000001','e9797979-0000-0000-0000-000000000002');

-- Tamanho de fogazza desativado.
update public.pizza_sizes set is_active = false
 where id = 'd9797979-0000-0000-0000-000000000002';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('G14 tamanho de fogazza desativado: card sem sabores e indisponível', '0|false',
  (select (select count(*) from public.sabores_da_fogazza('e9797979-0000-0000-0000-000000000009'))
          || '|' || (select disponivel::text from public.cardapio_publico() where slug = 'fogazza-salgada-f97')));
reset role;
update public.pizza_sizes set is_active = true
 where id = 'd9797979-0000-0000-0000-000000000002';

-- -----------------------------------------------------------------------------
-- H. PAINEL E PERMISSÕES
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"97979797-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('H1 o painel lista os mesmos sabores (sem o inativo)',
  'Calabresa F97=15.00,Mussarela F97=19.00',
  (select string_agg(nome || '=' || preco::text, ',' order by nome)
     from public.sabores_da_fogazza('e9797979-0000-0000-0000-000000000009')));
select pg_temp.checar('H2 lista de produtos do painel: card disponível, de 15 a 19', 'true|15.00|19.00',
  (select concat_ws('|', disponivel::text, preco_min, preco_max)
     from public.catalogo_produtos_admin() where slug = 'fogazza-salgada-f97'));
select pg_temp.checar('H3 ...e a pizza sem o preço de fogazza na faixa', '50.00|50.00',
  (select concat_ws('|', preco_min, preco_max)
     from public.catalogo_produtos_admin() where slug = 'calabresa-f97'));
reset role;

select pg_temp.checar('H4 o cliente anônimo lê os sabores do card', 'true',
  has_function_privilege('anon', 'public.sabores_da_fogazza(uuid)', 'execute')::text);
select pg_temp.checar('H5 ...e a disponibilidade do cardápio', 'true',
  has_function_privilege('anon', 'public.produto_disponivel_no_cardapio(uuid)', 'execute')::text);

-- -----------------------------------------------------------------------------
-- RESULTADO
-- -----------------------------------------------------------------------------
select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
