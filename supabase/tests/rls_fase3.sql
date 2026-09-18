-- =============================================================================
-- TESTES DE AUTORIZAÇÃO E REGRAS — FASE 3
--
-- 03-RLS-RBAC-SEGURANCA.md §34 · 05-PLANO-IMPLEMENTACAO.md §7.4 e §14.2
-- 04-REGRAS-NEGOCIO.md PARTE XV (cenários mínimos de aceite)
--
-- Duas naturezas de teste no mesmo arquivo, de propósito:
--   · AUTORIZAÇÃO — quem pode ler e escrever o catálogo e as configurações;
--   · REGRA COMERCIAL — preço, meio a meio, disponibilidade, combo, promoção.
--
-- Preço e disponibilidade NÃO são testados pela interface (exigência da
-- Fase 3): o que está exercitado aqui é o próprio banco, que é a autoridade.
--
-- Roda em transação e termina em ROLLBACK. Nada é persistido.
-- =============================================================================

begin;

create temporary table resultado_teste (
  n serial, cenario text, esperado text, obtido text, passou boolean
) on commit drop;

grant all on resultado_teste to anon, authenticated;
grant all on sequence resultado_teste_n_seq to anon, authenticated;

create or replace function pg_temp.checar(
  p_cenario text, p_esperado text, p_obtido text
) returns void language plpgsql as $$
begin
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido);
end;
$$;

-- Registra o resultado de uma operação que DEVE falhar.
create or replace function pg_temp.checar_erro(
  p_cenario text, p_sql text
) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, 'rejeitado', 'ACEITO', false);
exception when others then
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, 'rejeitado', 'rejeitado', true);
end;
$$;

-- Registra o resultado de uma operação que DEVE funcionar.
create or replace function pg_temp.checar_ok(
  p_cenario text, p_sql text
) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, 'aceito', 'aceito', true);
exception when others then
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, 'aceito', 'ERRO: ' || sqlerrm, false);
end;
$$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona3@teste.local','x',now(),now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','atendente3@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Dona Teste','owner',false,'active'),
  ('aaaaaaaa-0000-0000-0000-000000000002','Atendente Teste','counter',false,'active');

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001',true),
  ('bbbbbbbb-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000002',true);

insert into public.user_roles (app_user_id, role_id)
select 'bbbbbbbb-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.user_roles (app_user_id, role_id)
select 'bbbbbbbb-0000-0000-0000-000000000002', id from public.roles where name = 'Atendente';

-- Loja configurada. O teste zera antes para não depender do estado do ambiente.
delete from public.store_settings;
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code,
  delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values (
  'ccccccc1-0000-0000-0000-000000000001','Pizzaria Teste','5500000000000','Rua Teste','1','Centro',
  'Cidade','XX','00000-000', 40, 60, 20, 30, true, 'America/Sao_Paulo'
);

delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order) values
  (0, true,  null,    null,    0),   -- domingo fechado
  (1, false, '18:00', '23:00', 1),   -- segunda: janela normal
  (2, false, '18:00', '02:00', 2);   -- terça: atravessa a meia-noite

-- Tamanhos: Tradicional aceita meio a meio, Brotinho não (RN-PIZZA-004).
insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('dddddddd-0000-0000-0000-000000000001','Tradicional Teste', 8, 2, 1),
  ('dddddddd-0000-0000-0000-000000000002','Brotinho Teste',    4, 1, 2);

-- Produtos: cada SABOR é um produto (RN-PIZZA-001).
insert into public.products (id, category_id, product_type, name, slug, base_price, sort_order)
select 'eeeeeeee-0000-0000-0000-00000000000' || n, c.id, t, nome, slug, preco, n::integer
from public.categories c,
     (values
       ('1','pizza',  'Calabresa Teste',  'calabresa-teste',  null::numeric),
       ('2','pizza',  'Portuguesa Teste', 'portuguesa-teste', null),
       ('3','pizza',  'Frango Teste',     'frango-teste',     null),
       ('4','drink',  'Coca 2L Teste',    'coca-2l-teste',    12.00),
       ('5','fogazza','Fogazza Teste',    'fogazza-teste',    28.00),
       ('6','combo',  'Combo Teste',      'combo-teste',      70.00)
     ) as v(n, t, nome, slug, preco)
where c.slug = 'pizzas-salgadas';

-- RN-PIZZA-003: nem toda pizza existe em todo tamanho. Frango só no Tradicional.
insert into public.product_variants (id, product_id, size_id, price) values
  ('ffffffff-0000-0000-0000-000000000011','eeeeeeee-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001', 50.00),
  ('ffffffff-0000-0000-0000-000000000012','eeeeeeee-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000002', 30.00),
  ('ffffffff-0000-0000-0000-000000000021','eeeeeeee-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000001', 60.00),
  ('ffffffff-0000-0000-0000-000000000022','eeeeeeee-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000002', 35.00),
  ('ffffffff-0000-0000-0000-000000000031','eeeeeeee-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000001', 55.00);

-- Borda com preço SÓ no Tradicional (RN-BORDA-002) e excluída da Calabresa.
insert into public.crusts (id, name) values
  ('cccccccc-0000-0000-0000-000000000001','Catupiry Teste'),
  ('cccccccc-0000-0000-0000-000000000002','Cheddar Inativa Teste');
update public.crusts set is_active = false where id = 'cccccccc-0000-0000-0000-000000000002';

insert into public.crust_size_prices (crust_id, size_id, price) values
  ('cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001', 8.00),
  ('cccccccc-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000001', 9.00);

insert into public.product_crust_exclusions (product_id, crust_id, size_id, reason) values
  ('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001', null, 'teste');

insert into public.addons (id, name) values
  ('abababab-0000-0000-0000-000000000001','Bacon Teste'),
  ('abababab-0000-0000-0000-000000000002','Azeitona Teste');

insert into public.addon_size_prices (addon_id, size_id, price) values
  ('abababab-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001', 6.00),
  ('abababab-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000001', 3.00);

