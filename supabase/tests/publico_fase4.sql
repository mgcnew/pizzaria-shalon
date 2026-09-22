-- =============================================================================
-- TESTES DA EXPERIÊNCIA PÚBLICA — FASE 4
--
-- 05-PLANO-IMPLEMENTACAO.md §8 · 03-RLS-RBAC-SEGURANCA.md §8 e §34
-- 04-REGRAS-NEGOCIO.md PARTE II e III
--
-- Tudo roda como `anon`: é o papel do cliente público, sem login. O que
-- passa aqui passa pelo mesmo caminho que o navegador percorre.
--
-- Preço e disponibilidade são exercitados FORA da interface, como a Fase 4
-- exige — a tela é verificada à parte, no navegador.
--
-- Transação com ROLLBACK. Nada é persistido, e os dados que já existem no
-- ambiente não são tocados: as fixtures usam nomes próprios de teste.
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
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code,
  delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values (
  'ccccccc4-0000-0000-0000-000000000001','Shalon Teste','5500000000000','Rua T','1','Centro',
  'Cidade','XX','00000-000', 40, 60, 20, 30, true, 'America/Sao_Paulo'
) on conflict do nothing;

delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d4d4d4d4-0000-0000-0000-000000000001','Grande F4', 8, 2, 101),
  ('d4d4d4d4-0000-0000-0000-000000000002','Mini F4',   4, 1, 102);

-- Categoria própria, para testar pausa sem afetar as reais.
insert into public.categories (id, name, slug, sort_order) values
  ('c4c4c4c4-0000-0000-0000-000000000001','Pizzas F4','pizzas-f4', 101),
  ('c4c4c4c4-0000-0000-0000-000000000002','Bebidas F4','bebidas-f4', 102);

insert into public.products (id, category_id, product_type, name, slug, short_description, base_price, sort_order, is_active)
values
  ('e4e4e4e4-0000-0000-0000-000000000001','c4c4c4c4-0000-0000-0000-000000000001','pizza','Calabresa Ácida F4','calabresa-acida-f4','Calabresa e cebola', null, 1, true),
  ('e4e4e4e4-0000-0000-0000-000000000002','c4c4c4c4-0000-0000-0000-000000000001','pizza','Portuguesa F4','portuguesa-f4','Ovos e presunto', null, 2, true),
  ('e4e4e4e4-0000-0000-0000-000000000003','c4c4c4c4-0000-0000-0000-000000000001','pizza','Inativa F4','inativa-f4','Nunca aparece', null, 3, false),
  ('e4e4e4e4-0000-0000-0000-000000000004','c4c4c4c4-0000-0000-0000-000000000002','drink','Guaraná F4','guarana-f4','Gelado', 12.00, 4, true),
  ('e4e4e4e4-0000-0000-0000-000000000005','c4c4c4c4-0000-0000-0000-000000000001','combo','Combo F4','combo-f4','Pizza e bebida', 70.00, 5, true);

insert into public.product_variants (id, product_id, size_id, price) values
  ('f4f4f4f4-0000-0000-0000-000000000011','e4e4e4e4-0000-0000-0000-000000000001','d4d4d4d4-0000-0000-0000-000000000001', 50.00),
  ('f4f4f4f4-0000-0000-0000-000000000012','e4e4e4e4-0000-0000-0000-000000000001','d4d4d4d4-0000-0000-0000-000000000002', 30.00),
  ('f4f4f4f4-0000-0000-0000-000000000021','e4e4e4e4-0000-0000-0000-000000000002','d4d4d4d4-0000-0000-0000-000000000001', 60.00),
  ('f4f4f4f4-0000-0000-0000-000000000022','e4e4e4e4-0000-0000-0000-000000000002','d4d4d4d4-0000-0000-0000-000000000002', 35.00);

-- Borda só no Grande, e excluída da Calabresa (RN-BORDA-003).
insert into public.crusts (id, name) values ('cbcbcbcb-0000-0000-0000-000000000001','Cheddar F4');
insert into public.crust_size_prices (crust_id, size_id, price) values
  ('cbcbcbcb-0000-0000-0000-000000000001','d4d4d4d4-0000-0000-0000-000000000001', 8.00);
