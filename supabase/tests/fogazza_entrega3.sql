-- =============================================================================
-- FOGAZZA POR SABOR — ENTREGA 3 (relatórios e "Mais pedidos")
--
-- 04 RN-FOG-008, RN-POP-001 · D-2026-09-30-101
-- Migration: 20260930100000_fogazza_nos_relatorios.sql (depois da 0134–0136)
--
-- O que esta suíte prova:
--   R. relatórios: a fogazza de um sabor é linha própria ("Calabresa ·
--      Fogazza"), na categoria do card, separada da pizza do sabor — inclusive
--      para sabor de preço único; vendas por categoria separam as duas;
--   K. ranking: cada linha tem chave única, a fogazza entra como item
--      próprio e o card de entrada não entra;
--   M. "Mais pedidos": a fogazza soma no card; card pausado sai da vitrine.
--
-- Fixtures próprias (sufixo F95). Transação com ROLLBACK: nada persiste.
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
values ('95959595-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona95@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status)
values ('a9595959-0000-0000-0000-000000000001','Dona F95','owner',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active)
values ('b9595959-0000-0000-0000-000000000001','95959595-1111-1111-1111-111111111111','a9595959-0000-0000-0000-000000000001',true);
insert into public.user_roles (app_user_id, role_id)
select 'b9595959-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d9595959-0000-0000-0000-000000000001','Tradicional F95', 8, 2, 901);
insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order, sold_as) values
  ('d9595959-0000-0000-0000-000000000002','Fogazza F95', 1, 1, 902, 'fogazza');

insert into public.categories (id, name, slug, sort_order) values
  ('c5959595-0000-0000-0000-000000000001','Pizzas F95','pizzas-f95', 901),
  ('c5959595-0000-0000-0000-000000000003','Fogazzas F95','fogazzas-f95', 903);

insert into public.products (id, category_id, product_type, name, slug, base_price, sort_order, is_active, created_at) values
  ('e9595959-0000-0000-0000-000000000001','c5959595-0000-0000-0000-000000000001','pizza','Calabresa F95','calabresa-f95', null, 1, true, now() - interval '90 days'),
  ('e9595959-0000-0000-0000-000000000002','c5959595-0000-0000-0000-000000000001','pizza','Atum F95','atum-f95', 43.00, 2, true, now() - interval '90 days');
insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active,
                             flavor_category_id, flavor_size_id) values
  ('e9595959-0000-0000-0000-000000000009','c5959595-0000-0000-0000-000000000003','fogazza','Fogazza salgada F95','fogazza-salgada-f95', 9, true,
   'c5959595-0000-0000-0000-000000000001','d9595959-0000-0000-0000-000000000002');

insert into public.product_variants (id, product_id, size_id, price, created_at) values
  ('f9595959-0000-0000-0000-000000000011','e9595959-0000-0000-0000-000000000001','d9595959-0000-0000-0000-000000000001', 50.00, now() - interval '90 days'),
  ('f9595959-0000-0000-0000-000000000012','e9595959-0000-0000-0000-000000000001','d9595959-0000-0000-0000-000000000002', 17.00, now() - interval '90 days'),
  ('f9595959-0000-0000-0000-000000000022','e9595959-0000-0000-0000-000000000002','d9595959-0000-0000-0000-000000000002', 20.00, now() - interval '90 days');

-- Quatro pedidos concluídos ontem: pizza Calabresa x2, fogazza Calabresa x3,
-- pizza Atum (preço único) x1 e fogazza Atum x1.
insert into public.orders (id, tracking_token_hash, fulfillment_type, status,
  customer_name_snapshot, customer_whatsapp_snapshot, subtotal, total, completed_at) values
  ('09595959-0000-0000-0000-000000000001','f95-1','pickup','completed','Cliente F95','11999999995', 100, 100, now() - interval '1 day'),
  ('09595959-0000-0000-0000-000000000002','f95-2','pickup','completed','Cliente F95','11999999995',  51,  51, now() - interval '1 day'),
  ('09595959-0000-0000-0000-000000000003','f95-3','pickup','completed','Cliente F95','11999999995',  43,  43, now() - interval '1 day'),
  ('09595959-0000-0000-0000-000000000004','f95-4','pickup','completed','Cliente F95','11999999995',  20,  20, now() - interval '1 day');

insert into public.order_items (id, order_id, line_number, item_type, product_id, product_name_snapshot,
  quantity, unit_price, line_total, size_id, size_name_snapshot) values
  ('19595959-0000-0000-0000-000000000001','09595959-0000-0000-0000-000000000001',1,'pizza','e9595959-0000-0000-0000-000000000001','Calabresa F95',2,50,100,'d9595959-0000-0000-0000-000000000001','Tradicional F95'),
  ('19595959-0000-0000-0000-000000000002','09595959-0000-0000-0000-000000000002',1,'pizza','e9595959-0000-0000-0000-000000000001','Calabresa F95',3,17, 51,'d9595959-0000-0000-0000-000000000002','Fogazza F95'),
  ('19595959-0000-0000-0000-000000000003','09595959-0000-0000-0000-000000000003',1,'product','e9595959-0000-0000-0000-000000000002','Atum F95',1,43, 43, null, null),
  ('19595959-0000-0000-0000-000000000004','09595959-0000-0000-0000-000000000004',1,'pizza','e9595959-0000-0000-0000-000000000002','Atum F95',1,20, 20,'d9595959-0000-0000-0000-000000000002','Fogazza F95');

