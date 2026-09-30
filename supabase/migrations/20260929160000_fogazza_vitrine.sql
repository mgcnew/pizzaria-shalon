-- 0135 — fogazza por sabor, entrega 2: a vitrine
-- 04 RN-FOG-003, RN-FOG-006, RN-FOG-007 · D-2026-09-29-99
--
-- A entrega 1 (0134) criou o modelo e ESCONDEU tudo do cliente. Esta
-- migration abre a vitrine: os cards de entrada ("Fogazza salgada",
-- "Fogazza doce") voltam ao cardápio, à busca e ao link direto, com o "a
-- partir de" calculado pelos sabores, e o cliente escolhe o sabor numa lista.
--
-- O QUE MUDA:
--
--   fogazza_a_venda(tamanho, categoria)
--       Existe card de entrada disponível para aquele tamanho de fogazza e
--       aquela categoria de sabores? Pausar o card pausa as fogazzas dele
--       (RN-FOG-007).
--
--   variante_disponivel
--       A variação num tamanho de fogazza só está disponível se houver card
--       à venda. É a MESMA função que `preco_meio_a_meio` consulta, então
--       `montar_item`, o carrinho, o checkout e o balcão passam a recusar a
--       fogazza de card pausado sem mais nenhuma mudança.
--
--   sabores_da_fogazza(card)
--       A lista de sabores do card, com o preço de fogazza de cada um.
--
--   produto_disponivel_no_cardapio(produto)
--       O "disponível" que o cardápio mostra. Card de entrada: disponível se
--       ele e a categoria estiverem abertos e houver sabor à venda. Sabor com
--       preço de fogazza: o card da PIZZA depende só dos tamanhos de pizza —
--       pizza com os tamanhos pausados e a fogazza ativa não aparece como
--       pizza disponível (pendência registrada em D-2026-09-29-98).
--       `produto_disponivel` NÃO muda: continua dizendo se o sabor é vendável
--       em algum tamanho, que é o que o motor de preço precisa.
--
--   cardapio_publico, buscar_catalogo, catalogo_produtos_admin
--       Mostram o card de entrada com o preço dos sabores. O card informa
--       `tem_tamanhos = true`: ele tem escolha a fazer (o sabor), e o "+" do
--       card abre a página em vez de tentar adicionar direto.

-- ------------------------------------------------------ fogazza à venda
create or replace function public.fogazza_a_venda(p_size_id uuid, p_category_id uuid)
returns boolean language sql stable set search_path = ''
as $$
  select exists (
    select 1
      from public.products card
      join public.categories c on c.id = card.category_id
     where card.flavor_size_id = p_size_id
       and card.flavor_category_id = p_category_id
       and card.is_active and card.is_temporarily_available
       and c.is_active and c.is_temporarily_available);
$$;
comment on function public.fogazza_a_venda(uuid, uuid) is
  'Há card de entrada disponível para este tamanho de fogazza e esta categoria de sabores (RN-FOG-007).';
revoke all on function public.fogazza_a_venda(uuid, uuid) from public;
grant execute on function public.fogazza_a_venda(uuid, uuid) to anon, authenticated;

-- ------------------------------------------------- variação disponível
create or replace function public.variante_disponivel(p_variant_id uuid)
returns boolean language sql stable set search_path = ''
as $$
  select pv.is_active and pv.is_temporarily_available
     and public.produto_disponivel(pv.product_id)
     -- A fogazza só se vende pelo card de entrada (RN-FOG-007).
     and (s.sold_as = 'pizza' or public.fogazza_a_venda(pv.size_id, p.category_id))
  from public.product_variants pv
  join public.pizza_sizes s on s.id = pv.size_id
  join public.products p on p.id = pv.product_id
  where pv.id = p_variant_id;
$$;

-- --------------------------------------------------- sabores do card
create or replace function public.sabores_da_fogazza(p_card_id uuid)
returns table (
  variacao_id uuid, produto_id uuid, nome text, slug text, descricao text,
  preco_de numeric, preco numeric, em_promocao boolean, disponivel boolean,
  imagem_path text, tamanho_id uuid, tamanho_nome text, fatias integer
)
language sql stable set search_path = ''
as $$
  select
    pv.id, p.id, p.name, p.slug, p.short_description,
    pv.price,
    public.preco_efetivo_variante(pv.id),
    public.preco_efetivo_variante(pv.id) < pv.price,
    coalesce(public.variante_disponivel(pv.id), false),
    public.caminho_publico_da_midia(p.image_asset_id),
    s.id, s.name, s.slice_count
  from public.products card
  join public.pizza_sizes s
    on s.id = card.flavor_size_id and s.sold_as = 'fogazza' and s.is_active
  join public.product_variants pv
    on pv.size_id = s.id and pv.is_active
  join public.products p
    on p.id = pv.product_id
   and p.category_id = card.flavor_category_id
   and p.product_type = 'pizza'
   -- Explícito: o painel enxerga produto inativo pelo RLS, e a lista do
   -- balcão tem de ser a mesma do cliente.
   and p.is_active
  where card.id = p_card_id
  order by p.sort_order, p.name;
