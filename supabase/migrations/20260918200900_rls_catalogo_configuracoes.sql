-- 0020 — RLS do catálogo e das configurações
-- 03-RLS-RBAC-SEGURANCA.md §5.1, §7, §8, §33.1 e §33.2
-- CLAUDE.md §12 · PI-006
--
-- DENY BY DEFAULT. Habilitar RLS já nega tudo; cada policy abaixo é uma
-- exceção deliberada. `force` vale também para o dono da tabela.
--
-- A autorização usa SEMPRE has_permission(). Nenhuma policy compara o nome
-- do cargo (RN-RBAC-004, CLAUDE.md §14).

alter table public.store_settings enable row level security;
alter table public.store_settings force row level security;
alter table public.store_hours enable row level security;
alter table public.store_hours force row level security;
alter table public.delivery_fee_bands enable row level security;
alter table public.delivery_fee_bands force row level security;
alter table public.alert_thresholds enable row level security;
alter table public.alert_thresholds force row level security;
alter table public.payment_methods enable row level security;
alter table public.payment_methods force row level security;
alter table public.payment_brands enable row level security;
alter table public.payment_brands force row level security;
alter table public.pix_key_settings enable row level security;
alter table public.pix_key_settings force row level security;
alter table public.media_assets enable row level security;
alter table public.media_assets force row level security;
alter table public.categories enable row level security;
alter table public.categories force row level security;
alter table public.pizza_sizes enable row level security;
alter table public.pizza_sizes force row level security;
alter table public.products enable row level security;
alter table public.products force row level security;
alter table public.product_variants enable row level security;
alter table public.product_variants force row level security;
alter table public.crusts enable row level security;
alter table public.crusts force row level security;
alter table public.crust_size_prices enable row level security;
alter table public.crust_size_prices force row level security;
alter table public.product_crust_exclusions enable row level security;
alter table public.product_crust_exclusions force row level security;
alter table public.addons enable row level security;
alter table public.addons force row level security;
alter table public.addon_size_prices enable row level security;
alter table public.addon_size_prices force row level security;
alter table public.product_addon_rules enable row level security;
alter table public.product_addon_rules force row level security;
alter table public.combo_components enable row level security;
alter table public.combo_components force row level security;
alter table public.promotions enable row level security;
alter table public.promotions force row level security;
alter table public.banners enable row level security;
alter table public.banners force row level security;

-- =====================================================================
-- CONFIGURAÇÕES
-- =====================================================================
-- §33.1 e §7.1: o público NÃO lê store_settings. Endereço, coordenadas,
-- quem fechou a loja e parâmetros internos ficam aqui. O que o cliente
-- precisa sai por projeção pública (migration 0021).
create policy store_settings_select on public.store_settings
  for select to authenticated using (public.has_permission('settings.view'));
create policy store_settings_update on public.store_settings
  for update to authenticated
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));
create policy store_settings_insert on public.store_settings
  for insert to authenticated with check (public.has_permission('settings.manage'));
-- Sem policy de DELETE: a loja não se apaga (§33.1).

create policy store_hours_select on public.store_hours
  for select to authenticated using (public.has_permission('settings.view'));
create policy store_hours_insert on public.store_hours
  for insert to authenticated with check (public.has_permission('settings.manage'));
create policy store_hours_update on public.store_hours
  for update to authenticated
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));
create policy store_hours_delete on public.store_hours
  for delete to authenticated using (public.has_permission('settings.manage'));

create policy delivery_fee_bands_select on public.delivery_fee_bands
  for select to authenticated using (public.has_permission('settings.view'));
create policy delivery_fee_bands_insert on public.delivery_fee_bands
  for insert to authenticated with check (public.has_permission('settings.manage'));
create policy delivery_fee_bands_update on public.delivery_fee_bands
  for update to authenticated
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));
create policy delivery_fee_bands_delete on public.delivery_fee_bands
  for delete to authenticated using (public.has_permission('settings.manage'));

create policy alert_thresholds_select on public.alert_thresholds
  for select to authenticated using (public.has_permission('settings.view'));
create policy alert_thresholds_insert on public.alert_thresholds
  for insert to authenticated with check (public.has_permission('settings.manage'));
create policy alert_thresholds_update on public.alert_thresholds
  for update to authenticated
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));
create policy alert_thresholds_delete on public.alert_thresholds
  for delete to authenticated using (public.has_permission('settings.manage'));

create policy payment_methods_select on public.payment_methods
  for select to authenticated using (public.has_permission('settings.view'));
create policy payment_methods_insert on public.payment_methods
  for insert to authenticated with check (public.has_permission('settings.manage'));
create policy payment_methods_update on public.payment_methods
  for update to authenticated
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));
create policy payment_methods_delete on public.payment_methods
  for delete to authenticated using (public.has_permission('settings.manage'));

create policy payment_brands_select on public.payment_brands
  for select to authenticated using (public.has_permission('settings.view'));
create policy payment_brands_insert on public.payment_brands
  for insert to authenticated with check (public.has_permission('settings.manage'));
create policy payment_brands_update on public.payment_brands
  for update to authenticated
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));
create policy payment_brands_delete on public.payment_brands
  for delete to authenticated using (public.has_permission('settings.manage'));