-- Regra explícita de proibição para um produto (RN-ADD-002).
insert into public.product_addon_rules (product_id, addon_id, size_id, is_allowed) values
  ('eeeeeeee-0000-0000-0000-000000000002','abababab-0000-0000-0000-000000000002', null, false);

-- RN-COMBO-002/003: componentes exatos; a pizza aponta para a variação.
insert into public.combo_components (combo_product_id, component_product_id, component_variant_id, quantity, sort_order) values
  ('eeeeeeee-0000-0000-0000-000000000006','eeeeeeee-0000-0000-0000-000000000001','ffffffff-0000-0000-0000-000000000011', 1, 1),
  ('eeeeeeee-0000-0000-0000-000000000006','eeeeeeee-0000-0000-0000-000000000004', null, 1, 2);

-- Três promoções: vigente, futura e expirada (RN-PROMO-002).
insert into public.promotions (id, name, target_type, variant_id, promotional_price, starts_at, ends_at) values
  ('11111111-0000-0000-0000-000000000001','Vigente',  'variant','ffffffff-0000-0000-0000-000000000021', 45.00, now() - interval '1 day', now() + interval '7 days'),
  ('11111111-0000-0000-0000-000000000002','Futura',   'variant','ffffffff-0000-0000-0000-000000000031', 40.00, now() + interval '5 days', now() + interval '9 days'),
  ('11111111-0000-0000-0000-000000000003','Expirada', 'variant','ffffffff-0000-0000-0000-000000000012', 20.00, now() - interval '9 days', now() - interval '1 day');

insert into public.media_assets (id, bucket, storage_path, mime_type, asset_type) values
  ('dadadada-0000-0000-0000-000000000001','catalogo','teste/banner.webp','image/webp','banner');

insert into public.banners (id, image_asset_id, destination_type, destination_product_id, sort_order) values
  ('babababa-0000-0000-0000-000000000001','dadadada-0000-0000-0000-000000000001','product','eeeeeeee-0000-0000-0000-000000000001', 1);
insert into public.banners (id, image_asset_id, destination_type, destination_promotion_id, sort_order) values
  ('babababa-0000-0000-0000-000000000002','dadadada-0000-0000-0000-000000000001','promotion','11111111-0000-0000-0000-000000000003', 2);
insert into public.banners (id, image_asset_id, destination_type, sort_order) values
  ('babababa-0000-0000-0000-000000000003','dadadada-0000-0000-0000-000000000001','none', 3);
-- RN-BANNER-001: o período é OPCIONAL. Este tem período, e já encerrado.
insert into public.banners (id, image_asset_id, destination_type, starts_at, ends_at, sort_order) values
  ('babababa-0000-0000-0000-000000000004','dadadada-0000-0000-0000-000000000001','none',
   now() - interval '10 days', now() - interval '1 day', 4);

-- =============================================================================
-- 1. ANÔNIMO — lê o cardápio publicável, nada de configuração
-- =============================================================================
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select pg_temp.checar('1.1 anonimo LE categorias ativas', 'true',
  (select (count(*) > 0)::text from public.categories));
select pg_temp.checar('1.2 anonimo LE produtos ativos', 'true',
  (select (count(*) > 0)::text from public.products));
select pg_temp.checar('1.3 anonimo NAO le store_settings', '0',
  (select count(*)::text from public.store_settings));
select pg_temp.checar('1.4 anonimo NAO le store_hours', '0',
  (select count(*)::text from public.store_hours));
select pg_temp.checar('1.5 anonimo NAO le faixas de entrega', '0',
  (select count(*)::text from public.delivery_fee_bands));
select pg_temp.checar('1.6 anonimo NAO le chave Pix', '0',
  (select count(*)::text from public.pix_key_settings));
select pg_temp.checar('1.7 anonimo NAO le formas de pagamento', '0',
  (select count(*)::text from public.payment_methods));
select pg_temp.checar('1.8 anonimo NAO le limites de alerta', '0',
  (select count(*)::text from public.alert_thresholds));
select pg_temp.checar('1.9 anonimo NAO le metadados de midia', '0',
  (select count(*)::text from public.media_assets));
select pg_temp.checar('1.10 anonimo LE a projecao publica da loja', 'Pizzaria Teste',
  (select nome from public.loja_publica()));
select pg_temp.checar('1.11 projecao publica NAO traz coordenada nem autor', 'true',
  (select (count(*) = 0)::text
     from information_schema.columns
    where table_schema = 'public' and table_name = 'loja_publica'
      and column_name in ('latitude','longitude','temporary_closed_by','geocode_provider')));
select pg_temp.checar('1.12 anonimo VE promocao vigente', '1',
  (select count(*)::text from public.promotions where id = '11111111-0000-0000-0000-000000000001'));
select pg_temp.checar('1.13 anonimo NAO ve promocao futura', '0',
  (select count(*)::text from public.promotions where id = '11111111-0000-0000-0000-000000000002'));
select pg_temp.checar('1.14 anonimo NAO ve promocao expirada', '0',
  (select count(*)::text from public.promotions where id = '11111111-0000-0000-0000-000000000003'));

select pg_temp.checar_erro('1.15 anonimo NAO cria produto',
  $q$insert into public.products (category_id, product_type, name, slug)
     select id, 'pizza', 'Invasor', 'invasor' from public.categories limit 1$q$);
select pg_temp.checar_erro('1.16 anonimo NAO cria categoria',
  $q$insert into public.categories (name, slug) values ('Invasora','invasora')$q$);
select pg_temp.checar_erro('1.17 anonimo NAO cria promocao',
  $q$insert into public.promotions (name, target_type, variant_id, promotional_price, starts_at)
     values ('Invasora','variant','ffffffff-0000-0000-0000-000000000011', 1, now())$q$);
select pg_temp.checar_erro('1.18 anonimo NAO envia arquivo ao Storage',
  $q$insert into storage.objects (bucket_id, name) values ('catalogo','invasor.webp')$q$);

reset role;

