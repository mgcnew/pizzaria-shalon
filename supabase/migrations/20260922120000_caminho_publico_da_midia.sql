-- 0087 — Defeito: o cardápio público nunca mostrou foto nem banner
-- 03-RLS-RBAC-SEGURANCA.md §8.1, §23.1 · CLAUDE.md §12, §35
--
-- O QUE ESTAVA ERRADO. `cardapio_publico`, `buscar_catalogo` e
-- `banners_publicos` liam `media_assets` para tirar de lá o caminho do
-- arquivo. Mas `media_assets` é metadado INTERNO: a policy dela é
-- `to authenticated` com `catalog.view`, e `anon` não aparece em policy
-- nenhuma. Resultado, para o cliente que abre o link:
--
--   · produto sem foto — o `left join` não trazia linha;
--   · banner NENHUM — ali o join era interno, e sem ele a consulta some.
--
-- Passou despercebido porque toda validação visual foi feita com sessão
-- aberta: o navegador de quem desenvolve carrega o cookie do admin, e a
-- página pública renderizada no servidor passava a ser lida como
-- `authenticated`. O site nunca foi visto como o cliente o vê.
--
-- POR QUE NÃO BASTA TORNAR AS PROJEÇÕES `SECURITY DEFINER`. Seria a correção
-- óbvia e seria pior: `cardapio_publico` NÃO filtra `p.is_active` — quem
-- exclui produto inativo é a RLS de `products`, como o comentário da 0031
-- diz. Com `definer`, a função passaria por cima dela e o cardápio público
-- mostraria produto desativado. Trocaríamos um defeito visual por um
-- vazamento de catálogo.
--
-- A CORREÇÃO. Uma função mínima que devolve SÓ o caminho, e só quando o
-- arquivo já está num bucket público. É exatamente o que a 0031 dizia que
-- deveria acontecer: "o caminho do arquivo sai por estas funções, que
-- devolvem só o `storage_path` do bucket público — nunca a linha inteira".
--
-- O resto continua como estava: as projeções seguem `SECURITY INVOKER`, e a
-- RLS continua decidindo QUAIS produtos e QUAIS banners existem.

create or replace function public.caminho_publico_da_midia(p_asset_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select m.storage_path
    from public.media_assets m
    join storage.buckets b on b.id = m.bucket
   where m.id = p_asset_id
     -- A INVARIANTE DESTA FUNÇÃO: ela só devolve caminho de arquivo que já é
     -- publicamente alcançável. Comprovante financeiro e anexo de
     -- funcionário vivem no bucket `comprovantes`, que é privado — nem com o
     -- id na mão alguém tira o caminho deles daqui.
     and b.public;
$$;

comment on function public.caminho_publico_da_midia is
  'Só o storage_path, e só de bucket público. `media_assets` continua interno (03 §8.1).';

revoke all on function public.caminho_publico_da_midia(uuid) from public;
grant execute on function public.caminho_publico_da_midia(uuid) to anon, authenticated;

-- ------------------------------------------------------------------ cardápio
create or replace function public.cardapio_publico(p_categoria_slug text default null)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_id uuid, categoria_nome text, categoria_slug text, categoria_ordem integer,
  preco_de numeric, preco numeric, preco_max numeric,
  em_promocao boolean, disponivel boolean, destaque boolean,
  tem_tamanhos boolean, imagem_path text, ordem integer, limite_por_pedido integer
) language sql stable set search_path = ''
as $$
  select
    p.id, p.name, p.slug, p.product_type, p.short_description,
    c.id, c.name, c.slug, c.sort_order,
    coalesce(
      (select min(pv.price) from public.product_variants pv
        where pv.product_id = p.id and pv.is_active),
      p.base_price),
    coalesce(
      (select min(public.preco_efetivo_variante(pv.id)) from public.product_variants pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)),
    coalesce(
      (select max(public.preco_efetivo_variante(pv.id)) from public.product_variants pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)),
    exists (
      select 1 from public.promotions pr
      where pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
        and (pr.product_id = p.id
             or pr.variant_id in (select pv.id from public.product_variants pv
                                   where pv.product_id = p.id))),
    coalesce(public.produto_disponivel(p.id), false),
    p.is_featured,
    exists (select 1 from public.product_variants pv
             where pv.product_id = p.id and pv.is_active),
    -- Era `m.storage_path` de um join com `media_assets`, que `anon` não lê.
    public.caminho_publico_da_midia(p.image_asset_id),
    p.sort_order,
    p.max_quantity_per_order
  from public.products p
  join public.categories c on c.id = p.category_id
  where p_categoria_slug is null or c.slug = p_categoria_slug
  order by c.sort_order, p.sort_order, p.name;
$$;

-- --------------------------------------------------------------------- busca
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
    coalesce(public.produto_disponivel(p.id), false),
    public.caminho_publico_da_midia(p.image_asset_id)
  from encontrados e
  join public.products p on p.id = e.id
  join public.categories c on c.id = p.category_id, termo
  order by
    (public.sem_acento(p.name) like '%' || termo.t || '%') desc,
    coalesce(public.produto_disponivel(p.id), false) desc,
    p.name;
$$;

-- ------------------------------------------------------------------ banners
create or replace function public.banners_publicos()
returns table (
  id uuid, titulo text, corpo text, imagem_path text,
  destino_tipo text, destino_slug text, url_externa text, ordem integer
) language sql stable set search_path = ''
as $$
  select
    b.id, b.title, b.body,
    public.caminho_publico_da_midia(b.image_asset_id),
    b.destination_type,
    coalesce(p.slug, c.slug, pp.slug),
    b.external_url,
    b.sort_order
  from public.banners b
  left join public.products p on p.id = b.destination_product_id
  left join public.categories c on c.id = b.destination_category_id
  left join public.promotions pr on pr.id = b.destination_promotion_id
  -- Banner de promoção leva ao PRODUTO alvo: o cliente precisa de uma página
  -- para abrir, e promoção não é página (RN-BANNER-002).
  left join public.product_variants pv on pv.id = pr.variant_id
  left join public.products pp on pp.id = coalesce(pr.product_id, pv.product_id)
  where coalesce(public.banner_visivel(b.id), false)
    -- O join com `media_assets` era INTERNO e fazia este mesmo papel: banner
    -- sem imagem alcançável não é renderizado, em vez de virar quadro
    -- quebrado no topo do cardápio.
    and public.caminho_publico_da_midia(b.image_asset_id) is not null
  order by b.sort_order, b.created_at;
$$;
