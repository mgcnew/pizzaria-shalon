-- =============================================================================
-- FOGAZZA EM SABOR DE PREÇO ÚNICO
--
-- 04 RN-FOG-002, RN-DISP-006, RN-PROMO-003 · D-2026-09-29-100
-- Migration: 20260929170000_fogazza_em_preco_unico.sql (depois da 0134 e 0135)
--
-- O que esta suíte prova:
--   I. o sabor de preço único (sem tamanho de pizza) que ganha preço de
--      fogazza continua vendendo a pizza pelo preço único — no motor, no
--      cardápio e na disponibilidade —, e a fogazza dele pelo preço dela;
--   J. a promoção: no produto de preço único continua valendo, sem mexer na
--      fogazza; no produto com tamanho de pizza continua recusada;
--   K. nada muda para quem não tem fogazza: pizza de preço único e pizza com
--      tamanhos seguem como antes.
--
-- Fixtures próprias (sufixo F96). Transação com ROLLBACK: nada persiste.
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

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d9696969-0000-0000-0000-000000000001','Tradicional F96', 8, 2, 901);
insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order, sold_as) values
  ('d9696969-0000-0000-0000-000000000002','Fogazza F96', 1, 1, 902, 'fogazza');

insert into public.categories (id, name, slug, sort_order) values
  ('c6969696-0000-0000-0000-000000000001','Pizzas F96','pizzas-f96', 901),
  ('c6969696-0000-0000-0000-000000000003','Fogazzas F96','fogazzas-f96', 903);

insert into public.products (id, category_id, product_type, name, slug, short_description, base_price, sort_order, is_active) values
  -- preço único, com fogazza
  ('e9696969-0000-0000-0000-000000000001','c6969696-0000-0000-0000-000000000001','pizza','Aliche F96','aliche-f96','Aliche', 43.00, 1, true),
  -- com tamanho de pizza, com fogazza
  ('e9696969-0000-0000-0000-000000000002','c6969696-0000-0000-0000-000000000001','pizza','Mussarela F96','mussarela-f96','Mussarela', null, 2, true),
  -- preço único, sem fogazza
  ('e9696969-0000-0000-0000-000000000003','c6969696-0000-0000-0000-000000000001','pizza','Atum F96','atum-f96','Atum', 30.00, 3, true);
insert into public.products (id, category_id, product_type, name, slug, short_description, base_price, sort_order, is_active,
                             flavor_category_id, flavor_size_id) values
  ('e9696969-0000-0000-0000-000000000009','c6969696-0000-0000-0000-000000000003','fogazza','Fogazza salgada F96','fogazza-salgada-f96','Escolha o sabor', null, 9, true,
   'c6969696-0000-0000-0000-000000000001','d9696969-0000-0000-0000-000000000002');

insert into public.product_variants (id, product_id, size_id, price) values
  ('f9696969-0000-0000-0000-000000000012','e9696969-0000-0000-0000-000000000001','d9696969-0000-0000-0000-000000000002', 21.00),
  ('f9696969-0000-0000-0000-000000000021','e9696969-0000-0000-0000-000000000002','d9696969-0000-0000-0000-000000000001', 45.00),
  ('f9696969-0000-0000-0000-000000000022','e9696969-0000-0000-0000-000000000002','d9696969-0000-0000-0000-000000000002', 19.00);

-- -----------------------------------------------------------------------------
-- I. PIZZA DE PREÇO ÚNICO COM FOGAZZA (como o cliente)
-- -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('I1 a pizza de preço único continua saindo pelo preço único', '43.00',
  (public.montar_item('{"produto_id":"e9696969-0000-0000-0000-000000000001"}'::jsonb) ->> 'preco_unitario'));
select pg_temp.checar('I2 ...e aparece no cardápio sem tamanhos, disponível, a 43', '43.00|false|true',
  (select concat_ws('|', preco, tem_tamanhos::text, disponivel::text)
     from public.cardapio_publico() where slug = 'aliche-f96'));
select pg_temp.checar('I3 a fogazza dela sai pelo preço de fogazza', '21.00',
  (public.montar_item('{"produto_id":"e9696969-0000-0000-0000-000000000001","variacao_id":"f9696969-0000-0000-0000-000000000012"}'::jsonb) ->> 'preco_unitario'));
select pg_temp.checar('I4 ...e aparece na lista do card', 'Aliche F96=21.00=true',
  (select nome || '=' || preco::text || '=' || disponivel::text
     from public.sabores_da_fogazza('e9696969-0000-0000-0000-000000000009')
    where slug = 'aliche-f96'));
reset role;