-- =============================================================================
-- 2. OWNER/ADMIN — caminho permitido (criar, editar, inativar)
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('2.1 dona TEM catalog.manage', 'true',
  public.has_permission('catalog.manage')::text);
select pg_temp.checar('2.2 dona TEM settings.manage', 'true',
  public.has_permission('settings.manage')::text);

select pg_temp.checar_ok('2.3 dona CRIA categoria',
  $q$insert into public.categories (name, slug) values ('Nova Teste','nova-teste')$q$);
select pg_temp.checar_ok('2.4 dona CRIA produto',
  $q$insert into public.products (id, category_id, product_type, name, slug)
     select '0e0e0e0e-0000-0000-0000-000000000001', id, 'pizza', 'Nova Pizza Teste', 'nova-pizza-teste'
     from public.categories where slug = 'nova-teste'$q$);
select pg_temp.checar_ok('2.5 dona CRIA variacao produto x tamanho',
  $q$insert into public.product_variants (product_id, size_id, price)
     values ('0e0e0e0e-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001', 44.00)$q$);
select pg_temp.checar_ok('2.6 dona EDITA preco',
  $q$update public.product_variants set price = 46.00
     where product_id = '0e0e0e0e-0000-0000-0000-000000000001'$q$);
select pg_temp.checar_ok('2.7 dona INATIVA produto',
  $q$update public.products set is_active = false where id = '0e0e0e0e-0000-0000-0000-000000000001'$q$);
select pg_temp.checar_ok('2.8 dona MARCA indisponivel hoje',
  $q$update public.products set is_temporarily_available = false
     where id = 'eeeeeeee-0000-0000-0000-000000000005'$q$);
select pg_temp.checar_ok('2.9 dona PAUSA categoria',
  $q$update public.categories set is_temporarily_available = false where slug = 'nova-teste'$q$);
select pg_temp.checar_ok('2.10 dona CRIA faixa de entrega',
  $q$insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, sort_order)
     values (0, 2, 5.00, 1)$q$);
select pg_temp.checar('2.11 dona LE store_settings', '1',
  (select count(*)::text from public.store_settings));
select pg_temp.checar_ok('2.12 dona ALTERA store_settings',
  $q$update public.store_settings set delivery_eta_max_minutes = 70$q$);
select pg_temp.checar_ok('2.13 dona CONFIGURA chave Pix',
  $q$insert into public.pix_key_settings (is_enabled, key_type, pix_key, recipient_name)
     values (true, 'email', 'pix@teste.local', 'Pizzaria Teste')$q$);
select pg_temp.checar_ok('2.14 dona ENVIA arquivo ao Storage',
  $q$insert into storage.objects (bucket_id, name, owner) values ('catalogo','produto/ok.webp', null)$q$);

-- limpeza do estado alterado, para não contaminar os grupos seguintes
update public.products set is_temporarily_available = true
  where id = 'eeeeeeee-0000-0000-0000-000000000005';
update public.categories set is_temporarily_available = true where slug = 'nova-teste';

reset role;

-- =============================================================================
-- 3. ATENDENTE — o que pode e, principalmente, o que NÃO pode
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('3.1 atendente TEM catalog.view', 'true',
  public.has_permission('catalog.view')::text);
select pg_temp.checar('3.2 atendente NAO tem catalog.manage', 'false',
  public.has_permission('catalog.manage')::text);
select pg_temp.checar('3.3 atendente TEM settings.view', 'true',
  public.has_permission('settings.view')::text);
select pg_temp.checar('3.4 atendente NAO tem settings.manage', 'false',
  public.has_permission('settings.manage')::text);
select pg_temp.checar('3.5 atendente LE o catalogo', 'true',
  (select (count(*) > 0)::text from public.products));
select pg_temp.checar('3.6 atendente LE store_settings', '1',
  (select count(*)::text from public.store_settings));

select pg_temp.checar_erro('3.7 atendente NAO cria produto',
  $q$insert into public.products (category_id, product_type, name, slug)
     select id, 'pizza', 'Do Atendente', 'do-atendente' from public.categories limit 1$q$);
select pg_temp.checar_erro('3.8 atendente NAO cria categoria',
  $q$insert into public.categories (name, slug) values ('Do Atendente','cat-do-atendente')$q$);
select pg_temp.checar_erro('3.9 atendente NAO cria promocao',
  $q$insert into public.promotions (name, target_type, variant_id, promotional_price, starts_at)
     values ('Do Atendente','variant','ffffffff-0000-0000-0000-000000000011', 1, now())$q$);
select pg_temp.checar_erro('3.10 atendente NAO altera faixa de entrega',
  $q$insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee)
     values (90, 95, 1)$q$);
select pg_temp.checar_erro('3.11 atendente NAO envia arquivo ao Storage',
  $q$insert into storage.objects (bucket_id, name) values ('catalogo','produto/invasor.webp')$q$);

-- UPDATE sem permissão não levanta exceção: a policy simplesmente não
-- encontra linha. Por isso a checagem é por LINHAS AFETADAS, e não por erro
-- — a mesma lição do falso negativo corrigido na Fase 2.
do $$
declare v_linhas integer;
begin
  update public.product_variants set price = 1.00
    where id = 'ffffffff-0000-0000-0000-000000000011';
  get diagnostics v_linhas = row_count;
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values ('3.12 atendente NAO altera preco', '0 linhas', v_linhas || ' linhas', v_linhas = 0);
end $$;

do $$
declare v_linhas integer;
begin
  update public.products set is_temporarily_available = false
    where id = 'eeeeeeee-0000-0000-0000-000000000001';
  get diagnostics v_linhas = row_count;
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values ('3.13 atendente NAO pausa disponibilidade', '0 linhas', v_linhas || ' linhas', v_linhas = 0);
end $$;

do $$
declare v_linhas integer;
begin
  update public.store_settings set delivery_minimum_enabled = true;
  get diagnostics v_linhas = row_count;
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values ('3.14 atendente NAO altera configuracao', '0 linhas', v_linhas || ' linhas', v_linhas = 0);
end $$;