$$;
comment on function public.sabores_da_fogazza(uuid) is
  'Sabores de um card de entrada de fogazza, com o preço de fogazza de cada um (RN-FOG-003).';
revoke all on function public.sabores_da_fogazza(uuid) from public;
grant execute on function public.sabores_da_fogazza(uuid) to anon, authenticated;

-- ------------------------------------------- disponível no cardápio
create or replace function public.produto_disponivel_no_cardapio(p_product_id uuid)
returns boolean language sql stable set search_path = ''
as $$
  select case
    when p.flavor_category_id is not null then
      p.is_active and p.is_temporarily_available
      and c.is_active and c.is_temporarily_available
      and exists (select 1 from public.sabores_da_fogazza(p.id) f where f.disponivel)
    when exists (
      select 1 from public.product_variants pv
        join public.pizza_sizes s on s.id = pv.size_id
       where pv.product_id = p.id and s.sold_as = 'fogazza') then
      coalesce(public.produto_disponivel(p.id), false)
      and exists (
        select 1 from public.product_variants pv
          join public.pizza_sizes s on s.id = pv.size_id
         where pv.product_id = p.id and s.sold_as = 'pizza'
           and pv.is_active and pv.is_temporarily_available)
    else coalesce(public.produto_disponivel(p.id), false)
  end
  from public.products p
  join public.categories c on c.id = p.category_id
  where p.id = p_product_id;
$$;
comment on function public.produto_disponivel_no_cardapio(uuid) is
  'Disponibilidade que o cardápio mostra: card de entrada pelos sabores; pizza só pelos tamanhos de pizza (RN-FOG-006).';
revoke all on function public.produto_disponivel_no_cardapio(uuid) from public;
grant execute on function public.produto_disponivel_no_cardapio(uuid) to anon, authenticated;

-- --------------------------------------------------------- cardápio
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
  order by c.sort_order, p.sort_order, p.name;
$$;

-- ------------------------------------------------------------ busca
-- O card de entrada é achado também pelos sabores: "fogazza calabresa"
-- encontra a "Fogazza salgada".
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

-- ------------------------------------------------ lista do painel
-- A lista de produtos do painel mostra o que o cliente vê: o card de entrada
-- com o preço dos sabores, e a pizza sem o preço de fogazza na faixa.
create or replace function public.catalogo_produtos_admin()
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_id uuid, categoria_nome text, categoria_pausada boolean,
  ativo boolean, disponivel_hoje boolean, disponivel boolean, destaque boolean,
  preco_base numeric, preco_min numeric, preco_max numeric, em_promocao boolean,
  tamanhos integer, limite_por_pedido integer, limite_adicionais integer,
  imagem_path text, ordem integer, exige_producao boolean
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
    c.id, c.name, not c.is_temporarily_available,
    p.is_active, p.is_temporarily_available,
    coalesce(public.produto_disponivel_no_cardapio(p.id), false), p.is_featured,
    p.base_price,
    case when p.flavor_category_id is not null then fz.preco else coalesce(
      (select min(public.preco_efetivo_variante(pv.id))
         from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)) end,
    case when p.flavor_category_id is not null then fz.preco_max else coalesce(
      (select max(public.preco_efetivo_variante(pv.id))
         from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)) end,
    case when p.flavor_category_id is not null then fz.em_promocao else exists (
      select 1 from public.promotions pr
      where pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
        and (pr.product_id = p.id
             or pr.variant_id in (select pv.id from variantes_de_pizza pv
                                   where pv.product_id = p.id))) end,
    (select count(*)::integer from public.product_variants pv where pv.product_id = p.id),
    p.max_quantity_per_order, p.max_addons,
    m.storage_path, p.sort_order, p.requires_production
  from public.products p
  join public.categories c on c.id = p.category_id
  left join public.media_assets m on m.id = p.image_asset_id
  left join lateral (
    select min(f.preco) as preco, max(f.preco) as preco_max,
           coalesce(bool_or(f.em_promocao), false) as em_promocao
      from public.sabores_da_fogazza(p.id) f
     where p.flavor_category_id is not null
  ) fz on true
  order by c.sort_order, p.sort_order, p.name;
$$;
