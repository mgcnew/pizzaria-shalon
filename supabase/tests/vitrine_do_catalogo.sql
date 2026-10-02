-- =============================================================================
-- VITRINE DO CATÁLOGO — a mesma regra, calculada em conjunto
--
-- D-2026-10-02-115 · Migrations: 20261002100000_vitrine_do_catalogo.sql e
--                   20261002110000_busca_sem_funcao_por_produto.sql
--
-- `vitrine_do_catalogo()` reescreve, para todos os produtos de uma vez, o que
-- as funções por produto calculam. Esta suíte compara as duas, produto a
-- produto (inclusive os já cadastrados no banco), como o servidor, como
-- visitante e como a dona, depois de cada mudança de cenário: pausa de
-- tamanho, de categoria, de card, de componente de combo, promoção.
--
-- A referência (`pg_temp.referencia`) é o corpo do `cardapio_publico` ANTES
-- da 0145, sem o filtro de ativo, chamando as funções por produto.
-- Fixtures próprias (sufixo V145). ROLLBACK no fim.
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

-- O cálculo antigo, produto a produto.
create or replace function pg_temp.referencia()
returns table (produto_id uuid, preco_de numeric, preco numeric, preco_max numeric,
               em_promocao boolean, disponivel boolean, tem_tamanhos boolean)
language sql stable as $$
  with variantes_de_pizza as (
    select pv.* from public.product_variants pv
      join public.pizza_sizes s on s.id = pv.size_id
     where s.sold_as = 'pizza'
  )
  select
    p.id,
    case when p.flavor_category_id is not null then fz.preco_de else coalesce(
      (select min(pv.price) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active), p.base_price) end,
    case when p.flavor_category_id is not null then fz.preco else coalesce(
      (select min(public.preco_efetivo_variante(pv.id)) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)) end,
    case when p.flavor_category_id is not null then fz.preco_max else coalesce(
      (select max(public.preco_efetivo_variante(pv.id)) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)) end,
    case when p.flavor_category_id is not null then fz.em_promocao else exists (
      select 1 from public.promotions pr
      where pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
        and (pr.product_id = p.id
             or pr.variant_id in (select pv.id from variantes_de_pizza pv
                                   where pv.product_id = p.id))) end,
    coalesce(public.produto_disponivel_no_cardapio(p.id), false),
    p.flavor_category_id is not null
      or exists (select 1 from variantes_de_pizza pv
                  where pv.product_id = p.id and pv.is_active)
  from public.products p
  join public.categories c on c.id = p.category_id
  left join lateral (
    select min(f.preco_de) as preco_de, min(f.preco) as preco, max(f.preco) as preco_max,
           coalesce(bool_or(f.em_promocao), false) as em_promocao
      from public.sabores_da_fogazza(p.id) f
     where p.flavor_category_id is not null
  ) fz on true;
$$;

-- Quantos produtos divergem (em qualquer campo), mais a contagem dos dois
-- lados, para não passar por "zero divergências de zero linhas".
create or replace function pg_temp.divergencias()
returns text language sql stable as $$
  select (select count(*) from pg_temp.referencia() r
            full join public.vitrine_do_catalogo() v on v.produto_id = r.produto_id
           where (r.produto_id, r.preco_de, r.preco, r.preco_max, r.em_promocao,
                  r.disponivel, r.tem_tamanhos)
                 is distinct from
                 (v.produto_id, v.preco_de, v.preco, v.preco_max, v.em_promocao,
                  v.disponivel, v.tem_tamanhos))::text
         || ' de ' || (select count(*) from pg_temp.referencia())::text;
$$;

create or replace function pg_temp.sem_divergencia(p_texto text)
returns text language sql immutable as $$
  select case when split_part(p_texto, ' de ', 1) = '0'
               and split_part(p_texto, ' de ', 2)::int > 0
              then 'igual' else p_texto end;
$$;

-- --------------------------------------------------------------- fixtures
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('14514514-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona145@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status)
values ('a1451451-0000-0000-0000-000000000001','Dona V145','owner',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active)
values ('b1451451-0000-0000-0000-000000000001','14514514-1111-1111-1111-111111111111','a1451451-0000-0000-0000-000000000001',true);
insert into public.user_roles (app_user_id, role_id)
select 'b1451451-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d1451451-0000-0000-0000-000000000001','Grande V145', 8, 2, 951),
  ('d1451451-0000-0000-0000-000000000002','Broto V145', 4, 1, 952);
insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order, sold_as) values
  ('d1451451-0000-0000-0000-000000000003','Fogazza V145', 1, 1, 953, 'fogazza');

insert into public.categories (id, name, slug, sort_order) values
  ('c1451451-0000-0000-0000-000000000001','Pizzas V145','pizzas-v145', 951),
  ('c1451451-0000-0000-0000-000000000002','Bebidas V145','bebidas-v145', 952),
  ('c1451451-0000-0000-0000-000000000003','Fogazzas V145','fogazzas-v145', 953),
  ('c1451451-0000-0000-0000-000000000004','Combos V145','combos-v145', 954);

insert into public.products (id, category_id, product_type, name, slug, base_price, sort_order) values
  ('e1451451-0000-0000-0000-000000000001','c1451451-0000-0000-0000-000000000001','pizza','Calabresa V145','calabresa-v145', null, 1),
  ('e1451451-0000-0000-0000-000000000002','c1451451-0000-0000-0000-000000000001','pizza','Mussarela V145','mussarela-v145', null, 2),
  ('e1451451-0000-0000-0000-000000000003','c1451451-0000-0000-0000-000000000002','drink','Guarana V145','guarana-v145', 10, 3),
  ('e1451451-0000-0000-0000-000000000006','c1451451-0000-0000-0000-000000000002','drink','Sem preco V145','sem-preco-v145', null, 6),
  ('e1451451-0000-0000-0000-000000000007','c1451451-0000-0000-0000-000000000001','pizza','So fogazza V145','so-fogazza-v145', null, 7);
insert into public.products (id, category_id, product_type, name, slug, base_price, sort_order) values
  ('e1451451-0000-0000-0000-000000000005','c1451451-0000-0000-0000-000000000004','combo','Combo V145','combo-v145', 60, 5);
insert into public.products (id, category_id, product_type, name, slug, sort_order,
                             flavor_category_id, flavor_size_id) values
  ('e1451451-0000-0000-0000-000000000004','c1451451-0000-0000-0000-000000000003','fogazza',
   'Fogazza salgada V145','fogazza-salgada-v145', 4,
   'c1451451-0000-0000-0000-000000000001','d1451451-0000-0000-0000-000000000003');

insert into public.product_variants (id, product_id, size_id, price) values
  ('f1451451-0000-0000-0000-000000000011','e1451451-0000-0000-0000-000000000001','d1451451-0000-0000-0000-000000000001', 50),
  ('f1451451-0000-0000-0000-000000000012','e1451451-0000-0000-0000-000000000001','d1451451-0000-0000-0000-000000000002', 30),
  ('f1451451-0000-0000-0000-000000000013','e1451451-0000-0000-0000-000000000001','d1451451-0000-0000-0000-000000000003', 17),
  ('f1451451-0000-0000-0000-000000000021','e1451451-0000-0000-0000-000000000002','d1451451-0000-0000-0000-000000000001', 45),
  ('f1451451-0000-0000-0000-000000000023','e1451451-0000-0000-0000-000000000002','d1451451-0000-0000-0000-000000000003', 19),
  ('f1451451-0000-0000-0000-000000000073','e1451451-0000-0000-0000-000000000007','d1451451-0000-0000-0000-000000000003', 21);

insert into public.combo_components (combo_product_id, component_product_id, component_variant_id, quantity, sort_order) values
  ('e1451451-0000-0000-0000-000000000005','e1451451-0000-0000-0000-000000000001','f1451451-0000-0000-0000-000000000011', 1, 1),
  ('e1451451-0000-0000-0000-000000000005','e1451451-0000-0000-0000-000000000003', null, 1, 2);

-- Vigentes: Broto da Calabresa, fogazza da Mussarela e o Guaraná.
-- Futura: Grande da Calabresa (não pode contar).
insert into public.promotions (id, name, target_type, variant_id, promotional_price, starts_at, ends_at) values
  ('11451451-0000-0000-0000-000000000001','Broto V145','variant','f1451451-0000-0000-0000-000000000012', 25, now() - interval '1 day', now() + interval '7 days'),
  ('11451451-0000-0000-0000-000000000002','Fogazza V145','variant','f1451451-0000-0000-0000-000000000023', 15, now() - interval '1 day', now() + interval '7 days'),
  ('11451451-0000-0000-0000-000000000003','Futura V145','variant','f1451451-0000-0000-0000-000000000011', 40, now() + interval '3 days', now() + interval '9 days');