insert into public.product_crust_exclusions (product_id, crust_id, size_id) values
  ('e4e4e4e4-0000-0000-0000-000000000001','cbcbcbcb-0000-0000-0000-000000000001', null);

insert into public.addons (id, name) values
  ('a4a4a4a4-0000-0000-0000-000000000001','Bacon F4'),
  ('a4a4a4a4-0000-0000-0000-000000000002','Azeitona F4');
insert into public.addon_size_prices (addon_id, size_id, price) values
  ('a4a4a4a4-0000-0000-0000-000000000001','d4d4d4d4-0000-0000-0000-000000000001', 6.00),
  ('a4a4a4a4-0000-0000-0000-000000000002','d4d4d4d4-0000-0000-0000-000000000001', 3.00);
insert into public.product_addon_rules (product_id, addon_id, size_id, is_allowed) values
  ('e4e4e4e4-0000-0000-0000-000000000001','a4a4a4a4-0000-0000-0000-000000000002', null, false);

insert into public.combo_components (combo_product_id, component_product_id, component_variant_id, quantity, sort_order) values
  ('e4e4e4e4-0000-0000-0000-000000000005','e4e4e4e4-0000-0000-0000-000000000001','f4f4f4f4-0000-0000-0000-000000000011', 1, 1),
  ('e4e4e4e4-0000-0000-0000-000000000005','e4e4e4e4-0000-0000-0000-000000000004', null, 1, 2);

-- Promoções: vigente, futura e expirada.
insert into public.promotions (id, name, target_type, variant_id, promotional_price, starts_at, ends_at, max_quantity_per_order) values
  ('14141414-0000-0000-0000-000000000001','Vigente F4','variant','f4f4f4f4-0000-0000-0000-000000000021', 45.00, now() - interval '1 day', now() + interval '7 days', 2),
  ('14141414-0000-0000-0000-000000000002','Futura F4','variant','f4f4f4f4-0000-0000-0000-000000000011', 40.00, now() + interval '5 days', now() + interval '9 days', null),
  ('14141414-0000-0000-0000-000000000003','Expirada F4','variant','f4f4f4f4-0000-0000-0000-000000000012', 20.00, now() - interval '9 days', now() - interval '1 day', null);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- =============================================================================
-- 1. CATÁLOGO PÚBLICO
-- =============================================================================
select pg_temp.checar('1.1 cardapio publico lista produtos ativos', 'true',
  (select (count(*) >= 4)::text from public.cardapio_publico()));
select pg_temp.checar('1.2 produto INATIVO nao aparece no cardapio', '0',
  (select count(*)::text from public.cardapio_publico() where slug = 'inativa-f4'));
select pg_temp.checar('1.3 produto inativo tambem nao abre por link', '0',
  (select count(*)::text from public.produto_publico('inativa-f4')));
select pg_temp.checar('1.4 categorias publicas trazem contagem', 'true',
  (select (produtos > 0)::text from public.categorias_publicas() where slug = 'pizzas-f4'));
select pg_temp.checar('1.5 pizza com tamanhos marca tem_tamanhos', 'true',
  (select tem_tamanhos::text from public.cardapio_publico() where slug = 'calabresa-acida-f4'));
select pg_temp.checar('1.6 bebida NAO tem tamanhos (RN-BEB-001)', 'false',
  (select tem_tamanhos::text from public.cardapio_publico() where slug = 'guarana-f4'));
select pg_temp.checar('1.7 preco do cardapio e o menor tamanho', '30.00',
  (select preco::text from public.cardapio_publico() where slug = 'calabresa-acida-f4'));
select pg_temp.checar('1.8 preco_max e o maior tamanho', '50.00',
  (select preco_max::text from public.cardapio_publico() where slug = 'calabresa-acida-f4'));

-- =============================================================================
-- 2. DISPONIBILIDADE (RN-DISP e RN-BUSCA-002)
-- =============================================================================

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.products set is_temporarily_available = false
  where id = 'e4e4e4e4-0000-0000-0000-000000000004';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('2.1 indisponivel CONTINUA no cardapio', '1',
  (select count(*)::text from public.cardapio_publico() where slug = 'guarana-f4'));
