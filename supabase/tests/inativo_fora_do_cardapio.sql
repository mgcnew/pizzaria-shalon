-- =============================================================================
-- INATIVO FORA DO CARDÁPIO — também para quem está logado
--
-- D-2026-09-30-103 · Migration: 20260930140000_inativo_fora_do_cardapio.sql
--
-- A equipe logada vê inativos pelo RLS (o painel precisa). As leituras do
-- cardápio público não podem herdar isso: equipe e visitante veem o mesmo
-- cardápio. Fixtures próprias (sufixo F93). ROLLBACK no fim.
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

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('93939393-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona93@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status)
values ('a9393939-0000-0000-0000-000000000001','Dona F93','owner',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active)
values ('b9393939-0000-0000-0000-000000000001','93939393-1111-1111-1111-111111111111','a9393939-0000-0000-0000-000000000001',true);
insert into public.user_roles (app_user_id, role_id)
select 'b9393939-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d9393939-0000-0000-0000-000000000001','Tradicional F93', 8, 2, 901),
  ('d9393939-0000-0000-0000-000000000002','Broto F93', 4, 1, 902);
insert into public.categories (id, name, slug, sort_order, is_active) values
  ('c3939393-0000-0000-0000-000000000001','Ativa F93','ativa-f93', 901, true),
  ('c3939393-0000-0000-0000-000000000002','Inativa F93','inativa-f93', 902, false);
insert into public.products (id, category_id, product_type, name, slug, base_price, sort_order, is_active) values
  ('e9393939-0000-0000-0000-000000000001','c3939393-0000-0000-0000-000000000001','pizza','Ativo F93','ativo-f93', null, 1, true),
  ('e9393939-0000-0000-0000-000000000002','c3939393-0000-0000-0000-000000000001','drink','Inativo F93','inativo-f93', 10, 2, false),
  ('e9393939-0000-0000-0000-000000000003','c3939393-0000-0000-0000-000000000002','drink','Da inativa F93','da-inativa-f93', 10, 3, true),
  ('e9393939-0000-0000-0000-000000000004','c3939393-0000-0000-0000-000000000001','pizza','Sabor inativo F93','sabor-inativo-f93', null, 4, false);
insert into public.product_variants (product_id, size_id, price, is_active) values
  ('e9393939-0000-0000-0000-000000000001','d9393939-0000-0000-0000-000000000001', 40, true),
  ('e9393939-0000-0000-0000-000000000001','d9393939-0000-0000-0000-000000000002', 30, false),
  ('e9393939-0000-0000-0000-000000000004','d9393939-0000-0000-0000-000000000001', 45, true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"93939393-1111-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('I1 equipe logada: cardápio só com o ativo', 'ativo-f93',
  (select string_agg(slug, ',' order by slug) from public.cardapio_publico() where slug like '%f93'));
select pg_temp.checar('I2 ...busca sem inativos', 'ativo-f93',
  (select string_agg(slug, ',' order by slug) from public.buscar_catalogo('f93')));
select pg_temp.checar('I3 ...link direto do inativo não abre', '0',
  (select count(*)::text from public.produto_publico('inativo-f93')));
select pg_temp.checar('I4 ...tamanho inativo não é oferecido', 'Tradicional F93',
  (select string_agg(tamanho_nome, ',') from public.tamanhos_publicos('e9393939-0000-0000-0000-000000000001')));
select pg_temp.checar('I5 ...sabor inativo fora do meio a meio', 'Ativo F93',
  (select string_agg(nome, ',' order by nome) from public.sabores_publicos('d9393939-0000-0000-0000-000000000001')
    where nome like '%F93'));
select pg_temp.checar('I6 ...categoria inativa fora das categorias', 'Ativa F93',
  (select string_agg(nome, ',' order by nome) from public.categorias_publicas() where nome like '%F93'));
reset role;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('I7 o visitante vê o mesmo cardápio', 'ativo-f93',
  (select string_agg(slug, ',' order by slug) from public.cardapio_publico() where slug like '%f93'));
reset role;

select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