insert into public.promotions (id, name, target_type, product_id, promotional_price, starts_at, ends_at) values
  ('11451451-0000-0000-0000-000000000004','Guarana V145','product','e1451451-0000-0000-0000-000000000003', 8, now() - interval '1 day', null);

-- --------------------------------------------------------------- 1. valores
select pg_temp.checar('V1 pizza: de / por / até (promoção futura não conta)', '30|25|50|t|t|t',
  (select concat_ws('|', preco_de::int, preco::int, preco_max::int, em_promocao, disponivel, tem_tamanhos)
     from public.vitrine_do_catalogo() where produto_id = 'e1451451-0000-0000-0000-000000000001'));
select pg_temp.checar('V2 card de fogazza: menor e maior preço dos sabores', '17|15|21|t|t|t',
  (select concat_ws('|', preco_de::int, preco::int, preco_max::int, em_promocao, disponivel, tem_tamanhos)
     from public.vitrine_do_catalogo() where produto_id = 'e1451451-0000-0000-0000-000000000004'));
select pg_temp.checar('V3 bebida com promoção de produto', '10|8|8|t|t|f',
  (select concat_ws('|', preco_de::int, preco::int, preco_max::int, em_promocao, disponivel, tem_tamanhos)
     from public.vitrine_do_catalogo() where produto_id = 'e1451451-0000-0000-0000-000000000003'));
select pg_temp.checar('V4 combo inteiro está à venda', 'true',
  (select disponivel::text from public.vitrine_do_catalogo() where produto_id = 'e1451451-0000-0000-0000-000000000005'));
select pg_temp.checar('V5 sem preço e sem tamanho não está à venda', 'false',
  (select disponivel::text from public.vitrine_do_catalogo() where produto_id = 'e1451451-0000-0000-0000-000000000006'));
select pg_temp.checar('V6 sabor só de fogazza (sem pizza, sem preço) fica fora', 'false',
  (select disponivel::text from public.vitrine_do_catalogo() where produto_id = 'e1451451-0000-0000-0000-000000000007'));
select pg_temp.checar('V7 cardapio_publico entrega o que a vitrine calcula', '15|21|t',
  (select concat_ws('|', preco::int, preco_max::int, disponivel)
     from public.cardapio_publico('fogazzas-v145') where slug = 'fogazza-salgada-v145'));
select pg_temp.checar('V8 busca entrega o que a vitrine calcula', '30|25|t',
  (select concat_ws('|', preco_de::int, preco::int, disponivel)
     from public.buscar_catalogo('calabresa v145') where slug = 'calabresa-v145'));

select pg_temp.checar('V9 busca pelo nome do sabor acha o card de fogazza (0146)',
  'fogazza-salgada-v145,mussarela-v145',
  (select string_agg(slug, ',' order by slug) from public.buscar_catalogo('mussarela v145')));

