-- 0145 — vitrine do catálogo: preço e disponibilidade em uma passada só
-- Desempenho · D-2026-10-02-115 · nenhuma regra muda
--
-- O PROBLEMA. O cardápio (83 produtos) levava ~150 ms dentro do banco, a
-- busca ~154 ms e a lista do admin ~175 ms. Quase tudo era a
-- disponibilidade: `produto_disponivel_no_cardapio` chamada produto a
-- produto, que chama `produto_disponivel`, `sabores_da_fogazza`,
-- `variante_disponivel`, `fogazza_a_venda`... Funções SQL com
-- `SET search_path` não são incorporadas à consulta de quem chama; cada
-- chamada aninhada é planejada de novo, linha a linha.
--
-- A SOLUÇÃO. `vitrine_do_catalogo()` calcula, para todos os produtos de uma
-- vez (por junções e agregações), exatamente o que as funções por produto
-- calculam:
--   preco_de · preco · preco_max · em_promocao  (o card do cardápio)
--   disponivel                                  (= produto_disponivel_no_cardapio)
--   tem_tamanhos
-- `cardapio_publico`, `buscar_catalogo`, `catalogo_produtos_admin` e
-- `mais_pedidos` passam a ler dela. `produto_publico` já lia do cardápio.
--
-- AS FUNÇÕES POR PRODUTO CONTINUAM SENDO A REGRA. `montar_item`, o balcão,
-- os sabores e o ranking seguem usando-as. A vitrine é a mesma regra escrita
-- em conjunto, e a suíte `vitrine_do_catalogo.sql` compara as duas, produto
-- a produto, em todos os cenários (pausa, inativo, promoção, combo, fogazza).
-- Mudou a regra numa? Muda na outra — a suíte acusa a divergência.
--
-- Segurança: SECURITY INVOKER, como as funções que substitui. Cada um vê o
-- que o RLS deixa ver, igual a antes.

