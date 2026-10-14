-- =============================================================================
-- TESTES DO PREÇO DE FIM DE SEMANA DA FOGAZZA — D-2026-10-14-119 (0148)
--
-- O QUE ESTE ARQUIVO RESPONDE:
--   1. sexta, sábado e domingo contam pelo relógio, no fuso da loja?
--   2. o preço de fim de semana vale só nesses dias, e só se existir?
--   3. promoção continua valendo por cima?
--   4. só a fogazza por sabor aceita preço de fim de semana?
--   5. o painel (`montar_fogazza`) grava e limpa o preço de fim de semana?
--   6. a vitrine e os sabores mostram o preço de tabela do momento?
--
-- As datas são fixas e explícitas (p_em): o resultado não depende do dia em
-- que o teste roda. Transação com ROLLBACK. Nada é persistido.
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
values ('97979797-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona97@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a9797979-0000-0000-0000-000000000001','Dona F97','owner',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b9797979-0000-0000-0000-000000000001','97979797-1111-1111-1111-111111111111','a9797979-0000-0000-0000-000000000001',true);
insert into public.user_roles (app_user_id, role_id)
select 'b9797979-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';

-- O fuso da loja é o que decide o dia.
update public.store_settings set timezone = 'America/Sao_Paulo';

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d9797979-0000-0000-0000-000000000001','Tradicional F97', 8, 2, 971);
insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order, sold_as) values
  ('d9797979-0000-0000-0000-000000000002','Fogazza F97', 1, 1, 972, 'fogazza');

insert into public.categories (id, name, slug, sort_order) values
  ('c7979797-0000-0000-0000-000000000001','Pizzas F97','pizzas-f97', 971),
  ('c7979797-0000-0000-0000-000000000002','Fogazza F97','fogazza-f97', 972);

insert into public.products (id, category_id, product_type, name, slug, base_price, sort_order, is_active) values
  ('e9797979-0000-0000-0000-000000000001','c7979797-0000-0000-0000-000000000001','pizza','Calabresa F97','calabresa-f97', null, 1, true),
  ('e9797979-0000-0000-0000-000000000002','c7979797-0000-0000-0000-000000000001','pizza','Mussarela F97','mussarela-f97', null, 2, true),
  ('e9797979-0000-0000-0000-000000000009','c7979797-0000-0000-0000-000000000002','fogazza','Fogazza salgada F97','fogazza-salgada-f97', null, 1, true);

-- O card já nasce apontando para a categoria e o tamanho do teste: sem isso,
-- `montar_fogazza` pegaria o primeiro tamanho de fogazza do banco.
update public.products
   set flavor_category_id = 'c7979797-0000-0000-0000-000000000001',
       flavor_size_id = 'd9797979-0000-0000-0000-000000000002'
 where id = 'e9797979-0000-0000-0000-000000000009';

insert into public.product_variants (id, product_id, size_id, price, weekend_price) values
  -- pizza: sem preço de fim de semana
  ('f9797979-0000-0000-0000-000000000011','e9797979-0000-0000-0000-000000000001','d9797979-0000-0000-0000-000000000001', 50.00, null),
  -- fogazza de calabresa: 17 na semana, 20 no fim de semana
  ('f9797979-0000-0000-0000-000000000012','e9797979-0000-0000-0000-000000000001','d9797979-0000-0000-0000-000000000002', 17.00, 20.00),
  -- fogazza de mussarela: sem preço de fim de semana
  ('f9797979-0000-0000-0000-000000000022','e9797979-0000-0000-0000-000000000002','d9797979-0000-0000-0000-000000000002', 19.00, null);

-- Datas fixas (horário de Brasília):
--   quinta 15/10/2026 23:59 · sexta 16/10 00:30 · sexta 16/10 20:00
--   sábado 17/10 20:00 · domingo 18/10 23:59 · segunda 19/10 00:30
-- -----------------------------------------------------------------------------
-- 1. QUE DIA É
-- -----------------------------------------------------------------------------
select pg_temp.checar('quinta 23:59 nao e fim de semana', 'false',
  public.e_fim_de_semana('2026-10-15 23:59-03')::text);
select pg_temp.checar('sexta 00:30 ja e fim de semana (relogio)', 'true',
  public.e_fim_de_semana('2026-10-16 00:30-03')::text);