-- --------------------------------------------------------------- 2. equivalência
-- Um bloco por cenário: servidor, visitante e dona.
select pg_temp.checar('E0 inicial · servidor', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
set local role anon;
select pg_temp.checar('E0 inicial · visitante', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"14514514-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('E0 inicial · dona', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
reset role;

-- E1 Grande da Calabresa pausado (o combo usa ele).
update public.product_variants set is_temporarily_available = false
 where id = 'f1451451-0000-0000-0000-000000000011';
select pg_temp.checar('E1 tamanho pausado · servidor', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
set local role anon;
select pg_temp.checar('E1 tamanho pausado · visitante', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
reset role;
select pg_temp.checar('E1b o combo sai junto', 'false',
  (select disponivel::text from public.vitrine_do_catalogo() where produto_id = 'e1451451-0000-0000-0000-000000000005'));
update public.product_variants set is_temporarily_available = true
 where id = 'f1451451-0000-0000-0000-000000000011';

-- E2 categoria das pizzas pausada: os sabores da fogazza caem com ela.
update public.categories set is_temporarily_available = false
 where id = 'c1451451-0000-0000-0000-000000000001';
select pg_temp.checar('E2 categoria pausada · servidor', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
set local role anon;
select pg_temp.checar('E2 categoria pausada · visitante', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
reset role;
select pg_temp.checar('E2b o card fica indisponível', 'false',
  (select disponivel::text from public.vitrine_do_catalogo() where produto_id = 'e1451451-0000-0000-0000-000000000004'));
update public.categories set is_temporarily_available = true
 where id = 'c1451451-0000-0000-0000-000000000001';

-- E3 card pausado: a fogazza deixa de estar à venda (RN-FOG-007).
update public.products set is_temporarily_available = false
 where id = 'e1451451-0000-0000-0000-000000000004';
select pg_temp.checar('E3 card pausado · servidor', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
set local role anon;
select pg_temp.checar('E3 card pausado · visitante', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
reset role;
update public.products set is_temporarily_available = true
 where id = 'e1451451-0000-0000-0000-000000000004';

-- E4 componente do combo pausado (o Guaraná).
update public.products set is_temporarily_available = false
 where id = 'e1451451-0000-0000-0000-000000000003';
select pg_temp.checar('E4 componente pausado · servidor', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
set local role anon;
select pg_temp.checar('E4 componente pausado · visitante', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
reset role;
update public.products set is_temporarily_available = true
 where id = 'e1451451-0000-0000-0000-000000000003';

-- E5 tamanhos de pizza da Calabresa pausados, fogazza à venda (RN-FOG-006).
update public.product_variants set is_temporarily_available = false
 where id in ('f1451451-0000-0000-0000-000000000011','f1451451-0000-0000-0000-000000000012');
select pg_temp.checar('E5 só a fogazza no ar · servidor', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
set local role anon;
select pg_temp.checar('E5 só a fogazza no ar · visitante', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
reset role;
select pg_temp.checar('E5b a pizza sai, o card continua', 'false|true',
  (select string_agg(disponivel::text, '|' order by produto_id) from public.vitrine_do_catalogo()
    where produto_id in ('e1451451-0000-0000-0000-000000000001','e1451451-0000-0000-0000-000000000004')));
update public.product_variants set is_temporarily_available = true
 where id in ('f1451451-0000-0000-0000-000000000011','f1451451-0000-0000-0000-000000000012');

-- E6 tamanho de fogazza desativado e produto inativo (a dona vê inativos).
update public.pizza_sizes set is_active = false where id = 'd1451451-0000-0000-0000-000000000003';
update public.products set is_active = false where id = 'e1451451-0000-0000-0000-000000000002';
select pg_temp.checar('E6 fogazza desativada + inativo · servidor', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
set local role anon;
select pg_temp.checar('E6 fogazza desativada + inativo · visitante', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"14514514-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('E6 fogazza desativada + inativo · dona', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
select pg_temp.checar('E6b o admin mostra o inativo, indisponível', 'f|f',
  (select concat_ws('|', ativo, disponivel) from public.catalogo_produtos_admin()
    where id = 'e1451451-0000-0000-0000-000000000002'));
reset role;

-- E8 tamanho de pizza desativado: o visitante deixa de enxergá-lo, e a
-- regra "alguma variação à venda" não olha o tamanho.
update public.pizza_sizes set is_active = true where id = 'd1451451-0000-0000-0000-000000000003';
update public.pizza_sizes set is_active = false where id = 'd1451451-0000-0000-0000-000000000001';
select pg_temp.checar('E8 tamanho de pizza desativado · servidor', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
set local role anon;
select pg_temp.checar('E8 tamanho de pizza desativado · visitante', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
reset role;

-- E7 promoção encerrada agora.
update public.promotions set ends_at = now() - interval '1 second'
 where id = '11451451-0000-0000-0000-000000000004';
select pg_temp.checar('E7 promoção encerrada · servidor', 'igual', pg_temp.sem_divergencia(pg_temp.divergencias()));
select pg_temp.checar('E7b o Guaraná volta ao preço normal', '10|f',
  (select concat_ws('|', preco::int, em_promocao) from public.vitrine_do_catalogo()
    where produto_id = 'e1451451-0000-0000-0000-000000000003'));

select count(*) filter (where passou) as passaram, count(*) as total,
       jsonb_agg(jsonb_build_object('n', n, 'cenario', cenario, 'esperado', esperado, 'obtido', obtido))
         filter (where not passou) as falhas
  from resultado_teste;

rollback;