create or replace function public.vitrine_do_catalogo()
returns table (
  produto_id uuid,
  preco_de numeric,
  preco numeric,
  preco_max numeric,
  em_promocao boolean,
  disponivel boolean,
  tem_tamanhos boolean
)
language sql
stable
set search_path = ''
as $$
  with
  -- preco_efetivo_variante / preco_efetivo_produto: a promoção vigente mais
  -- recente do alvo, senão o preço normal.
  promocao_da_variante as (
    select distinct on (pr.variant_id) pr.variant_id, pr.promotional_price
      from public.promotions pr
     where pr.variant_id is not null
       and pr.is_active and pr.starts_at <= now()
       and (pr.ends_at is null or pr.ends_at > now())
     order by pr.variant_id, pr.starts_at desc
  ),
  promocao_do_produto as (
    select distinct on (pr.product_id) pr.product_id, pr.promotional_price
      from public.promotions pr
     where pr.product_id is not null
       and pr.is_active and pr.starts_at <= now()
       and (pr.ends_at is null or pr.ends_at > now())
     order by pr.product_id, pr.starts_at desc
  ),
  variantes as (
    select pv.id, pv.product_id, pv.size_id, pv.price,
           pv.is_active, pv.is_temporarily_available, s.sold_as,
           coalesce(pp.promotional_price, pv.price) as preco_efetivo,
           pp.variant_id is not null as tem_promocao
      from public.product_variants pv
      -- LEFT: "alguma variação à venda" (produto_disponivel) não olha o
      -- tamanho; o visitante pode não enxergar um tamanho desativado.
      left join public.pizza_sizes s on s.id = pv.size_id
      left join promocao_da_variante pp on pp.variant_id = pv.id
  ),
  produtos as (
    select p.id, p.product_type, p.base_price, p.category_id,
           p.flavor_category_id,
           p.is_active and p.is_temporarily_available
             and c.is_active and c.is_temporarily_available as no_ar,
           coalesce(pp.promotional_price, p.base_price) as preco_efetivo,
           pp.product_id is not null as tem_promocao
      from public.products p
      join public.categories c on c.id = p.category_id
      left join promocao_do_produto pp on pp.product_id = p.id
  ),
  resumo_variantes as (
    select v.product_id,
           bool_or(v.is_active and v.is_temporarily_available) as alguma_a_venda,
           bool_or(v.sold_as = 'pizza') as tem_pizza,
           bool_or(v.sold_as = 'pizza' and v.is_active) as tem_pizza_ativa,
           bool_or(v.sold_as = 'pizza' and v.is_active
                   and v.is_temporarily_available) as pizza_a_venda,
           bool_or(v.sold_as = 'fogazza') as tem_fogazza,
           bool_or(v.sold_as = 'pizza' and v.tem_promocao) as pizza_em_promocao,
           min(v.price) filter (where v.sold_as = 'pizza' and v.is_active) as pizza_preco_de,
           min(v.preco_efetivo) filter (where v.sold_as = 'pizza' and v.is_active) as pizza_preco,
           max(v.preco_efetivo) filter (where v.sold_as = 'pizza' and v.is_active) as pizza_preco_max
      from variantes v
     group by v.product_id
  ),
  -- produto_disponivel. O combo (raro) segue pela função dele.
  base as (
    select p.*, r.*,
           p.no_ar
           and (p.product_type <> 'combo' or coalesce(public.combo_disponivel(p.id), false))
           and (coalesce(r.alguma_a_venda, false)
                or (p.base_price is not null and not coalesce(r.tem_pizza, false)))
             as disponivel_base
      from produtos p
      left join resumo_variantes r on r.product_id = p.id
  ),
  -- fogazza_a_venda: (tamanho, categoria) com algum card no ar.
  cards_no_ar as (
    select distinct card.flavor_size_id as size_id, card.flavor_category_id as category_id
      from public.products card
      join public.categories c on c.id = card.category_id
     where card.is_active and card.is_temporarily_available
       and c.is_active and c.is_temporarily_available
  ),
  -- sabores_da_fogazza, de todos os cards de uma vez.
  sabores as (
    select card.id as card_id,
           v.price as preco_de,
           v.preco_efetivo as preco,
           v.preco_efetivo < v.price as em_promocao,
           -- variante_disponivel
           v.is_temporarily_available
           and coalesce(b.disponivel_base, false)
           and exists (select 1 from cards_no_ar a
                        where a.size_id = v.size_id and a.category_id = p.category_id)
             as disponivel
      from public.products card
      join public.pizza_sizes s
        on s.id = card.flavor_size_id and s.sold_as = 'fogazza' and s.is_active
      join variantes v on v.size_id = s.id and v.is_active
      join public.products p
        on p.id = v.product_id
       and p.category_id = card.flavor_category_id
       and p.product_type = 'pizza'
       and p.is_active
      left join base b on b.id = p.id
  ),
  resumo_sabores as (
    select f.card_id,
           min(f.preco_de) as preco_de,
           min(f.preco) as preco,
           max(f.preco) as preco_max,
           bool_or(f.em_promocao) as em_promocao,
           bool_or(f.disponivel) as algum_disponivel
      from sabores f
     group by f.card_id
  )
  select
    b.id,
    case when b.flavor_category_id is not null then rs.preco_de
         else coalesce(b.pizza_preco_de, b.base_price) end,
    case when b.flavor_category_id is not null then rs.preco
         else coalesce(b.pizza_preco, b.preco_efetivo) end,
    case when b.flavor_category_id is not null then rs.preco_max
         else coalesce(b.pizza_preco_max, b.preco_efetivo) end,
    case when b.flavor_category_id is not null then coalesce(rs.em_promocao, false)
         else b.tem_promocao or coalesce(b.pizza_em_promocao, false) end,
    -- produto_disponivel_no_cardapio
    coalesce(case
      when b.flavor_category_id is not null then
        b.no_ar and coalesce(rs.algum_disponivel, false)
      when coalesce(b.tem_fogazza, false) then
        b.disponivel_base
        and case when coalesce(b.tem_pizza, false) then coalesce(b.pizza_a_venda, false)
                 else b.base_price is not null end
      else b.disponivel_base
    end, false),
    b.flavor_category_id is not null or coalesce(b.tem_pizza_ativa, false)
  from base b
  left join resumo_sabores rs on rs.card_id = b.id;
$$;

revoke all on function public.vitrine_do_catalogo() from public;
grant execute on function public.vitrine_do_catalogo() to anon, authenticated;

-- ------------------------------------------------------------ o cardápio
create or replace function public.cardapio_publico(p_categoria_slug text default null)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_id uuid, categoria_nome text, categoria_slug text, categoria_ordem integer,
  preco_de numeric, preco numeric, preco_max numeric, em_promocao boolean,
  disponivel boolean, destaque boolean, tem_tamanhos boolean, imagem_path text,
  ordem integer, limite_por_pedido integer
)
language sql
stable
set search_path = ''
as $$
  select
    p.id, p.name, p.slug, p.product_type, p.short_description,
    c.id, c.name, c.slug, c.sort_order,
    v.preco_de, v.preco, v.preco_max, v.em_promocao,
    v.disponivel,
    p.is_featured,
    v.tem_tamanhos,
    public.caminho_publico_da_midia(p.image_asset_id),
    p.sort_order,
    p.max_quantity_per_order
  from public.products p
  join public.categories c on c.id = p.category_id
  join public.vitrine_do_catalogo() v on v.produto_id = p.id
  where (p_categoria_slug is null or c.slug = p_categoria_slug)
    -- Inativo não é cardápio, para ninguém: nem para a equipe logada, que o
    -- RLS deixa ver inativos por causa do painel (0139).
    and p.is_active and c.is_active
  order by c.sort_order, p.sort_order, p.name;