do $$
declare v_linhas integer;
begin
  delete from public.categories where slug = 'nova-teste';
  get diagnostics v_linhas = row_count;
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values ('3.15 atendente NAO apaga categoria', '0 linhas', v_linhas || ' linhas', v_linhas = 0);
end $$;

select pg_temp.checar('3.16 preco continua intacto apos tentativa', '50.00',
  (select price::text from public.product_variants where id = 'ffffffff-0000-0000-0000-000000000011'));

reset role;

-- =============================================================================
-- 4. PREÇO EFETIVO E MEIO A MEIO (RN-PIZZA-004 e RN-PIZZA-005)
-- =============================================================================
select pg_temp.checar('4.1 sem promocao, preco efetivo = preco normal', '50.00',
  public.preco_efetivo_variante('ffffffff-0000-0000-0000-000000000011')::text);
select pg_temp.checar('4.2 promocao VIGENTE determina o preco efetivo', '45.00',
  public.preco_efetivo_variante('ffffffff-0000-0000-0000-000000000021')::text);
select pg_temp.checar('4.3 promocao FUTURA nao altera o preco de hoje', '55.00',
  public.preco_efetivo_variante('ffffffff-0000-0000-0000-000000000031')::text);
select pg_temp.checar('4.4 promocao EXPIRADA nao altera o preco de hoje', '30.00',
  public.preco_efetivo_variante('ffffffff-0000-0000-0000-000000000012')::text);
select pg_temp.checar('4.5 promocao futura VALE na data dela', '40.00',
  public.preco_efetivo_variante('ffffffff-0000-0000-0000-000000000031', now() + interval '6 days')::text);

-- Calabresa 50,00 x Portuguesa com promoção 45,00 -> cobra 50,00.
select pg_temp.checar('4.6 meio a meio cobra o MAIOR preco efetivo', '50.00',
  public.preco_meio_a_meio(array['ffffffff-0000-0000-0000-000000000011',
                                 'ffffffff-0000-0000-0000-000000000021']::uuid[])::text);
-- Frango 55,00 x Portuguesa promocional 45,00 -> cobra 55,00.
select pg_temp.checar('4.7 meio a meio ignora o menor, mesmo promocional', '55.00',
  public.preco_meio_a_meio(array['ffffffff-0000-0000-0000-000000000031',
                                 'ffffffff-0000-0000-0000-000000000021']::uuid[])::text);
-- Na data da promoção do Frango (40,00), a Portuguesa (45,00) passa a mandar.
select pg_temp.checar('4.8 o maior preco pode ser o promocional', '45.00',
  public.preco_meio_a_meio(array['ffffffff-0000-0000-0000-000000000031',
                                 'ffffffff-0000-0000-0000-000000000021']::uuid[],
                           now() + interval '6 days')::text);
select pg_temp.checar('4.9 um sabor so = preco daquele sabor', '50.00',
  public.preco_meio_a_meio(array['ffffffff-0000-0000-0000-000000000011']::uuid[])::text);
select pg_temp.checar('4.10 sabor repetido conta uma vez', '50.00',
  public.preco_meio_a_meio(array['ffffffff-0000-0000-0000-000000000011',
                                 'ffffffff-0000-0000-0000-000000000011']::uuid[])::text);

select pg_temp.checar_erro('4.11 meio a meio com TAMANHOS diferentes e recusado',
  $q$select public.preco_meio_a_meio(array['ffffffff-0000-0000-0000-000000000011',
                                           'ffffffff-0000-0000-0000-000000000022']::uuid[])$q$);
select pg_temp.checar_erro('4.12 Brotinho (max 1 sabor) recusa meio a meio',
  $q$select public.preco_meio_a_meio(array['ffffffff-0000-0000-0000-000000000012',
                                           'ffffffff-0000-0000-0000-000000000022']::uuid[])$q$);
select pg_temp.checar_erro('4.13 sabor inexistente e recusado',
  $q$select public.preco_meio_a_meio(array['ffffffff-0000-0000-0000-00000000ffff']::uuid[])$q$);
select pg_temp.checar_erro('4.14 lista vazia e recusada',
  $q$select public.preco_meio_a_meio(array[]::uuid[])$q$);

-- Sabor indisponível derruba a combinação inteira (RN-PIZZA-004).
update public.product_variants set is_temporarily_available = false
  where id = 'ffffffff-0000-0000-0000-000000000021';
select pg_temp.checar_erro('4.15 sabor INDISPONIVEL no tamanho e recusado',
  $q$select public.preco_meio_a_meio(array['ffffffff-0000-0000-0000-000000000011',
                                           'ffffffff-0000-0000-0000-000000000021']::uuid[])$q$);
update public.product_variants set is_temporarily_available = true
  where id = 'ffffffff-0000-0000-0000-000000000021';

-- Tamanho que não é oferecido pelo produto simplesmente não tem variação.
select pg_temp.checar('4.16 Frango NAO e oferecido no Brotinho', '0',
  (select count(*)::text from public.product_variants
    where product_id = 'eeeeeeee-0000-0000-0000-000000000003'
      and size_id = 'dddddddd-0000-0000-0000-000000000002'));

-- =============================================================================
-- 5. DISPONIBILIDADE (RN-DISP-001 a RN-DISP-005)
-- =============================================================================
select pg_temp.checar('5.1 produto ativo e disponivel', 'true',
  public.produto_disponivel('eeeeeeee-0000-0000-0000-000000000001')::text);

update public.products set is_temporarily_available = false
  where id = 'eeeeeeee-0000-0000-0000-000000000001';
select pg_temp.checar('5.2 indisponivel hoje derruba a disponibilidade', 'false',
  public.produto_disponivel('eeeeeeee-0000-0000-0000-000000000001')::text);
select pg_temp.checar('5.3 mas o cadastro continua ATIVO', 'true',
  (select is_active::text from public.products where id = 'eeeeeeee-0000-0000-0000-000000000001'));