insert into public.order_item_flavors (order_item_id, flavor_product_id, flavor_name_snapshot, variant_id,
  effective_price_snapshot, portion) values
  ('19595959-0000-0000-0000-000000000001','e9595959-0000-0000-0000-000000000001','Calabresa F95','f9595959-0000-0000-0000-000000000011',50,1),
  ('19595959-0000-0000-0000-000000000002','e9595959-0000-0000-0000-000000000001','Calabresa F95','f9595959-0000-0000-0000-000000000012',17,1),
  ('19595959-0000-0000-0000-000000000004','e9595959-0000-0000-0000-000000000002','Atum F95','f9595959-0000-0000-0000-000000000022',20,1);

-- -----------------------------------------------------------------------------
-- R. RELATÓRIOS
-- -----------------------------------------------------------------------------
select pg_temp.checar('R1 pizza e fogazza do mesmo sabor são linhas separadas',
  'Atum F95|Pizzas F95|pizza|1.00|43.00|nulo;Atum F95 · Fogazza F95|Fogazzas F95|fogazza|1.00|20.00|fogazza;Calabresa F95|Pizzas F95|pizza|2.00|100.00|nulo;Calabresa F95 · Fogazza F95|Fogazzas F95|fogazza|3.00|51.00|fogazza',
  (select string_agg(concat_ws('|', nome, categoria, tipo, quantidade, valor,
            case when tamanho_id is null then 'nulo' else 'fogazza' end), ';' order by nome)
     from public.vendas_por_produto(jsonb_build_object(
            'inicio', now() - interval '3 days', 'fim', now() + interval '1 hour'))
    where nome like '%F95%'));
select pg_temp.checar('R2 vendas por categoria separam fogazza de pizza',
  'Fogazzas F95=4.00/71.00;Pizzas F95=3.00/143.00',
  (select string_agg((e ->> 'categoria') || '=' || (e ->> 'quantidade') || '/' || (e ->> 'valor'), ';'
            order by e ->> 'categoria')
     from jsonb_array_elements(public.vendas_por_categoria(jsonb_build_object(
            'inicio', now() - interval '3 days', 'fim', now() + interval '1 hour'))) e
    where e ->> 'categoria' like '%F95'));
select pg_temp.checar('R3 as concessões continuam só com service_role', 'false|false',
  has_function_privilege('anon', 'public.vendas_por_produto(jsonb)', 'execute')::text || '|'
  || has_function_privilege('authenticated', 'public.vendas_por_produto(jsonb)', 'execute')::text);

-- -----------------------------------------------------------------------------
-- K. RANKING (como a dona)
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"95959595-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('K1 cada linha do ranking tem chave única', 'true',
  (select (count(*) = count(distinct p ->> 'chave'))::text
     from jsonb_array_elements(public.ranking_de_produtos('30d') -> 'produtos') p));
select pg_temp.checar('K2 a fogazza entra como item próprio', 'Calabresa F95 · Fogazza F95|fogazza|3.00|true',
  (select concat_ws('|', p ->> 'nome', p ->> 'tipo', p ->> 'quantidade',
            ((p ->> 'chave') like '%:%')::text)
     from jsonb_array_elements(public.ranking_de_produtos('30d') -> 'produtos') p
    where p ->> 'nome' = 'Calabresa F95 · Fogazza F95'));
select pg_temp.checar('K3 ...e a pizza do sabor conta só a pizza', '2.00',
  (select p ->> 'quantidade'
     from jsonb_array_elements(public.ranking_de_produtos('30d') -> 'produtos') p
    where p ->> 'nome' = 'Calabresa F95'));
select pg_temp.checar('K4 o card de entrada não entra no ranking', '0',
  (select count(*)::text
     from jsonb_array_elements(public.ranking_de_produtos('30d') -> 'produtos') p
    where p ->> 'nome' = 'Fogazza salgada F95'));
reset role;

-- -----------------------------------------------------------------------------
-- M. MAIS PEDIDOS (como o cliente)
-- -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('M1 as fogazzas somam no card; as pizzas, no sabor',
  'atum=1;calabresa=2;card=4',
  (select string_agg(t.x, ';' order by t.x) from (
     select case e ->> 'produto_id'
              when 'e9595959-0000-0000-0000-000000000001' then 'calabresa'
              when 'e9595959-0000-0000-0000-000000000002' then 'atum'
              when 'e9595959-0000-0000-0000-000000000009' then 'card' end
            || '=' || (e ->> 'quantidade')::numeric::integer as x
       from jsonb_array_elements(public.mais_pedidos(500)) e
      where e ->> 'produto_id' like 'e9595959-%') t));
reset role;

update public.products set is_temporarily_available = false
 where id = 'e9595959-0000-0000-0000-000000000009';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('M2 card pausado sai do "Mais pedidos"', '0',
  (select count(*)::text from jsonb_array_elements(public.mais_pedidos(500)) e
    where e ->> 'produto_id' = 'e9595959-0000-0000-0000-000000000009'));
reset role;

-- -----------------------------------------------------------------------------
-- RESULTADO
-- -----------------------------------------------------------------------------
select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