-- Fogazza pausada sozinha: a pizza de preço único não é afetada.
update public.product_variants set is_temporarily_available = false
 where id = 'f9696969-0000-0000-0000-000000000012';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('I5 fogazza pausada: a pizza de preço único continua à venda', 'true|43.00',
  (select (select disponivel::text from public.cardapio_publico() where slug = 'aliche-f96')
          || '|' || (public.montar_item('{"produto_id":"e9696969-0000-0000-0000-000000000001"}'::jsonb) ->> 'preco_unitario')));
select pg_temp.checar('I6 ...e a fogazza fica indisponível',
  'Um dos sabores está indisponível no tamanho escolhido.',
  (public.montar_item('{"produto_id":"e9696969-0000-0000-0000-000000000001","variacao_id":"f9696969-0000-0000-0000-000000000012"}'::jsonb) ->> 'erro'));
reset role;
update public.product_variants set is_temporarily_available = true
 where id = 'f9696969-0000-0000-0000-000000000012';

-- Sabor esgotado: os dois saem.
update public.products set is_temporarily_available = false
 where id = 'e9696969-0000-0000-0000-000000000001';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('I7 sabor esgotado: a pizza sai', 'Indisponível no momento.',
  (public.montar_item('{"produto_id":"e9696969-0000-0000-0000-000000000001"}'::jsonb) ->> 'erro'));
select pg_temp.checar('I8 ...e a fogazza também', 'false',
  (select disponivel::text from public.sabores_da_fogazza('e9696969-0000-0000-0000-000000000009')
    where slug = 'aliche-f96'));
reset role;
update public.products set is_temporarily_available = true
 where id = 'e9696969-0000-0000-0000-000000000001';

-- -----------------------------------------------------------------------------
-- J. PROMOÇÃO
-- -----------------------------------------------------------------------------
select pg_temp.checar('J1 promoção no produto de preço único com fogazza é aceita', 'ok',
  pg_temp.tentar($q$insert into public.promotions (id, name, target_type, product_id, promotional_price, starts_at)
     values ('19696969-0000-0000-0000-000000000001','Promo aliche F96','product',
             'e9696969-0000-0000-0000-000000000001', 40.00, now() - interval '1 hour')$q$));
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('J2 ...a pizza sai pela promoção', '40.00',
  (public.montar_item('{"produto_id":"e9696969-0000-0000-0000-000000000001"}'::jsonb) ->> 'preco_unitario'));
select pg_temp.checar('J3 ...e a fogazza continua pelo preço dela', '21.00',
  (public.montar_item('{"produto_id":"e9696969-0000-0000-0000-000000000001","variacao_id":"f9696969-0000-0000-0000-000000000012"}'::jsonb) ->> 'preco_unitario'));
reset role;
select pg_temp.checar('J4 produto com tamanho de pizza continua recusando promoção no produto',
  'Produto com variacao recebe promocao por variacao, nao por produto (RN-PROMO-003)',
  pg_temp.tentar($q$insert into public.promotions (name, target_type, product_id, promotional_price, starts_at)
     values ('Promo mussarela F96','product','e9696969-0000-0000-0000-000000000002', 40.00, now())$q$));

-- -----------------------------------------------------------------------------
-- K. SEM FOGAZZA, NADA MUDA
-- -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('K1 pizza de preço único sem fogazza', '30.00|true',
  (select (public.montar_item('{"produto_id":"e9696969-0000-0000-0000-000000000003"}'::jsonb) ->> 'preco_unitario')
          || '|' || (select disponivel::text from public.cardapio_publico() where slug = 'atum-f96')));
select pg_temp.checar('K2 pizza com tamanho continua pedindo o tamanho', 'Escolha um tamanho.',
  (public.montar_item('{"produto_id":"e9696969-0000-0000-0000-000000000002"}'::jsonb) ->> 'erro'));
select pg_temp.checar('K3 ...e sai pelo tamanho escolhido', '45.00',
  (public.montar_item('{"produto_id":"e9696969-0000-0000-0000-000000000002","variacao_id":"f9696969-0000-0000-0000-000000000021"}'::jsonb) ->> 'preco_unitario'));
reset role;

-- Pizza com tamanho: tamanho pausado, fogazza à venda.
update public.product_variants set is_temporarily_available = false
 where id = 'f9696969-0000-0000-0000-000000000021';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('K4 pizza com o tamanho pausado sai do cardápio; a fogazza fica', 'false|true',
  (select (select disponivel::text from public.cardapio_publico() where slug = 'mussarela-f96')
          || '|' || (select disponivel::text from public.sabores_da_fogazza('e9696969-0000-0000-0000-000000000009')
                      where slug = 'mussarela-f96')));
reset role;

-- -----------------------------------------------------------------------------
-- RESULTADO
-- -----------------------------------------------------------------------------
select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
