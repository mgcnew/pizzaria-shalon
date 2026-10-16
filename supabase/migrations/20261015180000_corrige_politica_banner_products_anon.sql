-- 0155 — Corrige a leitura pública de banner_products
-- Regressão da 0151: a política de SELECT misturava `anon` e `has_permission`.
-- O visitante do cardápio não pode executar `has_permission`, então a consulta
-- dos banners públicos falhava com "permission denied for function
-- has_permission" e o cardápio inteiro caía na página de erro.
--
-- A regra passa a ser a mesma das outras tabelas de banner: uma política
-- pública (sem função de permissão) e outra, só para autenticados, com
-- `catalog.view`.

drop policy banner_products_select on public.banner_products;

create policy banner_products_publico on public.banner_products for select to anon, authenticated
  using (
    exists (
      select 1 from public.banners b
       where b.id = banner_id and b.is_active
         and (b.starts_at is null or b.starts_at <= now())
         and (b.ends_at is null or b.ends_at > now())
    )
  );

create policy banner_products_interno on public.banner_products for select to authenticated
  using (public.has_permission('catalog.view'));