select pg_temp.checar('2.2 ...mas marcado como indisponivel', 'false',
  (select disponivel::text from public.cardapio_publico() where slug = 'guarana-f4'));
select pg_temp.checar('2.3 e NAO pode ser montado', 'Indisponível no momento.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000004"}'::jsonb) ->> 'erro'));

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.products set is_temporarily_available = true
  where id = 'e4e4e4e4-0000-0000-0000-000000000004';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- RN-DISP-004: categoria pausada derruba os produtos, sem inativar nada.

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.categories set is_temporarily_available = false where slug = 'pizzas-f4';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('2.4 categoria PAUSADA continua visivel', '1',
  (select count(*)::text from public.categorias_publicas() where slug = 'pizzas-f4'));
select pg_temp.checar('2.5 categoria pausada aparece marcada', 'true',
  (select pausada::text from public.categorias_publicas() where slug = 'pizzas-f4'));
select pg_temp.checar('2.6 produtos da categoria pausada ficam indisponiveis', 'false',
  (select disponivel::text from public.cardapio_publico() where slug = 'calabresa-acida-f4'));
select pg_temp.checar('2.7 e nao podem ser montados', 'Indisponível no momento.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000011"}'::jsonb) ->> 'erro'));

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.categories set is_temporarily_available = true where slug = 'pizzas-f4';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('2.8 despausar devolve a disponibilidade', 'true',
  (select disponivel::text from public.cardapio_publico() where slug = 'calabresa-acida-f4'));

-- =============================================================================
-- 3. PROMOÇÕES (RN-PROMO e RN-LINK-002)
-- =============================================================================
select pg_temp.checar('3.1 promocao VIGENTE muda o preco publico', '45.00',
  (select preco::text from public.tamanhos_publicos('e4e4e4e4-0000-0000-0000-000000000002')
    where variacao_id = 'f4f4f4f4-0000-0000-0000-000000000021'));
select pg_temp.checar('3.2 ...e o "de" continua sendo o preco normal', '60.00',
  (select preco_de::text from public.tamanhos_publicos('e4e4e4e4-0000-0000-0000-000000000002')
    where variacao_id = 'f4f4f4f4-0000-0000-0000-000000000021'));
select pg_temp.checar('3.3 promocao FUTURA nao altera o preco de hoje', '50.00',
  (select preco::text from public.tamanhos_publicos('e4e4e4e4-0000-0000-0000-000000000001')
    where variacao_id = 'f4f4f4f4-0000-0000-0000-000000000011'));
select pg_temp.checar('3.4 promocao EXPIRADA nao concede preco antigo', '30.00',
  (select preco::text from public.tamanhos_publicos('e4e4e4e4-0000-0000-0000-000000000001')
    where variacao_id = 'f4f4f4f4-0000-0000-0000-000000000012'));
select pg_temp.checar('3.5 o link do produto com promo expirada abre normalmente', '1',
  (select count(*)::text from public.produto_publico('calabresa-acida-f4')));
select pg_temp.checar('3.6 produto em promocao fica sinalizado', 'true',
  (select em_promocao::text from public.cardapio_publico() where slug = 'portuguesa-f4'));
select pg_temp.checar('3.7 anonimo NAO enxerga a promocao futura', '0',
  (select count(*)::text from public.promotions where id = '14141414-0000-0000-0000-000000000002'));