$$;

-- ------------------------------------------------------------ a busca
create or replace function public.buscar_catalogo(p_termo text)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_nome text, categoria_slug text,
  preco_de numeric, preco numeric, em_promocao boolean,
  disponivel boolean, imagem_path text
)
language sql
stable
set search_path = ''
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
    v.preco_de, v.preco, v.em_promocao,
    v.disponivel,
    public.caminho_publico_da_midia(p.image_asset_id)
  from encontrados e
  join public.products p on p.id = e.id
  join public.categories c on c.id = p.category_id
  join public.vitrine_do_catalogo() v on v.produto_id = p.id
  order by
    e.palavra_no_nome desc,
    e.no_nome desc,
    v.disponivel desc,
    p.name;
$$;

-- ------------------------------------------------------------ o admin
create or replace function public.catalogo_produtos_admin()
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_id uuid, categoria_nome text, categoria_pausada boolean,
  ativo boolean, disponivel_hoje boolean, disponivel boolean, destaque boolean,
  preco_base numeric, preco_min numeric, preco_max numeric, em_promocao boolean,
  tamanhos integer, limite_por_pedido integer, limite_adicionais integer,
  imagem_path text, ordem integer, exige_producao boolean
)
language sql
stable
set search_path = ''
as $$
  select
    p.id, p.name, p.slug, p.product_type, p.short_description,
    c.id, c.name, not c.is_temporarily_available,
    p.is_active, p.is_temporarily_available,
    v.disponivel, p.is_featured,
    p.base_price,
    v.preco, v.preco_max, v.em_promocao,
    (select count(*)::integer from public.product_variants pv where pv.product_id = p.id),
    p.max_quantity_per_order, p.max_addons,
    m.storage_path, p.sort_order, p.requires_production
  from public.products p
  join public.categories c on c.id = p.category_id
  join public.vitrine_do_catalogo() v on v.produto_id = p.id
  left join public.media_assets m on m.id = p.image_asset_id
  order by c.sort_order, p.sort_order, p.name;
$$;

-- ------------------------------------------------------------ mais pedidos
create or replace function public.mais_pedidos(p_limite integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'produto_id', r.produto_id, 'quantidade', r.quantidade)
         order by r.quantidade desc, r.nome), '[]'::jsonb)
  from (
    select p.id as produto_id, p.name as nome, sum(x.qtd) as quantidade
    from (
      -- Sabores. A fogazza soma no CARD que a vende, e não na pizza do
      -- sabor (D-2026-09-30-101): é o card que o cliente abre no cardápio.
      select case when s.sold_as = 'fogazza' then card.id
                  else f.flavor_product_id end as product_id,
             f.portion * i.quantity as qtd
      from public.order_items i
      join public.orders o on o.id = i.order_id
      join public.order_item_flavors f on f.order_item_id = i.id
      left join public.pizza_sizes s on s.id = i.size_id
      left join public.products fp on fp.id = f.flavor_product_id
      left join lateral (
        select c.id
          from public.products c
         where s.sold_as = 'fogazza'
           and c.flavor_size_id = i.size_id
           and c.flavor_category_id = fp.category_id
         order by c.is_active desc, c.sort_order, c.name
         limit 1
      ) card on true
      where o.status = 'completed'
        and o.completed_at >= now() - interval '30 days'

      union all

      select i.product_id, i.quantity::numeric
      from public.order_items i
      join public.orders o on o.id = i.order_id
      where o.status = 'completed'
        and o.completed_at >= now() - interval '30 days'
        and not exists (select 1 from public.order_item_flavors f
                         where f.order_item_id = i.id)
    ) x
    join public.products p on p.id = x.product_id
    -- A disponibilidade que o cliente vê no cardápio.
    join public.vitrine_do_catalogo() v on v.produto_id = p.id and v.disponivel
    group by p.id, p.name
    having sum(x.qtd) > 0
    order by sum(x.qtd) desc, p.name
    limit greatest(coalesce(p_limite, 6), 0)
  ) r;
$$;