select pg_temp.checar('sabado e fim de semana', 'true',
  public.e_fim_de_semana('2026-10-17 20:00-03')::text);
select pg_temp.checar('domingo 23:59 e fim de semana', 'true',
  public.e_fim_de_semana('2026-10-18 23:59-03')::text);
select pg_temp.checar('segunda 00:30 ja e semana (nao segue o turno)', 'false',
  public.e_fim_de_semana('2026-10-19 00:30-03')::text);
-- 02:30 UTC de sexta ainda é quinta 23:30 em Brasília: vale o fuso da loja.
-- Pelo UTC daria fim de semana.
select pg_temp.checar('o dia e o do fuso da loja, nao o UTC', 'false',
  public.e_fim_de_semana('2026-10-16 02:30+00')::text);

-- -----------------------------------------------------------------------------
-- 2. PREÇO
-- -----------------------------------------------------------------------------
select pg_temp.checar('fogazza na quinta: preco normal', '17.00',
  public.preco_efetivo_variante('f9797979-0000-0000-0000-000000000012', '2026-10-15 20:00-03')::text);
select pg_temp.checar('fogazza no sabado: preco de fim de semana', '20.00',
  public.preco_efetivo_variante('f9797979-0000-0000-0000-000000000012', '2026-10-17 20:00-03')::text);
select pg_temp.checar('fogazza na sexta 00:30: preco de fim de semana', '20.00',
  public.preco_efetivo_variante('f9797979-0000-0000-0000-000000000012', '2026-10-16 00:30-03')::text);
select pg_temp.checar('fogazza na segunda 00:30: preco normal', '17.00',
  public.preco_efetivo_variante('f9797979-0000-0000-0000-000000000012', '2026-10-19 00:30-03')::text);
select pg_temp.checar('sem preco de fim de semana, sabado cobra o normal', '19.00',
  public.preco_efetivo_variante('f9797979-0000-0000-0000-000000000022', '2026-10-17 20:00-03')::text);
select pg_temp.checar('pizza nao muda no fim de semana', '50.00',
  public.preco_efetivo_variante('f9797979-0000-0000-0000-000000000011', '2026-10-17 20:00-03')::text);

-- -----------------------------------------------------------------------------
-- 3. PROMOÇÃO VALE POR CIMA
-- -----------------------------------------------------------------------------
insert into public.promotions (id, name, target_type, variant_id, promotional_price, starts_at, ends_at) values
  ('19797979-0000-0000-0000-000000000001','Promo fogazza F97','variant','f9797979-0000-0000-0000-000000000012',
   15.00, '2026-10-01 00:00-03', '2026-11-01 00:00-03');

select pg_temp.checar('promocao vale no sabado', '15.00',
  public.preco_efetivo_variante('f9797979-0000-0000-0000-000000000012', '2026-10-17 20:00-03')::text);
select pg_temp.checar('preco regular do sabado continua o de fim de semana', '20.00',
  public.preco_regular_variante('f9797979-0000-0000-0000-000000000012', '2026-10-17 20:00-03')::text);

delete from public.promotions where id = '19797979-0000-0000-0000-000000000001';

-- -----------------------------------------------------------------------------
-- 4. SÓ NA FOGAZZA POR SABOR
-- -----------------------------------------------------------------------------
select pg_temp.checar('pizza nao aceita preco de fim de semana', 'Preço de fim de semana só existe na fogazza por sabor.',
  pg_temp.tentar($q$update public.product_variants set weekend_price = 55
                    where id = 'f9797979-0000-0000-0000-000000000011'$q$));
select pg_temp.checar('preco de fim de semana zero e recusado', 'false',
  (pg_temp.tentar($q$update public.product_variants set weekend_price = 0
                     where id = 'f9797979-0000-0000-0000-000000000012'$q$) = 'ok')::text);

-- -----------------------------------------------------------------------------
-- 5. O PAINEL GRAVA E LIMPA
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"97979797-1111-1111-1111-111111111111","role":"authenticated"}';

