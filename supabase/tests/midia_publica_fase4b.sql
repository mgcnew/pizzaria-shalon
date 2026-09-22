-- =============================================================================
-- TESTES DA MÍDIA PÚBLICA — regressão do defeito corrigido pela 0087
--
-- 03-RLS-RBAC-SEGURANCA.md §8.1, §23.1 · CLAUDE.md §12, §35
--
-- AS DUAS PERGUNTAS DESTE ARQUIVO:
--   1. o CLIENTE — anônimo, sem cookie nenhum — vê foto de produto e banner?
--   2. e continua sem ver tudo o que não é dele?
--
-- A primeira é a que falhou em produção: o cardápio público nunca mostrou
-- foto nem banner, e ninguém notou porque quem testava estava logado. A
-- segunda existe para que a correção não seja pior que o defeito.
--
-- TODO CENÁRIO RELEVANTE RODA COMO `anon`. Rodar como `authenticated` aqui
-- seria repetir o erro que produziu o defeito.
--
-- Transação com ROLLBACK. Nada é persistido.
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
insert into public.categories (id, name, slug, sort_order) values
  ('4b000000-0000-0000-0000-00000000000c','Pizzas F4B','pizzas-f4b', 941);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('4b000000-0000-0000-0000-00000000000f','Grande F4B', 8, 2, 941);

-- Mídia de CATÁLOGO, em bucket público.
insert into public.media_assets (id, bucket, storage_path, mime_type, asset_type) values
  ('4b000000-0000-0000-0000-000000000001','catalogo','f4b/pizza.webp','image/webp','product'),
  ('4b000000-0000-0000-0000-000000000002','catalogo','f4b/banner.webp','image/webp','banner'),
  ('4b000000-0000-0000-0000-000000000003','catalogo','f4b/inativo.webp','image/webp','product');

-- Mídia PRIVADA: comprovante financeiro, no bucket `comprovantes`. É o que
-- não pode sair por caminho nenhum.
insert into public.media_assets (id, bucket, storage_path, mime_type, asset_type) values
  ('4b000000-0000-0000-0000-0000000000f1','comprovantes','lancamentos/f4b/nota.pdf','application/pdf','financial_receipt');

insert into public.products (id, category_id, product_type, name, slug, short_description,
                             sort_order, is_active, image_asset_id) values
  ('4b000000-0000-0000-0000-000000000010','4b000000-0000-0000-0000-00000000000c','pizza',
   'Calabresa F4B','calabresa-f4b','com calabresa', 1, true,
   '4b000000-0000-0000-0000-000000000001'),
  -- Produto INATIVO com foto: é a armadilha da correção óbvia.
  ('4b000000-0000-0000-0000-000000000011','4b000000-0000-0000-0000-00000000000c','pizza',
   'Secreta F4B','secreta-f4b','nao deve aparecer', 2, false,
   '4b000000-0000-0000-0000-000000000003'),
  -- Produto SEM foto: o caminho tem de vir nulo, não estourar.
  ('4b000000-0000-0000-0000-000000000012','4b000000-0000-0000-0000-00000000000c','pizza',
   'Sem Foto F4B','sem-foto-f4b','sem imagem', 3, true, null);

insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available) values
  ('4b000000-0000-0000-0000-000000000020','4b000000-0000-0000-0000-000000000010','4b000000-0000-0000-0000-00000000000f', 40.00, true, true),
  ('4b000000-0000-0000-0000-000000000021','4b000000-0000-0000-0000-000000000011','4b000000-0000-0000-0000-00000000000f', 40.00, true, true),
  ('4b000000-0000-0000-0000-000000000022','4b000000-0000-0000-0000-000000000012','4b000000-0000-0000-0000-00000000000f', 40.00, true, true);

insert into public.banners (id, title, body, image_asset_id, destination_type,
                            destination_category_id, is_active, sort_order) values
  ('4b000000-0000-0000-0000-000000000030','Banner F4B','Promocao de teste',
   '4b000000-0000-0000-0000-000000000002','category',
   '4b000000-0000-0000-0000-00000000000c', true, 941);

-- =============================================================================
-- A. O CLIENTE ANÔNIMO — é para ele que o link existe
-- =============================================================================
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

-- O defeito, em uma linha: isto voltava nulo.
select pg_temp.checar('anon VE a foto do produto no cardapio', 'f4b/pizza.webp',
  (select imagem_path from public.cardapio_publico()
    where id = '4b000000-0000-0000-0000-000000000010'));

select pg_temp.checar('anon VE a foto do produto na busca', 'f4b/pizza.webp',
  (select imagem_path from public.buscar_catalogo('calabresa')
    where id = '4b000000-0000-0000-0000-000000000010'));

select pg_temp.checar('anon VE o banner', 'f4b/banner.webp',
  (select imagem_path from public.banners_publicos()
    where id = '4b000000-0000-0000-0000-000000000030'));

select pg_temp.checar('o banner leva ao destino certo', 'pizzas-f4b',
  (select destino_slug from public.banners_publicos()
    where id = '4b000000-0000-0000-0000-000000000030'));

