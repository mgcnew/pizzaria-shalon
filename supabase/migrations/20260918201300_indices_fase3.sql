-- 0024 — Índices da Fase 3
-- 02-MODELO-DADOS-SUPABASE.md §22 · CLAUDE.md §39
--
-- Dois grupos: (a) os índices de consulta que o §22 prevê; (b) cobertura de
-- chave estrangeira — sem ela, apagar ou atualizar a linha-pai faz varredura
-- completa na tabela filha.
--
-- Busca pública sem acento/caixa (unaccent + pg_trgm) é da Fase 4, quando
-- houver consulta real para medir. §39: medir antes de otimizar.

-- ---------------------------------------------------- consultas previstas
create index products_categoria_ativo_ordem
  on public.products (category_id, is_active, sort_order);
create index categories_ativo_ordem
  on public.categories (is_active, sort_order);
create index product_variants_produto_tamanho
  on public.product_variants (product_id, size_id);
create index promotions_produto_periodo
  on public.promotions (product_id, starts_at, ends_at) where product_id is not null;
create index promotions_variacao_periodo
  on public.promotions (variant_id, starts_at, ends_at) where variant_id is not null;
create index combo_components_combo_ordem
  on public.combo_components (combo_product_id, sort_order);
create index banners_ativo_ordem
  on public.banners (is_active, sort_order);

-- ------------------------------------------------- cobertura de FK
create index store_settings_fechado_por on public.store_settings (temporary_closed_by);
create index store_settings_eta_por on public.store_settings (eta_override_updated_by);
create index alert_thresholds_atualizado_por on public.alert_thresholds (updated_by);
create index payment_brands_forma on public.payment_brands (payment_method_id);
create index pix_key_settings_atualizado_por on public.pix_key_settings (updated_by);
create index media_assets_criado_por on public.media_assets (created_by);
create index products_imagem on public.products (image_asset_id);
create index product_variants_tamanho on public.product_variants (size_id);
create index crust_size_prices_tamanho on public.crust_size_prices (size_id);
create index addon_size_prices_tamanho on public.addon_size_prices (size_id);
create index product_crust_exclusions_produto on public.product_crust_exclusions (product_id);
create index product_crust_exclusions_borda on public.product_crust_exclusions (crust_id);
create index product_crust_exclusions_tamanho on public.product_crust_exclusions (size_id);
create index product_addon_rules_produto on public.product_addon_rules (product_id);
create index product_addon_rules_adicional on public.product_addon_rules (addon_id);
create index product_addon_rules_tamanho on public.product_addon_rules (size_id);
create index combo_components_componente on public.combo_components (component_product_id);
create index combo_components_variacao on public.combo_components (component_variant_id);
create index promotions_criada_por on public.promotions (created_by);
create index banners_imagem on public.banners (image_asset_id);
create index banners_destino_produto on public.banners (destination_product_id);
create index banners_destino_categoria on public.banners (destination_category_id);
create index banners_destino_promocao on public.banners (destination_promotion_id);