select public.montar_fogazza(
  'e9797979-0000-0000-0000-000000000009', 'c7979797-0000-0000-0000-000000000001',
  '[{"produto_id":"e9797979-0000-0000-0000-000000000001","preco":18,"preco_fim_de_semana":22},
    {"produto_id":"e9797979-0000-0000-0000-000000000002","preco":19,"preco_fim_de_semana":null}]'::jsonb);

reset role;

select pg_temp.checar('painel grava o preco de fim de semana', '18.00/22.00',
  (select price::text || '/' || weekend_price::text from public.product_variants
    where id = 'f9797979-0000-0000-0000-000000000012'));
select pg_temp.checar('painel deixa vazio quando nao informado', 'null',
  coalesce((select weekend_price::text from public.product_variants
             where id = 'f9797979-0000-0000-0000-000000000022'), 'null'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"97979797-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('painel recusa preco de fim de semana zero', 'O preço de fim de semana precisa ser maior que zero (ou fica em branco).',
  pg_temp.tentar($q$select public.montar_fogazza(
    'e9797979-0000-0000-0000-000000000009', 'c7979797-0000-0000-0000-000000000001',
    '[{"produto_id":"e9797979-0000-0000-0000-000000000001","preco":18,"preco_fim_de_semana":0}]'::jsonb)$q$));

select public.montar_fogazza(
  'e9797979-0000-0000-0000-000000000009', 'c7979797-0000-0000-0000-000000000001',
  '[{"produto_id":"e9797979-0000-0000-0000-000000000001","preco":18}]'::jsonb);

reset role;

select pg_temp.checar('salvar sem preco de fim de semana limpa o anterior', 'null',
  coalesce((select weekend_price::text from public.product_variants
             where id = 'f9797979-0000-0000-0000-000000000012'), 'null'));

-- -----------------------------------------------------------------------------
-- 6. VITRINE E SABORES MOSTRAM O PREÇO DE TABELA DO MOMENTO
-- -----------------------------------------------------------------------------
update public.product_variants set weekend_price = 22 where id = 'f9797979-0000-0000-0000-000000000012';

select pg_temp.checar('sabores da fogazza: preco_de e o de tabela do momento', 'true',
  (select f.preco_de = public.preco_regular_variante(f.variacao_id)
     from public.sabores_da_fogazza('e9797979-0000-0000-0000-000000000009') f
    where f.variacao_id = 'f9797979-0000-0000-0000-000000000012')::text);
select pg_temp.checar('sabores da fogazza: preco e o efetivo do momento', 'true',
  (select f.preco = public.preco_efetivo_variante(f.variacao_id)
     from public.sabores_da_fogazza('e9797979-0000-0000-0000-000000000009') f
    where f.variacao_id = 'f9797979-0000-0000-0000-000000000012')::text);
select pg_temp.checar('fim de semana sem promocao nao vira promocao', 'false',
  (select f.em_promocao
     from public.sabores_da_fogazza('e9797979-0000-0000-0000-000000000009') f
    where f.variacao_id = 'f9797979-0000-0000-0000-000000000012')::text);

select pg_temp.checar('anon le se e fim de semana', 'true',
  has_function_privilege('anon', 'public.e_fim_de_semana(timestamptz)', 'execute')::text);
select pg_temp.checar('anon le o preco de tabela', 'true',
  has_function_privilege('anon', 'public.preco_regular_variante(uuid, timestamptz)', 'execute')::text);

-- O que a migration alterou "no lugar" continua inteiro (ver o cabeçalho dela).
select pg_temp.checar('vitrine continua respondendo', 'true',
  ((select count(*) from public.vitrine_do_catalogo()) > 0)::text);
select pg_temp.checar('montar_item, busca do PDV e codigo de barras foram alterados', '3',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('montar_item','buscar_catalogo_pdv','resolver_codigo_de_barras')
      and p.prosrc like '%preco_regular_variante%'));
select pg_temp.checar('busca do PDV manteve o exige_producao', 'true',
  (select (p.prosrc like '%requires_production%')::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'buscar_catalogo_pdv'));

-- =============================================================================
select n, cenario, esperado, obtido, case when passou then 'OK' else 'FALHOU' end
from resultado_teste order by n;

select 'TOTAL: ' || count(*) || ' cenarios | PASSARAM: ' || count(*) filter (where passou)
  || ' | FALHARAM: ' || count(*) filter (where not passou)
from resultado_teste;

rollback;