-- Produto sem foto continua sem foto, e sem quebrar a consulta.
select pg_temp.checar('produto sem foto devolve caminho nulo', 'true',
  (select (imagem_path is null)::text from public.cardapio_publico()
    where id = '4b000000-0000-0000-0000-000000000012'));

select pg_temp.checar('e ele continua aparecendo no cardapio', '1',
  (select count(*)::text from public.cardapio_publico()
    where id = '4b000000-0000-0000-0000-000000000012'));

-- =============================================================================
-- B. A ARMADILHA DA CORREÇÃO ÓBVIA — §8.1
-- Tornar as projeções `SECURITY DEFINER` faria o catálogo passar por cima da
-- RLS de `products`. Produto inativo TEM foto de propósito nesta fixture.
-- =============================================================================
select pg_temp.checar('produto INATIVO nao aparece no cardapio', '0',
  (select count(*)::text from public.cardapio_publico()
    where id = '4b000000-0000-0000-0000-000000000011'));

select pg_temp.checar('produto INATIVO nao aparece na busca', '0',
  (select count(*)::text from public.buscar_catalogo('secreta')));

-- =============================================================================
-- C. O QUE CONTINUA FECHADO — 03 §8.1 e §23.2
-- =============================================================================
select pg_temp.checar('anon continua sem ler media_assets', '0',
  (select count(*)::text from public.media_assets));

-- A invariante da função: bucket privado nunca sai, nem com o id na mão.
select pg_temp.checar('anon NAO tira o caminho de um comprovante financeiro', 'true',
  (public.caminho_publico_da_midia('4b000000-0000-0000-0000-0000000000f1') is null)::text);

select pg_temp.checar('mas tira o de uma midia de catalogo', 'f4b/pizza.webp',
  public.caminho_publico_da_midia('4b000000-0000-0000-0000-000000000001'));

select pg_temp.checar('id inexistente devolve nulo, nao erro', 'true',
  (public.caminho_publico_da_midia('4b000000-0000-0000-0000-0000000000ee') is null)::text);

select pg_temp.checar('anon continua sem ler pedidos', '0',
  (select count(*)::text from public.orders));
select pg_temp.checar('anon continua sem ler caixa', '0',
  (select count(*)::text from public.cash_sessions));
select pg_temp.checar('anon continua sem ler financeiro', '0',
  (select count(*)::text from public.financial_entries));
select pg_temp.checar('anon continua sem ler funcionarios', '0',
  (select count(*)::text from public.employees));

reset role;

-- =============================================================================
-- D. QUEM ESTÁ LOGADO VÊ O MESMO — e não mais que isso
-- O defeito só apareceu porque logado e anônimo divergiam. Aqui eles são
-- comparados de propósito.
-- =============================================================================
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('4b000000-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','dona4b@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status)
values ('4b000000-2222-0000-0000-000000000001','Dona F4B','owner',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active)
values ('4b000000-3333-0000-0000-000000000001','4b000000-1111-1111-1111-111111111111',
        '4b000000-2222-0000-0000-000000000001',true);
insert into public.user_roles (app_user_id, role_id)
select '4b000000-3333-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';

set local role authenticated;
set local request.jwt.claims = '{"sub":"4b000000-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('logado ve a MESMA foto que o anonimo', 'f4b/pizza.webp',
  (select imagem_path from public.cardapio_publico()
    where id = '4b000000-0000-0000-0000-000000000010'));

select pg_temp.checar('logado ve o MESMO banner', 'f4b/banner.webp',
  (select imagem_path from public.banners_publicos()
    where id = '4b000000-0000-0000-0000-000000000030'));

-- E aqui está o motivo de o defeito ter durado tanto: a projeção é
-- SECURITY INVOKER, então ela mostra o que o CHAMADOR pode ver. Para a Owner,
-- que tem `catalog.view`, produto inativo aparece — e aparecia a foto junto.
-- Quem testa logado vê um cardápio que não é o do cliente.
--
-- Isto não é defeito: é a consequência de manter a RLS decidindo, que é o que
-- protege o catálogo. O que não pode divergir é a MÍDIA, e os dois cenários
-- acima provam que ela passou a ser igual para os dois.
select pg_temp.checar('logado enxerga inativo pela projecao — e e por isso que se testa como anon', '1',
  (select count(*)::text from public.cardapio_publico()
    where id = '4b000000-0000-0000-0000-000000000011'));

reset role;

-- =============================================================================
-- RESULTADO
-- =============================================================================
select
  case when passou then 'OK    ' else 'FALHOU' end
    || ' | ' || lpad(n::text, 3) || ' | ' || rpad(cenario, 58)
    || ' | esperado=' || coalesce(esperado,'(null)') || ' obtido=' || coalesce(obtido,'(null)') as resultado
from resultado_teste where not passou
union all
select 'TOTAL: ' || count(*) || ' cenarios | PASSARAM: ' || count(*) filter (where passou)
  || ' | FALHARAM: ' || count(*) filter (where not passou)
from resultado_teste;

rollback;
