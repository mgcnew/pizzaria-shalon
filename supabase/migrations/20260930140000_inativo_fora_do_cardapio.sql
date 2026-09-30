-- 0139 — inativo não aparece no cardápio, nem para quem está logado
-- 04 RN-DISP-* · 03 §8.1 · D-2026-09-30-103
--
-- O ACHADO. A "Fogazza mussarela", inativada, continuava aparecendo no
-- cardápio público como "indisponível" — mas só para quem estava logado no
-- painel. As leituras públicas são SECURITY INVOKER e confiavam no RLS para
-- esconder o que está inativo; o RLS do visitante (`anon`) esconde, mas o da
-- equipe (`authenticated` com `catalog.view`) mostra inativos, porque o
-- painel precisa deles. Quem abria o cardápio com a sessão da loja via o
-- que o cliente não vê.
--
-- A CORREÇÃO. Inativo não é cardápio, para ninguém: o filtro passa a estar
-- escrito nas próprias leituras, e não mais só no RLS. O RLS continua
-- valendo como segunda barreira para o visitante.
--
--   cardapio_publico (e produto_publico, que a usa)  produto e categoria ativos
--   buscar_catalogo                                  produto e categoria ativos
--   tamanhos_publicos                                tamanho ativo
--   sabores_publicos                                 sabor e categoria ativos
--   categorias_publicas                              categoria ativa
--
-- `sabores_da_fogazza` já filtrava o sabor ativo (0135). Temporariamente
-- indisponível continua aparecendo marcado — é a regra de sempre
-- (RN-BUSCA-002); só o INATIVO sai.