-- =============================================================================
-- 4. MONTAGEM DE PIZZA (RN-PIZZA-004/005)
-- =============================================================================
select pg_temp.checar('4.1 pizza inteira usa o preco do sabor', '50.00',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000011"}'::jsonb) ->> 'preco_unitario'));
select pg_temp.checar('4.2 meio a meio cobra o MAIOR preco efetivo', '50.00',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000011","sabores":["f4f4f4f4-0000-0000-0000-000000000011","f4f4f4f4-0000-0000-0000-000000000021"]}'::jsonb) ->> 'preco_unitario'));
select pg_temp.checar('4.3 o maior preco considera a promocao vigente', 'true',
  ((public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000011","sabores":["f4f4f4f4-0000-0000-0000-000000000011","f4f4f4f4-0000-0000-0000-000000000021"]}'::jsonb) ->> 'preco_unitario')::numeric = 50.00)::text);
select pg_temp.checar('4.4 tamanho de 1 sabor RECUSA meio a meio',
  'Este tamanho não aceita essa quantidade de sabores.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000012","sabores":["f4f4f4f4-0000-0000-0000-000000000012","f4f4f4f4-0000-0000-0000-000000000022"]}'::jsonb) ->> 'erro'));
select pg_temp.checar('4.5 sabores de tamanhos diferentes sao recusados',
  'Os sabores escolhidos não estão disponíveis no mesmo tamanho.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000011","sabores":["f4f4f4f4-0000-0000-0000-000000000011","f4f4f4f4-0000-0000-0000-000000000022"]}'::jsonb) ->> 'erro'));
select pg_temp.checar('4.6 pizza sem tamanho e recusada', 'Escolha um tamanho.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001"}'::jsonb) ->> 'erro'));
select pg_temp.checar('4.7 sabores oferecidos no tamanho vem do banco', '2',
  (select count(*)::text from public.sabores_publicos('d4d4d4d4-0000-0000-0000-000000000001')));
select pg_temp.checar('4.8 tamanho Mini so tem 1 sabor permitido', '1',
  (select max_sabores::text from public.tamanhos_publicos('e4e4e4e4-0000-0000-0000-000000000001')
    where tamanho_id = 'd4d4d4d4-0000-0000-0000-000000000002'));
select pg_temp.checar('4.9 rotulos descrevem a configuracao', 'true',
  ((public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000011","sabores":["f4f4f4f4-0000-0000-0000-000000000011","f4f4f4f4-0000-0000-0000-000000000021"]}'::jsonb) ->> 'rotulos') like '%Meio a meio%')::text);

-- Sabor indisponível derruba a combinação inteira.

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.product_variants set is_temporarily_available = false
  where id = 'f4f4f4f4-0000-0000-0000-000000000021';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('4.10 sabor indisponivel recusa o meio a meio',
  'Um dos sabores está indisponível no tamanho escolhido.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000011","sabores":["f4f4f4f4-0000-0000-0000-000000000011","f4f4f4f4-0000-0000-0000-000000000021"]}'::jsonb) ->> 'erro'));
select pg_temp.checar('4.11 ...e ele some da lista de sabores do tamanho', 'false',
  (select disponivel::text from public.sabores_publicos('d4d4d4d4-0000-0000-0000-000000000001')
    where variacao_id = 'f4f4f4f4-0000-0000-0000-000000000021'));

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.product_variants set is_temporarily_available = true
  where id = 'f4f4f4f4-0000-0000-0000-000000000021';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- =============================================================================
-- 5. BORDAS E ADICIONAIS
-- =============================================================================
-- Portuguesa Grande está com promoção vigente a 45,00: a borda soma sobre o
-- preço EFETIVO, não sobre o preço de tabela (RN-PIZZA-005 + RN-BORDA-002).
select pg_temp.checar('5.1 borda soma sobre o preco EFETIVO (45 + 8)', '53.00',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000002","variacao_id":"f4f4f4f4-0000-0000-0000-000000000021","borda_id":"cbcbcbcb-0000-0000-0000-000000000001"}'::jsonb) ->> 'preco_unitario'));
select pg_temp.checar('5.2 borda EXCLUIDA do produto e recusada',
  'Esta borda não está disponível para o tamanho escolhido.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000011","borda_id":"cbcbcbcb-0000-0000-0000-000000000001"}'::jsonb) ->> 'erro'));
select pg_temp.checar('5.3 borda sem preco no tamanho e recusada',
  'Esta borda não está disponível para o tamanho escolhido.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000002","variacao_id":"f4f4f4f4-0000-0000-0000-000000000022","borda_id":"cbcbcbcb-0000-0000-0000-000000000001"}'::jsonb) ->> 'erro'));
select pg_temp.checar('5.4 lista publica de bordas respeita a exclusao', '0',
  (select count(*)::text from public.bordas_publicas('e4e4e4e4-0000-0000-0000-000000000001','d4d4d4d4-0000-0000-0000-000000000001')));
