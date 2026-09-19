-- 0033 — Busca filtra antes de precificar (pendência A-17, medida)
-- 02-MODELO-DADOS-SUPABASE.md §22 · CLAUDE.md §39 ("meça antes de otimizar")
--
-- MEDIÇÃO QUE MOTIVOU ESTA MIGRATION, com 801 produtos (mais de 10× o
-- cardápio real previsto):
--
--   buscar_catalogo('medicao 42')  → 78 ms
--   cardapio_publico()  sozinho    → 60 ms
--
-- Ou seja: 60 dos 78 ms eram o cardápio INTEIRO sendo precificado — preço
-- efetivo e disponibilidade linha a linha — antes de o filtro descartar 790
-- linhas. O `LIKE` custava o resto.
--
-- Um índice trigram sobre o nome atacaria justamente a parte barata. O que
-- resolve é inverter a ordem: filtrar nas tabelas-base e só então calcular
-- preço e disponibilidade das linhas que sobraram.
--
-- Por isso NÃO é criado índice aqui. Com dezenas de produtos, a varredura
-- sequencial é o plano certo, e um índice não usado é peso morto.
create or replace function public.buscar_catalogo(p_termo text)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_nome text, categoria_slug text,
  preco_de numeric, preco numeric, em_promocao boolean,
  disponivel boolean, imagem_path text
) language sql stable set search_path = ''
as $$
  with termo as (
    select public.sem_acento(p_termo) as t
  ),
  -- Passo 1: filtro barato, só texto, direto nas tabelas.
  -- RN-BUSCA-001: nome, descrição, categoria e tamanhos oferecidos.
  encontrados as (
    select p.id
    from public.products p
    join public.categories c on c.id = p.category_id, termo
    where length(btrim(termo.t)) > 0
      and (
        public.sem_acento(p.name) like '%' || termo.t || '%'
        or public.sem_acento(coalesce(p.short_description, '')) like '%' || termo.t || '%'
        or public.sem_acento(c.name) like '%' || termo.t || '%'
        or exists (
          select 1 from public.product_variants pv
          join public.pizza_sizes s on s.id = pv.size_id
          where pv.product_id = p.id and pv.is_active
            and public.sem_acento(s.name) like '%' || termo.t || '%'
        )
      )
  )
  -- Passo 2: preço e disponibilidade só do que sobrou.
  select
    p.id, p.name, p.slug, p.product_type, p.short_description,
    c.name, c.slug,
    coalesce(
      (select min(pv.price) from public.product_variants pv
        where pv.product_id = p.id and pv.is_active),
      p.base_price),
    coalesce(
      (select min(public.preco_efetivo_variante(pv.id)) from public.product_variants pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)),
    exists (
      select 1 from public.promotions pr
      where pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
        and (pr.product_id = p.id
             or pr.variant_id in (select pv.id from public.product_variants pv
                                   where pv.product_id = p.id))),
    -- RN-BUSCA-002: indisponível ainda aparece, marcado, sem permitir adição.
    coalesce(public.produto_disponivel(p.id), false),
    m.storage_path
  from encontrados e
  join public.products p on p.id = e.id
  join public.categories c on c.id = p.category_id
  left join public.media_assets m on m.id = p.image_asset_id, termo
  order by
    (public.sem_acento(p.name) like '%' || termo.t || '%') desc,
    coalesce(public.produto_disponivel(p.id), false) desc,
    p.name;
$$;

comment on function public.buscar_catalogo is 'RN-BUSCA-001. Filtra por texto antes de precificar: ver medição na migration 0033.';