update public.products set is_temporarily_available = true
  where id = 'eeeeeeee-0000-0000-0000-000000000001';

update public.products set is_active = false where id = 'eeeeeeee-0000-0000-0000-000000000002';
select pg_temp.checar('5.4 produto inativo nao esta disponivel', 'false',
  public.produto_disponivel('eeeeeeee-0000-0000-0000-000000000002')::text);
update public.products set is_active = true where id = 'eeeeeeee-0000-0000-0000-000000000002';

-- RN-DISP-004: pausar a categoria derruba os produtos dela, sem tocar no
-- estado individual de cada um.
update public.products set is_temporarily_available = false
  where id = 'eeeeeeee-0000-0000-0000-000000000003';
update public.categories set is_temporarily_available = false where slug = 'pizzas-salgadas';
select pg_temp.checar('5.5 categoria PAUSADA derruba produto disponivel', 'false',
  public.produto_disponivel('eeeeeeee-0000-0000-0000-000000000001')::text);
select pg_temp.checar('5.6 categoria pausada continua ATIVA', 'true',
  (select is_active::text from public.categories where slug = 'pizzas-salgadas'));
update public.categories set is_temporarily_available = true where slug = 'pizzas-salgadas';
select pg_temp.checar('5.7 despausar devolve o produto que estava disponivel', 'true',
  public.produto_disponivel('eeeeeeee-0000-0000-0000-000000000001')::text);
select pg_temp.checar('5.8 despausar NAO ressuscita o que estava indisponivel', 'false',
  public.produto_disponivel('eeeeeeee-0000-0000-0000-000000000003')::text);
update public.products set is_temporarily_available = true
  where id = 'eeeeeeee-0000-0000-0000-000000000003';

-- Pizza com um tamanho fora e outro disponível continua vendável.
update public.product_variants set is_temporarily_available = false
  where id = 'ffffffff-0000-0000-0000-000000000012';
select pg_temp.checar('5.9 um tamanho fora nao derruba a pizza', 'true',
  public.produto_disponivel('eeeeeeee-0000-0000-0000-000000000001')::text);
select pg_temp.checar('5.10 a variacao indisponivel e que fica falsa', 'false',
  public.variante_disponivel('ffffffff-0000-0000-0000-000000000012')::text);
update public.product_variants set is_temporarily_available = false
  where id = 'ffffffff-0000-0000-0000-000000000011';
select pg_temp.checar('5.11 TODOS os tamanhos fora derrubam a pizza', 'false',
  public.produto_disponivel('eeeeeeee-0000-0000-0000-000000000001')::text);
update public.product_variants set is_temporarily_available = true
  where product_id = 'eeeeeeee-0000-0000-0000-000000000001';

-- =============================================================================
-- 6. COMBOS (RN-COMBO-001 a RN-COMBO-006)
-- =============================================================================
select pg_temp.checar('6.1 combo com componentes disponiveis esta disponivel', 'true',
  public.produto_disponivel('eeeeeeee-0000-0000-0000-000000000006')::text);

update public.products set is_temporarily_available = false
  where id = 'eeeeeeee-0000-0000-0000-000000000004';
select pg_temp.checar('6.2 componente indisponivel derruba o combo', 'false',
  public.produto_disponivel('eeeeeeee-0000-0000-0000-000000000006')::text);
update public.products set is_temporarily_available = true
  where id = 'eeeeeeee-0000-0000-0000-000000000004';
select pg_temp.checar('6.3 componente volta, combo volta sozinho', 'true',
  public.produto_disponivel('eeeeeeee-0000-0000-0000-000000000006')::text);

update public.product_variants set is_temporarily_available = false
  where id = 'ffffffff-0000-0000-0000-000000000011';
select pg_temp.checar('6.4 VARIACAO exata indisponivel derruba o combo', 'false',
  public.produto_disponivel('eeeeeeee-0000-0000-0000-000000000006')::text);
update public.product_variants set is_temporarily_available = true
  where id = 'ffffffff-0000-0000-0000-000000000011';

select pg_temp.checar('6.5 preco do combo e proprio, nao a soma', '70.00',
  public.preco_efetivo_produto('eeeeeeee-0000-0000-0000-000000000006')::text);

select pg_temp.checar_erro('6.6 pizza em combo SEM variacao e recusada',
  $q$insert into public.combo_components (combo_product_id, component_product_id)
     values ('eeeeeeee-0000-0000-0000-000000000006','eeeeeeee-0000-0000-0000-000000000002')$q$);
select pg_temp.checar_erro('6.7 variacao de OUTRO produto e recusada',
  $q$insert into public.combo_components (combo_product_id, component_product_id, component_variant_id)
     values ('eeeeeeee-0000-0000-0000-000000000006','eeeeeeee-0000-0000-0000-000000000002',
             'ffffffff-0000-0000-0000-000000000031')$q$);
select pg_temp.checar_erro('6.8 combo dentro de combo e recusado',
  $q$insert into public.combo_components (combo_product_id, component_product_id)
     values ('eeeeeeee-0000-0000-0000-000000000006','eeeeeeee-0000-0000-0000-000000000006')$q$);
select pg_temp.checar_erro('6.9 componente com quantidade zero e recusado',
  $q$insert into public.combo_components (combo_product_id, component_product_id, quantity)
     values ('eeeeeeee-0000-0000-0000-000000000006','eeeeeeee-0000-0000-0000-000000000005', 0)$q$);
select pg_temp.checar_erro('6.10 combo NAO aceita variacao por tamanho',
  $q$insert into public.product_variants (product_id, size_id, price)
     values ('eeeeeeee-0000-0000-0000-000000000006','dddddddd-0000-0000-0000-000000000001', 70)$q$);
select pg_temp.checar_erro('6.11 combo SEM preco proprio e recusado',
  $q$insert into public.products (category_id, product_type, name, slug)
     select id, 'combo', 'Combo Sem Preco', 'combo-sem-preco' from public.categories limit 1$q$);