select pg_temp.checar('5.5 ...e oferece para quem pode', '1',
  (select count(*)::text from public.bordas_publicas('e4e4e4e4-0000-0000-0000-000000000002','d4d4d4d4-0000-0000-0000-000000000001')));

select pg_temp.checar('5.6 adicional permitido soma ao preco', '56.00',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000011","adicionais":["a4a4a4a4-0000-0000-0000-000000000001"]}'::jsonb) ->> 'preco_unitario'));
select pg_temp.checar('5.7 adicional PROIBIDO para o produto e recusado',
  'Um dos adicionais não está disponível para este item.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000011","adicionais":["a4a4a4a4-0000-0000-0000-000000000002"]}'::jsonb) ->> 'erro'));
select pg_temp.checar('5.8 lista publica de adicionais respeita a regra', '1',
  (select count(*)::text from public.adicionais_publicos('e4e4e4e4-0000-0000-0000-000000000001','d4d4d4d4-0000-0000-0000-000000000001')));
select pg_temp.checar('5.9 adicional em produto simples e recusado',
  'Adicionais dependem do tamanho escolhido.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000004","adicionais":["a4a4a4a4-0000-0000-0000-000000000001"]}'::jsonb) ->> 'erro'));
-- Estes dois caem no ramo em que o tamanho não existe. Antes da migration
-- 0036 eles derrubavam a montagem com erro de plpgsql em vez de recusar.
select pg_temp.checar('5.11 borda em produto simples e recusada',
  'Borda só existe em pizza com tamanho.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000004","borda_id":"cbcbcbcb-0000-0000-0000-000000000001"}'::jsonb) ->> 'erro'));


reset role;  -- mutação de estado: anon não tem policy de escrita
update public.store_settings set addons_enabled = false;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('5.10 adicionais desligados globalmente recusam tudo',
  'Um dos adicionais não está disponível para este item.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000011","adicionais":["a4a4a4a4-0000-0000-0000-000000000001"]}'::jsonb) ->> 'erro'));

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.store_settings set addons_enabled = true;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- =============================================================================
-- 6. COMBOS E PRODUTOS SIMPLES
-- =============================================================================
select pg_temp.checar('6.1 combo usa preco proprio, nao a soma', '70.00',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000005"}'::jsonb) ->> 'preco_unitario'));
select pg_temp.checar('6.2 composicao do combo e publica e exata', '2',
  (select count(*)::text from public.combo_publico('e4e4e4e4-0000-0000-0000-000000000005')));
select pg_temp.checar('6.3 combo NAO aceita escolha de sabores',
  'Este produto não tem sabores para escolher.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000005","sabores":["f4f4f4f4-0000-0000-0000-000000000011"]}'::jsonb) ->> 'erro'));


reset role;  -- mutação de estado: anon não tem policy de escrita
update public.products set is_temporarily_available = false
  where id = 'e4e4e4e4-0000-0000-0000-000000000004';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('6.4 componente indisponivel derruba o combo', 'false',
  (select disponivel::text from public.cardapio_publico() where slug = 'combo-f4'));
select pg_temp.checar('6.5 e o combo nao pode ser montado', 'Indisponível no momento.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000005"}'::jsonb) ->> 'erro'));

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.products set is_temporarily_available = true
  where id = 'e4e4e4e4-0000-0000-0000-000000000004';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('6.6 componente volta, combo volta sozinho', 'true',
  (select disponivel::text from public.cardapio_publico() where slug = 'combo-f4'));
select pg_temp.checar('6.7 bebida nao herda regra de pizza', '12.00',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000004"}'::jsonb) ->> 'preco_unitario'));

-- =============================================================================
-- 7. LIMITES (RN-PROMO-006/007 e RN-CART-005)
-- =============================================================================
select pg_temp.checar('7.1 limite da promocao vigente e aplicado', '2',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000002","variacao_id":"f4f4f4f4-0000-0000-0000-000000000021","quantidade":1}'::jsonb) ->> 'limite'));
select pg_temp.checar('7.2 acima do limite, o item e recusado',
  'Limite de 2 por pedido para este item.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000002","variacao_id":"f4f4f4f4-0000-0000-0000-000000000021","quantidade":3}'::jsonb) ->> 'erro'));