-- A chave Pix não tem policy pública nesta fase: a projeção que o checkout
-- precisa é da Fase 5, e abrir antes seria expor sem necessidade.
create policy pix_key_settings_select on public.pix_key_settings
  for select to authenticated using (public.has_permission('settings.view'));
create policy pix_key_settings_insert on public.pix_key_settings
  for insert to authenticated with check (public.has_permission('settings.manage'));
create policy pix_key_settings_update on public.pix_key_settings
  for update to authenticated
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));

-- =====================================================================
-- MÍDIA
-- =====================================================================
-- O arquivo do catálogo é público pelo Storage; o METADADO é interno.
create policy media_assets_select on public.media_assets
  for select to authenticated using (public.has_permission('catalog.view'));
create policy media_assets_insert on public.media_assets
  for insert to authenticated with check (public.has_permission('catalog.manage'));
create policy media_assets_update on public.media_assets
  for update to authenticated
  using (public.has_permission('catalog.manage'))
  with check (public.has_permission('catalog.manage'));
-- DELETE permitido para limpar órfão; as FKs RESTRICT impedem apagar o que
-- ainda é referenciado (§8.3, §29).
create policy media_assets_delete on public.media_assets
  for delete to authenticated using (public.has_permission('catalog.manage'));

-- =====================================================================
-- CATÁLOGO — leitura pública
-- =====================================================================
-- §8.1: o público lê somente o publicável. Categoria PAUSADA continua
-- visível (o cliente vê "Indisponível hoje"); categoria INATIVA some.
create policy categories_publico on public.categories
  for select to anon, authenticated using (is_active);
create policy categories_interno on public.categories
  for select to authenticated using (public.has_permission('catalog.view'));

create policy pizza_sizes_publico on public.pizza_sizes
  for select to anon, authenticated using (is_active);
create policy pizza_sizes_interno on public.pizza_sizes
  for select to authenticated using (public.has_permission('catalog.view'));

create policy products_publico on public.products
  for select to anon, authenticated using (is_active);
create policy products_interno on public.products
  for select to authenticated using (public.has_permission('catalog.view'));

create policy product_variants_publico on public.product_variants
  for select to anon, authenticated using (is_active);
create policy product_variants_interno on public.product_variants
  for select to authenticated using (public.has_permission('catalog.view'));

create policy crusts_publico on public.crusts
  for select to anon, authenticated using (is_active);
create policy crusts_interno on public.crusts
  for select to authenticated using (public.has_permission('catalog.view'));

create policy crust_size_prices_publico on public.crust_size_prices
  for select to anon, authenticated using (is_active);
create policy crust_size_prices_interno on public.crust_size_prices
  for select to authenticated using (public.has_permission('catalog.view'));

create policy addons_publico on public.addons
  for select to anon, authenticated using (is_active);
create policy addons_interno on public.addons
  for select to authenticated using (public.has_permission('catalog.view'));

create policy addon_size_prices_publico on public.addon_size_prices
  for select to anon, authenticated using (is_active);
create policy addon_size_prices_interno on public.addon_size_prices
  for select to authenticated using (public.has_permission('catalog.view'));

-- ATENÇÃO — estas duas tabelas registram RESTRIÇÃO, não permissão.
-- As funções borda_permitida/adicional_permitido são SECURITY INVOKER: uma
-- linha de exclusão invisível faria a borda proibida parecer liberada. Por
-- isso a leitura é pública. Não há dado sensível nelas.
create policy product_crust_exclusions_publico on public.product_crust_exclusions
  for select to anon, authenticated using (true);
create policy product_addon_rules_publico on public.product_addon_rules
  for select to anon, authenticated using (true);

-- combo_disponivel precisa enxergar a composição para decidir.
create policy combo_components_publico on public.combo_components
  for select to anon, authenticated using (true);

-- §8.1 "promoções vigentes": o público vê a promoção que está valendo AGORA.
-- Promoção agendada para o futuro é informação comercial interna.
create policy promotions_publico on public.promotions
  for select to anon, authenticated
  using (is_active and starts_at <= now() and (ends_at is null or ends_at > now()));
create policy promotions_interno on public.promotions
  for select to authenticated using (public.has_permission('catalog.view'));

create policy banners_publico on public.banners
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );
create policy banners_interno on public.banners
  for select to authenticated using (public.has_permission('catalog.view'));

-- =====================================================================
-- CATÁLOGO — escrita
-- =====================================================================
-- §8.3: somente catalog.manage altera catálogo. Nenhuma policy de escrita
-- para anon em tabela alguma.
do $$
declare t text;
begin
  foreach t in array array[
    'categories', 'pizza_sizes', 'products', 'product_variants',
    'crusts', 'crust_size_prices', 'product_crust_exclusions',
    'addons', 'addon_size_prices', 'product_addon_rules',
    'combo_components', 'promotions', 'banners'
  ] loop
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.has_permission(''catalog.manage''))', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.has_permission(''catalog.manage''))
         with check (public.has_permission(''catalog.manage''))', t || '_update', t);
    -- DELETE existe para corrigir cadastro que nunca foi usado. O histórico
    -- é protegido pelas FKs RESTRICT, não pela ausência da policy (§29).
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (public.has_permission(''catalog.manage''))', t || '_delete', t);
  end loop;
end;
$$;