-- =============================================================================
-- 7. BORDAS E ADICIONAIS (RN-BORDA-001/002/003, RN-ADD-001/002)
-- =============================================================================
select pg_temp.checar('7.1 borda com preco no tamanho e permitida', 'true',
  public.borda_permitida('eeeeeeee-0000-0000-0000-000000000002',
                         'dddddddd-0000-0000-0000-000000000001',
                         'cccccccc-0000-0000-0000-000000000001')::text);
select pg_temp.checar('7.2 borda SEM preco no tamanho e negada', 'false',
  public.borda_permitida('eeeeeeee-0000-0000-0000-000000000002',
                         'dddddddd-0000-0000-0000-000000000002',
                         'cccccccc-0000-0000-0000-000000000001')::text);
select pg_temp.checar('7.3 EXCLUSAO do produto nega a borda', 'false',
  public.borda_permitida('eeeeeeee-0000-0000-0000-000000000001',
                         'dddddddd-0000-0000-0000-000000000001',
                         'cccccccc-0000-0000-0000-000000000001')::text);
select pg_temp.checar('7.4 borda INATIVA e negada', 'false',
  public.borda_permitida('eeeeeeee-0000-0000-0000-000000000002',
                         'dddddddd-0000-0000-0000-000000000001',
                         'cccccccc-0000-0000-0000-000000000002')::text);
select pg_temp.checar('7.5 preco da borda vem do tamanho', '8.00',
  public.preco_borda('cccccccc-0000-0000-0000-000000000001',
                     'dddddddd-0000-0000-0000-000000000001')::text);

select pg_temp.checar('7.6 adicional ativo e permitido por padrao', 'true',
  public.adicional_permitido('eeeeeeee-0000-0000-0000-000000000001',
                             'dddddddd-0000-0000-0000-000000000001',
                             'abababab-0000-0000-0000-000000000001')::text);
select pg_temp.checar('7.7 REGRA explicita de proibicao nega o adicional', 'false',
  public.adicional_permitido('eeeeeeee-0000-0000-0000-000000000002',
                             'dddddddd-0000-0000-0000-000000000001',
                             'abababab-0000-0000-0000-000000000002')::text);
select pg_temp.checar('7.8 adicional SEM preco no tamanho e negado', 'false',
  public.adicional_permitido('eeeeeeee-0000-0000-0000-000000000001',
                             'dddddddd-0000-0000-0000-000000000002',
                             'abababab-0000-0000-0000-000000000001')::text);

update public.addons set is_temporarily_available = false
  where id = 'abababab-0000-0000-0000-000000000001';
select pg_temp.checar('7.9 adicional indisponivel hoje e negado', 'false',
  public.adicional_permitido('eeeeeeee-0000-0000-0000-000000000001',
                             'dddddddd-0000-0000-0000-000000000001',
                             'abababab-0000-0000-0000-000000000001')::text);
update public.addons set is_temporarily_available = true
  where id = 'abababab-0000-0000-0000-000000000001';

-- RN-ADD-001: o desligamento global vence qualquer cadastro.
update public.store_settings set addons_enabled = false;
select pg_temp.checar('7.10 adicionais DESLIGADOS globalmente negam tudo', 'false',
  public.adicional_permitido('eeeeeeee-0000-0000-0000-000000000001',
                             'dddddddd-0000-0000-0000-000000000001',
                             'abababab-0000-0000-0000-000000000001')::text);
update public.store_settings set addons_enabled = true;

-- =============================================================================
-- 8. PROMOÇÕES (RN-PROMO-002 a RN-PROMO-006)
-- =============================================================================
select pg_temp.checar_erro('8.1 periodo SOBREPOSTO no mesmo alvo e recusado',
  $q$insert into public.promotions (name, target_type, variant_id, promotional_price, starts_at, ends_at)
     values ('Conflitante','variant','ffffffff-0000-0000-0000-000000000021', 42.00,
             now(), now() + interval '2 days')$q$);
select pg_temp.checar_ok('8.2 periodo ADJACENTE no mesmo alvo e aceito',
  $q$insert into public.promotions (name, target_type, variant_id, promotional_price, starts_at, ends_at)
     values ('Seguinte','variant','ffffffff-0000-0000-0000-000000000021', 42.00,
             now() + interval '7 days', now() + interval '9 days')$q$);
select pg_temp.checar_ok('8.3 promocao INATIVA nao conflita',
  $q$insert into public.promotions (name, target_type, variant_id, promotional_price, starts_at, ends_at, is_active)
     values ('Desativada','variant','ffffffff-0000-0000-0000-000000000021', 41.00,
             now(), now() + interval '2 days', false)$q$);
select pg_temp.checar_erro('8.4 fim anterior ao inicio e recusado',
  $q$insert into public.promotions (name, target_type, variant_id, promotional_price, starts_at, ends_at)
     values ('Invertida','variant','ffffffff-0000-0000-0000-000000000012', 10.00,
             now(), now() - interval '1 day')$q$);
select pg_temp.checar_erro('8.5 alvo duplo (produto E variacao) e recusado',
  $q$insert into public.promotions (name, target_type, product_id, variant_id, promotional_price, starts_at)
     values ('Ambigua','variant','eeeeeeee-0000-0000-0000-000000000004',
             'ffffffff-0000-0000-0000-000000000012', 10.00, now())$q$);
select pg_temp.checar_erro('8.6 promocao por PRODUTO em pizza com variacao e recusada',
  $q$insert into public.promotions (name, target_type, product_id, promotional_price, starts_at)
     values ('No produto errado','product','eeeeeeee-0000-0000-0000-000000000001', 40.00, now())$q$);
select pg_temp.checar_ok('8.7 promocao por PRODUTO em bebida e aceita',
  $q$insert into public.promotions (name, target_type, product_id, promotional_price, starts_at)
     values ('Refri em promo','product','eeeeeeee-0000-0000-0000-000000000004', 9.00, now())$q$);