create or replace function public.cardapio_publico(p_categoria_slug text default null)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_id uuid, categoria_nome text, categoria_slug text, categoria_ordem integer,
  preco_de numeric, preco numeric, preco_max numeric,
  em_promocao boolean, disponivel boolean, destaque boolean, tem_tamanhos boolean,
  imagem_path text, ordem integer, limite_por_pedido integer
)
language sql stable set search_path = ''
as $$
  with variantes_de_pizza as (
    select pv.*
      from public.product_variants pv
      join public.pizza_sizes s on s.id = pv.size_id
     where s.sold_as = 'pizza'
  )
  select
    p.id, p.name, p.slug, p.product_type, p.short_description,
    c.id, c.name, c.slug, c.sort_order,
    case when p.flavor_category_id is not null then fz.preco_de else coalesce(
      (select min(pv.price) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      p.base_price) end,
    case when p.flavor_category_id is not null then fz.preco else coalesce(
      (select min(public.preco_efetivo_variante(pv.id)) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)) end,
    case when p.flavor_category_id is not null then fz.preco_max else coalesce(
      (select max(public.preco_efetivo_variante(pv.id)) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)) end,
    case when p.flavor_category_id is not null then fz.em_promocao else exists (
      select 1 from public.promotions pr
      where pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
        and (pr.product_id = p.id
             or pr.variant_id in (select pv.id from variantes_de_pizza pv
                                   where pv.product_id = p.id))) end,
    coalesce(public.produto_disponivel_no_cardapio(p.id), false),
    p.is_featured,
    -- O card de entrada tem escolha a fazer: o sabor.
    p.flavor_category_id is not null
      or exists (select 1 from variantes_de_pizza pv
                  where pv.product_id = p.id and pv.is_active),
    public.caminho_publico_da_midia(p.image_asset_id),
    p.sort_order,
    p.max_quantity_per_order
  from public.products p
  join public.categories c on c.id = p.category_id
  -- Preço do card de entrada: o menor e o maior preço de fogazza dos sabores.
  left join lateral (
    select min(f.preco_de) as preco_de, min(f.preco) as preco, max(f.preco) as preco_max,
           coalesce(bool_or(f.em_promocao), false) as em_promocao
      from public.sabores_da_fogazza(p.id) f
     where p.flavor_category_id is not null
  ) fz on true
  where (p_categoria_slug is null or c.slug = p_categoria_slug)
    -- Inativo não é cardápio, para ninguém: nem para a equipe logada, que o
    -- RLS deixa ver inativos por causa do painel (0139).
    and p.is_active and c.is_active
  order by c.sort_order, p.sort_order, p.name;
$$;

create or replace function public.buscar_catalogo(p_termo text)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_nome text, categoria_slug text,
  preco_de numeric, preco numeric, em_promocao boolean, disponivel boolean,
  imagem_path text
)
language sql stable set search_path = ''
as $$
  with termo as (
    select public.sem_acento(btrim(coalesce(p_termo, ''))) as t
  ),
  palavras as (
    select coalesce(
      (select array_agg(w)
         from termo, regexp_split_to_table(termo.t, '\s+') as w
        where w <> ''
          and w not in ('a', 'o', 'as', 'os', 'e', 'de', 'da', 'do', 'das', 'dos',
                        'com', 'c/', 'c', 'na', 'no', 'em')),
      array[(select t from termo)]
    ) as lista
  ),
  variantes_de_pizza as (
    select pv.*, s.name as tamanho_nome
      from public.product_variants pv
      join public.pizza_sizes s on s.id = pv.size_id
     where s.sold_as = 'pizza'
  ),
  candidatos as (
    select
      p.id,
      public.sem_acento(p.name) as nome_n,
      public.sem_acento(concat_ws(' ',
        p.name, p.short_description, c.name,
        (select string_agg(pv.tamanho_nome, ' ')
           from variantes_de_pizza pv
          where pv.product_id = p.id and pv.is_active),
        (select string_agg(f.nome, ' ')
           from public.sabores_da_fogazza(p.id) f
          where p.flavor_category_id is not null))) as texto
    from public.products p
    join public.categories c on c.id = p.category_id, termo
    where length(termo.t) > 0
      and p.is_active and c.is_active
  ),
  encontrados as (
    select k.id,
           (select count(*) from unnest(pl.lista) as w
             where k.nome_n ~ ('\m' || regexp_replace(w, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M'))
             as palavra_no_nome,
           (select count(*) from unnest(pl.lista) as w
             where k.nome_n like '%' || w || '%') as no_nome
    from candidatos k, palavras pl
    where not exists (
      select 1 from unnest(pl.lista) as w where k.texto not like '%' || w || '%')
  )
  select
    p.id, p.name, p.slug, p.product_type, p.short_description,
    c.name, c.slug,
    case when p.flavor_category_id is not null then fz.preco_de else coalesce(
      (select min(pv.price) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      p.base_price) end,
    case when p.flavor_category_id is not null then fz.preco else coalesce(
      (select min(public.preco_efetivo_variante(pv.id)) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)) end,
    case when p.flavor_category_id is not null then fz.em_promocao else exists (
      select 1 from public.promotions pr
      where pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
        and (pr.product_id = p.id
             or pr.variant_id in (select pv.id from variantes_de_pizza pv
                                   where pv.product_id = p.id))) end,
    coalesce(public.produto_disponivel_no_cardapio(p.id), false),
    public.caminho_publico_da_midia(p.image_asset_id)
  from encontrados e
  join public.products p on p.id = e.id
  join public.categories c on c.id = p.category_id
  left join lateral (
    select min(f.preco_de) as preco_de, min(f.preco) as preco,
           coalesce(bool_or(f.em_promocao), false) as em_promocao
      from public.sabores_da_fogazza(p.id) f
     where p.flavor_category_id is not null
  ) fz on true
  order by
    e.palavra_no_nome desc,
    e.no_nome desc,
    coalesce(public.produto_disponivel_no_cardapio(p.id), false) desc,
    p.name;
$$;

create or replace function public.tamanhos_publicos(p_product_id uuid)
returns table (
  variacao_id uuid, tamanho_id uuid, tamanho_nome text, fatias integer, max_sabores integer,
  preco_de numeric, preco numeric, em_promocao boolean, disponivel boolean
)
language sql stable set search_path = ''
as $$
  select
    pv.id, s.id, s.name, s.slice_count, s.max_flavors,
    pv.price,
    public.preco_efetivo_variante(pv.id),
    public.preco_efetivo_variante(pv.id) < pv.price,
    coalesce(public.variante_disponivel(pv.id), false)
  from public.product_variants pv
  join public.pizza_sizes s on s.id = pv.size_id
  where pv.product_id = p_product_id
    -- A página da pizza não oferece o tamanho de fogazza (RN-FOG-002).
    and s.sold_as = 'pizza'
    -- Tamanho inativo não é oferta, nem para a equipe logada (0139).
    and pv.is_active
  order by s.sort_order, s.name;
$$;

create or replace function public.sabores_publicos(p_size_id uuid)
returns table (
  variacao_id uuid, produto_id uuid, nome text, slug text, descricao text,
  preco numeric, disponivel boolean
)
language sql stable set search_path = ''
as $$
  select
    pv.id, p.id, p.name, p.slug, p.short_description,
    public.preco_efetivo_variante(pv.id),
    coalesce(public.variante_disponivel(pv.id), false)
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  join public.categories c on c.id = p.category_id
  where pv.size_id = p_size_id
    and p.product_type = 'pizza'
    and pv.is_active
    -- Sabor ou categoria inativos não entram no meio a meio (0139).
    and p.is_active and c.is_active
  order by p.sort_order, p.name;
$$;

create or replace function public.categorias_publicas()
returns table (
  id uuid, nome text, slug text, descricao text, pausada boolean, produtos integer, ordem integer
)
language sql stable set search_path = ''
as $$
  select c.id, c.name, c.slug, c.description,
    not c.is_temporarily_available,
    (select count(*)::integer from public.products p
      where p.category_id = c.id and p.is_active),
    c.sort_order
  from public.categories c
  -- Categoria inativa não é cardápio, nem para a equipe logada (0139).
  where c.is_active
  order by c.sort_order, c.name;
$$;
