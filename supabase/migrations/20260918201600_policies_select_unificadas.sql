-- 0027 — Unifica as policies de SELECT do catálogo
-- 03-RLS-RBAC-SEGURANCA.md §8.1 · CLAUDE.md §39
--
-- A Fase 3 criou duas policies permissivas de SELECT por tabela: uma para o
-- que é publicável e outra para quem tem catalog.view. Ambas valiam para
-- `authenticated`, e o Postgres precisava avaliar as duas em toda consulta.
--
-- Mesma regra, uma policy por papel:
--   anon          → só o publicável;
--   authenticated → o publicável OU tudo, quando tiver catalog.view.
--
-- A fronteira de segurança não muda: quem não tem permissão continua vendo
-- exatamente o que o cliente anônimo vê.

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('categories',       'is_active'),
      ('pizza_sizes',      'is_active'),
      ('products',         'is_active'),
      ('product_variants', 'is_active'),
      ('crusts',           'is_active'),
      ('crust_size_prices','is_active'),
      ('addons',           'is_active'),
      ('addon_size_prices','is_active'),
      ('promotions',       'is_active and starts_at <= now() and (ends_at is null or ends_at > now())'),
      ('banners',          'is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())')
    ) as v(tabela, publicavel)
  loop
    execute format('drop policy if exists %I on public.%I', t.tabela || '_publico', t.tabela);
    execute format('drop policy if exists %I on public.%I', t.tabela || '_interno', t.tabela);

    execute format(
      'create policy %I on public.%I for select to anon using (%s)',
      t.tabela || '_publico', t.tabela, t.publicavel);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((%s) or public.has_permission(''catalog.view''))',
      t.tabela || '_interno', t.tabela, t.publicavel);
  end loop;
end;
$$;