select pg_temp.checar('8.8 promocao de produto muda o preco efetivo', '9.00',
  public.preco_efetivo_produto('eeeeeeee-0000-0000-0000-000000000004')::text);
select pg_temp.checar_ok('8.9 combo pode ter promocao propria',
  $q$insert into public.promotions (name, target_type, product_id, promotional_price, starts_at)
     values ('Combo em promo','product','eeeeeeee-0000-0000-0000-000000000006', 60.00, now())$q$);
select pg_temp.checar_erro('8.10 preco promocional negativo e recusado',
  $q$insert into public.promotions (name, target_type, variant_id, promotional_price, starts_at)
     values ('Negativa','variant','ffffffff-0000-0000-0000-000000000031', -1, now())$q$);

-- =============================================================================
-- 9. LOJA: FAIXAS, HORÁRIO E FECHAMENTO (RN-LOJA-001 a RN-LOJA-004)
-- =============================================================================
select pg_temp.checar_ok('9.1 faixa adjacente e aceita',
  $q$insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, sort_order)
     values (2, 4, 8.00, 2)$q$);
select pg_temp.checar_erro('9.2 faixa SOBREPOSTA e recusada',
  $q$insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, sort_order)
     values (3, 6, 12.00, 3)$q$);
select pg_temp.checar_ok('9.3 faixa sobreposta porem INATIVA e aceita',
  $q$insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active)
     values (3, 6, 12.00, false)$q$);
select pg_temp.checar_erro('9.4 faixa com maximo menor que o minimo e recusada',
  $q$insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee)
     values (10, 8, 5.00)$q$);
select pg_temp.checar_erro('9.5 taxa negativa e recusada',
  $q$insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee)
     values (20, 25, -1)$q$);

-- 2026-09-21 é segunda-feira; 2026-09-22, terça.
select pg_temp.checar('9.6 segunda 20h: aberta', 'true',
  public.loja_aberta('2026-09-21 20:00:00-03'::timestamptz)::text);
select pg_temp.checar('9.7 segunda 23h30: fechada', 'false',
  public.loja_aberta('2026-09-21 23:30:00-03'::timestamptz)::text);
select pg_temp.checar('9.8 domingo: fechada', 'false',
  public.loja_aberta('2026-09-20 20:00:00-03'::timestamptz)::text);
-- Janela que atravessa a meia-noite: 01h de quarta pertence à terça.
select pg_temp.checar('9.9 terca 23h (janela ate 02h): aberta', 'true',
  public.loja_aberta('2026-09-22 23:00:00-03'::timestamptz)::text);
select pg_temp.checar('9.10 quarta 01h ainda e a janela da terca: aberta', 'true',
  public.loja_aberta('2026-09-23 01:00:00-03'::timestamptz)::text);
select pg_temp.checar('9.11 quarta 03h: fechada', 'false',
  public.loja_aberta('2026-09-23 03:00:00-03'::timestamptz)::text);

update public.store_settings
  set is_temporarily_closed = true, temporary_close_reason = 'Forno em manutencao',
      temporary_closed_at = now();
select pg_temp.checar('9.12 fechamento temporario vence o horario', 'false',
  public.loja_aberta('2026-09-21 20:00:00-03'::timestamptz)::text);
select pg_temp.checar('9.13 projecao publica informa o motivo', 'Forno em manutencao',
  (select motivo_fechamento from public.loja_publica()));
update public.store_settings
  set is_temporarily_closed = false, temporary_close_reason = null, temporary_closed_at = null;

select pg_temp.checar_erro('9.14 fechar sem motivo e recusado',
  $q$update public.store_settings set is_temporarily_closed = true$q$);
select pg_temp.checar_erro('9.15 segunda loja e recusada (V1 single-store)',
  $q$insert into public.store_settings (
       store_name, whatsapp, address_street, address_number, address_neighborhood,
       address_city, address_state, address_postal_code,
       delivery_eta_min_minutes, delivery_eta_max_minutes,
       pickup_eta_min_minutes, pickup_eta_max_minutes)
     values ('Outra','x','r','1','b','c','XX','0', 1, 2, 1, 2)$q$);
select pg_temp.checar_erro('9.16 pedido minimo ativo sem valor e recusado',
  $q$update public.store_settings set delivery_minimum_enabled = true,
       delivery_minimum_subtotal = null$q$);
select pg_temp.checar_erro('9.17 Pix habilitado sem chave e recusado',
  $q$update public.pix_key_settings set is_enabled = true, pix_key = null$q$);

-- RN-LOJA-004: o override temporário é o que a projeção pública devolve.
update public.store_settings set current_delivery_eta_min_minutes = 80,
                                 current_delivery_eta_max_minutes = 110;
select pg_temp.checar('9.18 override temporario prevalece na projecao', '80',
  (select entrega_eta_min::text from public.loja_publica()));
update public.store_settings set current_delivery_eta_min_minutes = null,
                                 current_delivery_eta_max_minutes = null;

-- =============================================================================
-- 10. BANNERS (RN-BANNER-001 a RN-BANNER-004)
-- =============================================================================
select pg_temp.checar('10.1 banner de produto disponivel e visivel', 'true',
  public.banner_visivel('babababa-0000-0000-0000-000000000001')::text);
update public.products set is_temporarily_available = false
  where id = 'eeeeeeee-0000-0000-0000-000000000001';
select pg_temp.checar('10.2 banner some quando o produto fica indisponivel', 'false',
  public.banner_visivel('babababa-0000-0000-0000-000000000001')::text);
update public.products set is_temporarily_available = true
  where id = 'eeeeeeee-0000-0000-0000-000000000001';
select pg_temp.checar('10.3 banner volta com o produto', 'true',
  public.banner_visivel('babababa-0000-0000-0000-000000000001')::text);
select pg_temp.checar('10.4 banner de promocao EXPIRADA nao aparece', 'false',
  public.banner_visivel('babababa-0000-0000-0000-000000000002')::text);
select pg_temp.checar('10.5 banner sem destino e sem periodo aparece sempre', 'true',
  public.banner_visivel('babababa-0000-0000-0000-000000000003')::text);