-- RN-PROMO-007: no meio a meio, vale o limite de quem determinou o preço.
select pg_temp.checar('7.3 meio a meio: limite vem do sabor que mandou no preco', 'true',
  ((public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000001","variacao_id":"f4f4f4f4-0000-0000-0000-000000000011","sabores":["f4f4f4f4-0000-0000-0000-000000000011","f4f4f4f4-0000-0000-0000-000000000021"]}'::jsonb) ->> 'limite') is null)::text);

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.products set max_quantity_per_order = 1
  where id = 'e4e4e4e4-0000-0000-0000-000000000004';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('7.4 limite do PRODUTO tambem vale', 'Limite de 1 por pedido para este item.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000004","quantidade":2}'::jsonb) ->> 'erro'));

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.products set max_quantity_per_order = null
  where id = 'e4e4e4e4-0000-0000-0000-000000000004';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select pg_temp.checar('7.5 observacao longa demais e recusada',
  'A observação passou de 300 caracteres.',
  (public.montar_item(jsonb_build_object('produto_id','e4e4e4e4-0000-0000-0000-000000000004',
    'observacao', repeat('x', 301))) ->> 'erro'));
select pg_temp.checar('7.6 quantidade zero e recusada', 'Quantidade inválida.',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000004","quantidade":0}'::jsonb) ->> 'erro'));
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- =============================================================================
-- 8. BUSCA (RN-BUSCA-001/002) — pendência A-17
-- As contagens são restritas aos fixtures ('%-f4'): o banco de desenvolvimento
-- já tem produtos reais que casam com termos como 'calabresa'. Acoplamento de
-- ambiente, não regressão.
-- =============================================================================
select pg_temp.checar('8.1 busca por nome', '1',
  (select count(*)::text from public.buscar_catalogo('calabresa') where slug like '%-f4'));
select pg_temp.checar('8.2 busca IGNORA acento do termo', '1',
  (select count(*)::text from public.buscar_catalogo('CALÁBRESA') where slug like '%-f4'));
select pg_temp.checar('8.3 busca ignora acento do CADASTRO', 'Calabresa Ácida F4',
  (select nome from public.buscar_catalogo('acida') where slug like '%-f4'));
select pg_temp.checar('8.4 busca ignora caixa', 'Portuguesa F4',
  (select nome from public.buscar_catalogo('pOrTuGuEsA') where slug like '%-f4'));
select pg_temp.checar('8.5 busca por descricao', 'true',
  (select (count(*) > 0)::text from public.buscar_catalogo('presunto') where slug like '%-f4'));
-- 3 e não 4: a "Inativa F4" está na categoria mas nunca é publicável.
select pg_temp.checar('8.6 busca por categoria', '3',
  (select count(*)::text from public.buscar_catalogo('pizzas f4')));
select pg_temp.checar('8.7 busca por TAMANHO oferecido', 'true',
  (select (count(*) >= 2)::text from public.buscar_catalogo('grande f4')));
select pg_temp.checar('8.8 busca vazia nao devolve nada', '0',
  (select count(*)::text from public.buscar_catalogo('   ')));
select pg_temp.checar('8.9 termo sem correspondencia', '0',
  (select count(*)::text from public.buscar_catalogo('zzzzz') where slug like '%-f4'));
select pg_temp.checar('8.10 produto INATIVO nunca aparece na busca', '0',
  (select count(*)::text from public.buscar_catalogo('inativa') where slug like '%-f4'));


reset role;  -- mutação de estado: anon não tem policy de escrita
update public.products set is_temporarily_available = false
  where id = 'e4e4e4e4-0000-0000-0000-000000000002';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('8.11 indisponivel APARECE na busca (RN-BUSCA-002)', '1',
  (select count(*)::text from public.buscar_catalogo('portuguesa') where slug like '%-f4'));
select pg_temp.checar('8.12 ...marcado como indisponivel', 'false',
  (select disponivel::text from public.buscar_catalogo('portuguesa') where slug like '%-f4'));

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.products set is_temporarily_available = true
  where id = 'e4e4e4e4-0000-0000-0000-000000000002';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- =============================================================================
-- 9. REVALIDAÇÃO DO CARRINHO (02 §19 e 79.9)
-- =============================================================================
select pg_temp.checar('9.1 carrinho coerente nao exige reconfirmacao', 'false',
  (public.revalidar_carrinho(jsonb_build_array(jsonb_build_object(
    'linha','l1','produto_id','e4e4e4e4-0000-0000-0000-000000000001',
    'variacao_id','f4f4f4f4-0000-0000-0000-000000000011','quantidade',1,
    'preco_unitario_visto',50.00))) ->> 'exige_reconfirmacao'));

select pg_temp.checar('9.2 preco divergente EXIGE reconfirmacao', 'true',
  (public.revalidar_carrinho(jsonb_build_array(jsonb_build_object(
    'linha','l1','produto_id','e4e4e4e4-0000-0000-0000-000000000001',
    'variacao_id','f4f4f4f4-0000-0000-0000-000000000011','quantidade',1,
    'preco_unitario_visto',10.00))) ->> 'exige_reconfirmacao'));

select pg_temp.checar('9.3 ...informando o motivo', 'true',
  ((public.revalidar_carrinho(jsonb_build_array(jsonb_build_object(
    'linha','l1','produto_id','e4e4e4e4-0000-0000-0000-000000000001',
    'variacao_id','f4f4f4f4-0000-0000-0000-000000000011','quantidade',1,
    'preco_unitario_visto',10.00))) ->> 'motivos') like '%preco_alterado%')::text);

select pg_temp.checar('9.4 ...e devolvendo anterior e atual', '10.00 -> 50.00',
  (select (i ->> 'preco_visto') || ' -> ' || (i ->> 'preco_unitario')
     from jsonb_array_elements(public.revalidar_carrinho(jsonb_build_array(jsonb_build_object(
       'linha','l1','produto_id','e4e4e4e4-0000-0000-0000-000000000001',
       'variacao_id','f4f4f4f4-0000-0000-0000-000000000011','quantidade',1,
       'preco_unitario_visto',10.00))) -> 'itens') as t(i)));

select pg_temp.checar('9.5 o subtotal e recalculado pelo servidor', '100.00',
  (public.revalidar_carrinho(jsonb_build_array(jsonb_build_object(
    'linha','l1','produto_id','e4e4e4e4-0000-0000-0000-000000000001',
    'variacao_id','f4f4f4f4-0000-0000-0000-000000000011','quantidade',2,
    'preco_unitario_visto',999.00))) ->> 'subtotal'));


reset role;  -- mutação de estado: anon não tem policy de escrita
update public.products set is_temporarily_available = false
  where id = 'e4e4e4e4-0000-0000-0000-000000000001';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('9.6 item indisponivel invalida a linha', 'true',
  ((public.revalidar_carrinho(jsonb_build_array(jsonb_build_object(
    'linha','l1','produto_id','e4e4e4e4-0000-0000-0000-000000000001',
    'variacao_id','f4f4f4f4-0000-0000-0000-000000000011','quantidade',1,
    'preco_unitario_visto',50.00))) ->> 'motivos') like '%item_invalido%')::text);
select pg_temp.checar('9.7 item invalido NAO entra no subtotal', '0',
  (public.revalidar_carrinho(jsonb_build_array(jsonb_build_object(
    'linha','l1','produto_id','e4e4e4e4-0000-0000-0000-000000000001',
    'variacao_id','f4f4f4f4-0000-0000-0000-000000000011','quantidade',1,
    'preco_unitario_visto',50.00))) ->> 'subtotal'));

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.products set is_temporarily_available = true
  where id = 'e4e4e4e4-0000-0000-0000-000000000001';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select pg_temp.checar('9.8 carrinho grande demais e recusado', 'Carrinho grande demais.',
  (select public.revalidar_carrinho(
     (select jsonb_agg(jsonb_build_object('linha', g::text,
        'produto_id','e4e4e4e4-0000-0000-0000-000000000004','quantidade',1))
      from generate_series(1,61) g)) ->> 'erro'));
select pg_temp.checar('9.9 payload que nao e lista e recusado', 'Carrinho inválido.',
  (public.revalidar_carrinho('{"nao":"e lista"}'::jsonb) ->> 'erro'));
select pg_temp.checar('9.10 produto inexistente nao quebra a revalidacao', 'true',
  ((public.revalidar_carrinho(jsonb_build_array(jsonb_build_object(
    'linha','l1','produto_id','00000000-0000-0000-0000-000000000000','quantidade',1)))
    ->> 'ok')::boolean)::text);

-- =============================================================================
-- 10. LOJA FECHADA (RN-LOJA-002/003 e RN-CART-003)
-- =============================================================================
select pg_temp.checar('10.1 loja aberta no horario', 'true',
  (select aberta::text from public.loja_publica()));

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.store_settings set is_temporarily_closed = true,
  temporary_close_reason = 'Manutencao F4', temporary_closed_at = now();
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('10.2 fechamento temporario fecha a loja', 'false',
  (select aberta::text from public.loja_publica()));
select pg_temp.checar('10.3 o motivo chega ao cliente', 'Manutencao F4',
  (select motivo_fechamento from public.loja_publica()));
select pg_temp.checar('10.4 mas o CARDAPIO continua visivel', 'true',
  (select (count(*) > 0)::text from public.cardapio_publico()));
select pg_temp.checar('10.5 e o item continua podendo ser montado', 'true',
  (public.montar_item('{"produto_id":"e4e4e4e4-0000-0000-0000-000000000004"}'::jsonb) ->> 'ok'));
select pg_temp.checar('10.6 a revalidacao avisa que a loja esta fechada', 'false',
  (public.revalidar_carrinho(jsonb_build_array(jsonb_build_object(
    'linha','l1','produto_id','e4e4e4e4-0000-0000-0000-000000000004','quantidade',1)))
    ->> 'loja_aberta'));

reset role;  -- mutação de estado: anon não tem policy de escrita
update public.store_settings set is_temporarily_closed = false,
  temporary_close_reason = null, temporary_closed_at = null;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- =============================================================================
-- 11. ACESSO PÚBLICO SEM EXPOSIÇÃO ADMINISTRATIVA (03 §7.1 e §8)
-- =============================================================================
select pg_temp.checar('11.1 anonimo NAO le store_settings', '0',
  (select count(*)::text from public.store_settings));
select pg_temp.checar('11.2 anonimo NAO le faixas de entrega', '0',
  (select count(*)::text from public.delivery_fee_bands));
select pg_temp.checar('11.3 anonimo NAO le chave Pix', '0',
  (select count(*)::text from public.pix_key_settings));
select pg_temp.checar('11.4 anonimo NAO le funcionarios', '0',
  (select count(*)::text from public.employees));
select pg_temp.checar('11.5 anonimo NAO le auditoria', '0',
  (select count(*)::text from public.audit_logs));
select pg_temp.checar('11.6 anonimo NAO le papeis nem permissoes', '0',
  (select (count(*))::text from public.roles));
select pg_temp.checar('11.7 anonimo NAO le metadados de midia', '0',
  (select count(*)::text from public.media_assets));
select pg_temp.checar('11.8 a projecao publica NAO traz coordenadas', 'true',
  (select (count(*) = 0)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'loja_publica'
      and column_name in ('latitude','longitude','geocode_provider','temporary_closed_by')));
select pg_temp.checar('11.9 listagens ADMINISTRATIVAS sao negadas ao anonimo', 'negado',
  (select case when has_function_privilege('anon', 'public.catalogo_produtos_admin()', 'execute')
               then 'PERMITIDO' else 'negado' end));
select pg_temp.checar('11.10 anonimo NAO escreve no catalogo', 'negado',
  (select case when has_table_privilege('anon', 'public.products', 'insert')
                 and exists (select 1 from pg_policies
                              where schemaname='public' and tablename='products'
                                and 'anon' = any(roles) and cmd = 'INSERT')
               then 'PERMITIDO' else 'negado' end));

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