select pg_temp.checar('10.6 banner com periodo ENCERRADO nao aparece', 'false',
  public.banner_visivel('babababa-0000-0000-0000-000000000004')::text);
select pg_temp.checar('10.6b o mesmo banner aparecia dentro do periodo dele', 'true',
  public.banner_visivel('babababa-0000-0000-0000-000000000004', now() - interval '5 days')::text);
select pg_temp.checar('10.6c banner AGENDADO ainda nao aparece', 'false',
  public.banner_visivel('babababa-0000-0000-0000-000000000004', now() - interval '20 days')::text);

select pg_temp.checar_erro('10.7 destino externo sem URL e recusado',
  $q$insert into public.banners (image_asset_id, destination_type)
     values ('dadadada-0000-0000-0000-000000000001','external')$q$);
select pg_temp.checar_erro('10.8 destino de produto sem produto e recusado',
  $q$insert into public.banners (image_asset_id, destination_type)
     values ('dadadada-0000-0000-0000-000000000001','product')$q$);
select pg_temp.checar_erro('10.9 URL externa invalida e recusada',
  $q$insert into public.banners (image_asset_id, destination_type, external_url)
     values ('dadadada-0000-0000-0000-000000000001','external','javascript:alert(1)')$q$);
select pg_temp.checar_erro('10.10 banner sem imagem e recusado',
  $q$insert into public.banners (destination_type) values ('none')$q$);

-- =============================================================================
-- 11. AUDITORIA DAS CONFIGURAÇÕES (03 §7.2 e §22.2)
-- =============================================================================
select pg_temp.checar('11.1 alterar store_settings gera auditoria', 'true',
  (select (count(*) > 0)::text from public.audit_logs
    where entity_type = 'store_settings' and action = 'update_store_settings'));
select pg_temp.checar('11.2 faixa de entrega gera auditoria', 'true',
  (select (count(*) > 0)::text from public.audit_logs
    where entity_type = 'delivery_fee_bands'));
select pg_temp.checar('11.3 promocao gera auditoria', 'true',
  (select (count(*) > 0)::text from public.audit_logs where entity_type = 'promotions'));
select pg_temp.checar('11.4 horario gera auditoria', 'true',
  (select (count(*) > 0)::text from public.audit_logs where entity_type = 'store_hours'));
select pg_temp.checar('11.5 a chave Pix NAO aparece na auditoria', 'true',
  (select (count(*) = 0)::text from public.audit_logs
    where entity_type = 'pix_key_settings'
      and (after_data::text like '%pix@teste.local%' or before_data::text like '%pix@teste.local%')));
select pg_temp.checar('11.6 mas a alteracao do Pix FICA registrada', 'true',
  (select (count(*) > 0)::text from public.audit_logs where entity_type = 'pix_key_settings'));
select pg_temp.checar('11.7 catalogo NAO gera auditoria (fora do minimo de §22.2)', '0',
  (select count(*)::text from public.audit_logs where entity_type = 'products'));

-- =============================================================================
-- 12. INTEGRIDADE ESTRUTURAL
-- =============================================================================
select pg_temp.checar_erro('12.1 produto em categoria inexistente e recusado',
  $q$insert into public.products (category_id, product_type, name, slug)
     values ('00000000-0000-0000-0000-000000000000','pizza','Orfa','orfa')$q$);
select pg_temp.checar_erro('12.2 tipo de produto invalido e recusado',
  $q$insert into public.products (category_id, product_type, name, slug)
     select id, 'sorvete', 'Invalida', 'invalida' from public.categories limit 1$q$);
select pg_temp.checar_erro('12.3 tamanho com zero fatias e recusado',
  $q$insert into public.pizza_sizes (name, slice_count) values ('Zero', 0)$q$);
select pg_temp.checar_erro('12.4 tamanho com max_flavors zero e recusado',
  $q$insert into public.pizza_sizes (name, slice_count, max_flavors) values ('Sem sabor', 8, 0)$q$);
select pg_temp.checar_erro('12.5 preco negativo em variacao e recusado',
  $q$insert into public.product_variants (product_id, size_id, price)
     values ('eeeeeeee-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000002', -1)$q$);
select pg_temp.checar_erro('12.6 slug invalido e recusado',
  $q$insert into public.categories (name, slug) values ('Com Espaco','com espaco')$q$);
select pg_temp.checar_erro('12.7 mesma variacao duas vezes e recusada',
  $q$insert into public.product_variants (product_id, size_id, price)
     values ('eeeeeeee-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001', 99)$q$);
select pg_temp.checar_erro('12.8 apagar categoria com produto e recusado',
  $q$delete from public.categories where slug = 'pizzas-salgadas'$q$);
select pg_temp.checar_erro('12.9 apagar imagem referenciada por banner e recusado',
  $q$delete from public.media_assets where id = 'dadadada-0000-0000-0000-000000000001'$q$);
select pg_temp.checar_erro('12.10 dois horarios para o mesmo dia e recusado',
  $q$insert into public.store_hours (weekday, is_closed, opens_at, closes_at)
     values (1, false, '10:00', '12:00')$q$);
select pg_temp.checar_erro('12.11 dia aberto sem janela e recusado',
  $q$insert into public.store_hours (weekday, is_closed) values (3, false)$q$);

-- =============================================================================
-- RESULTADO
-- =============================================================================
select
  case when passou then 'OK    ' else 'FALHOU' end
    || ' | ' || lpad(n::text, 3)
    || ' | ' || rpad(cenario, 58)
    || ' | esperado=' || coalesce(esperado,'(null)')
    || ' obtido=' || coalesce(obtido,'(null)') as resultado
from resultado_teste
union all
select '------------------------------------------------------------------'
union all
select 'TOTAL: ' || count(*) || ' cenarios | PASSARAM: '
  || count(*) filter (where passou) || ' | FALHARAM: '
  || count(*) filter (where not passou)
from resultado_teste;

rollback;
