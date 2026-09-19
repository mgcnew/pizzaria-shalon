-- 0031 — Projeções públicas do catálogo
-- 03-RLS-RBAC-SEGURANCA.md §8.1 e §8.2 · 05-PLANO-IMPLEMENTACAO.md §8
-- 04-REGRAS-NEGOCIO.md RN-BUSCA-001/002, RN-LINK-001/002, RN-DISP, RN-PIZZA
--
-- O cliente público lê o cardápio por estas funções, e não montando consultas
-- soltas. Motivos:
--   · §8.1 — o público só enxerga o publicável;
--   · CLAUDE.md §17 — preço efetivo vem calculado do banco, uma vez só;
--   · CLAUDE.md §39 — uma chamada por tela, não uma por linha.
--
-- Todas SECURITY INVOKER: o RLS continua valendo. Produto inativo não sai
-- daqui porque a policy não o entrega, não porque a função filtrou.

-- ---------------------------------------------------------------- categorias
create or replace function public.categorias_publicas()
returns table (
  id uuid, nome text, slug text, descricao text,
  pausada boolean, produtos integer, ordem integer
) language sql stable set search_path = ''
as $$
  select c.id, c.name, c.slug, c.description,
    -- RN-DISP-004: pausada continua VISÍVEL; o que muda é a disponibilidade
    -- dos produtos dela. Categoria inativa nem chega aqui (RLS).
    not c.is_temporarily_available,
    (select count(*)::integer from public.products p
      where p.category_id = c.id and p.is_active),
    c.sort_order
  from public.categories c
  order by c.sort_order, c.name;
$$;

-- ------------------------------------------------------------------ cardápio
-- Uma linha por produto publicável, com tudo que o card do design mostra.
create or replace function public.cardapio_publico(p_categoria_slug text default null)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_id uuid, categoria_nome text, categoria_slug text, categoria_ordem integer,
  preco_de numeric, preco numeric, preco_max numeric,
  em_promocao boolean, disponivel boolean, destaque boolean,
  tem_tamanhos boolean, imagem_path text, ordem integer,
  limite_por_pedido integer
) language sql stable set search_path = ''
as $$
  select
    p.id, p.name, p.slug, p.product_type, p.short_description,
    c.id, c.name, c.slug, c.sort_order,
    -- Preço "de", riscado quando há promoção: é o preço NORMAL, nunca um
    -- valor promocional antigo (RN-LINK-002).
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
    -- RN-BUSCA-002: indisponível ainda aparece, marcado, sem permitir adição.
    coalesce(public.produto_disponivel(p.id), false),
    p.is_featured,
    exists (select 1 from public.product_variants pv
             where pv.product_id = p.id and pv.is_active),
    m.storage_path, p.sort_order,
    p.max_quantity_per_order
  from public.products p
  join public.categories c on c.id = p.category_id
  left join public.media_assets m on m.id = p.image_asset_id
  where p_categoria_slug is null or c.slug = p_categoria_slug
  order by c.sort_order, p.sort_order, p.name;
$$;

comment on function public.cardapio_publico is 'Cardápio publicável com preço efetivo e disponibilidade calculados no banco.';

-- RN-LINK-001: produto, combo e categoria têm link compartilhável.
create or replace function public.produto_publico(p_slug text)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_nome text, categoria_slug text,
  preco_de numeric, preco numeric, preco_max numeric,
  em_promocao boolean, disponivel boolean, destaque boolean,
  tem_tamanhos boolean, imagem_path text, limite_por_pedido integer,
  limite_adicionais integer, adicionais_ligados boolean
) language sql stable set search_path = ''
as $$
  select
    c.id, c.nome, c.slug, c.tipo, c.descricao,
    c.categoria_nome, c.categoria_slug,
    c.preco_de, c.preco, c.preco_max,
    c.em_promocao, c.disponivel, c.destaque,
    c.tem_tamanhos, c.imagem_path, c.limite_por_pedido,
    p.max_addons,
    public.adicionais_habilitados()
  from public.cardapio_publico() c
  join public.products p on p.id = c.id
  where c.slug = p_slug;
$$;

-- -------------------------------------------------------- tamanhos e sabores
-- RN-PIZZA-003: cada pizza oferece os tamanhos que quiser, com preço próprio.
create or replace function public.tamanhos_publicos(p_product_id uuid)
returns table (
  variacao_id uuid, tamanho_id uuid, tamanho_nome text,
  fatias integer, max_sabores integer,
  preco_de numeric, preco numeric, em_promocao boolean, disponivel boolean
) language sql stable set search_path = ''
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
  order by s.sort_order, s.name;
$$;

-- RN-PIZZA-004: meio a meio só entre sabores que oferecem o MESMO tamanho.
-- Por isso a consulta é por tamanho, não por produto: quem não oferece
-- aquele tamanho simplesmente não aparece na lista.
create or replace function public.sabores_publicos(p_size_id uuid)
returns table (
  variacao_id uuid, produto_id uuid, nome text, slug text,
  descricao text, preco numeric, disponivel boolean
) language sql stable set search_path = ''
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
  order by p.sort_order, p.name;
$$;

-- --------------------------------------------------- bordas e adicionais
-- RN-BORDA-002/003: a elegibilidade e o preço dependem do TAMANHO, e a
-- exclusão por produto é exceção. Quem decide é borda_permitida().
create or replace function public.bordas_publicas(p_product_id uuid, p_size_id uuid)
returns table (id uuid, nome text, preco numeric) language sql stable set search_path = ''
as $$
  select c.id, c.name, csp.price
  from public.crusts c
  join public.crust_size_prices csp on csp.crust_id = c.id and csp.size_id = p_size_id
  where public.borda_permitida(p_product_id, p_size_id, c.id)
  order by c.sort_order, c.name;
$$;

create or replace function public.adicionais_publicos(p_product_id uuid, p_size_id uuid)
returns table (id uuid, nome text, preco numeric) language sql stable set search_path = ''
as $$
  select a.id, a.name, asp.price
  from public.addons a
  join public.addon_size_prices asp on asp.addon_id = a.id and asp.size_id = p_size_id
  where public.adicional_permitido(p_product_id, p_size_id, a.id)
  order by a.sort_order, a.name;
$$;

-- --------------------------------------------------------------- combos
-- RN-COMBO-001/002: composição EXATA, para exibição. Não é configurador —
-- o cliente não escolhe nada aqui.
create or replace function public.combo_publico(p_product_id uuid)
returns table (nome text, tamanho text, quantidade integer, ordem integer)
language sql stable set search_path = ''
as $$
  select cp.name, s.name, cc.quantity, cc.sort_order
  from public.combo_components cc
  join public.products cp on cp.id = cc.component_product_id
  left join public.product_variants cv on cv.id = cc.component_variant_id
  left join public.pizza_sizes s on s.id = cv.size_id
  where cc.combo_product_id = p_product_id
  order by cc.sort_order;
$$;

-- --------------------------------------------------------------- busca
-- RN-BUSCA-001: nome, descrição, categoria e TAMANHOS OFERECIDOS, sem
-- diferenciar acento nem caixa.
create or replace function public.buscar_catalogo(p_termo text)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_nome text, categoria_slug text,
  preco_de numeric, preco numeric, em_promocao boolean,
  disponivel boolean, imagem_path text
) language sql stable set search_path = ''
as $$
  with termo as (select public.sem_acento(p_termo) as t)
  select
    c.id, c.nome, c.slug, c.tipo, c.descricao,
    c.categoria_nome, c.categoria_slug,
    c.preco_de, c.preco, c.em_promocao, c.disponivel, c.imagem_path
  from public.cardapio_publico() c, termo
  where length(btrim(termo.t)) > 0
    and (
      public.sem_acento(c.nome) like '%' || termo.t || '%'
      or public.sem_acento(coalesce(c.descricao, '')) like '%' || termo.t || '%'
      or public.sem_acento(c.categoria_nome) like '%' || termo.t || '%'
      -- tamanhos oferecidos: "brotinho" encontra as pizzas que existem nele
      or exists (
        select 1 from public.product_variants pv
        join public.pizza_sizes s on s.id = pv.size_id
        where pv.product_id = c.id and pv.is_active
          and public.sem_acento(s.name) like '%' || termo.t || '%'
      )
    )
  order by
    -- quem casa pelo nome vem antes de quem casou só pela descrição
    (public.sem_acento(c.nome) like '%' || termo.t || '%') desc,
    c.disponivel desc,
    c.nome;
$$;

comment on function public.buscar_catalogo is 'RN-BUSCA-001: nome, descrição, categoria e tamanhos oferecidos, sem acento e sem caixa.';

-- --------------------------------------------------------------- banners
-- RN-BANNER-003/004: a visibilidade também depende do destino, e isso é
-- decidido por banner_visivel(), não aqui.
create or replace function public.banners_publicos()
returns table (
  id uuid, titulo text, corpo text, imagem_path text,
  destino_tipo text, destino_slug text, url_externa text, ordem integer
) language sql stable set search_path = ''
as $$
  select
    b.id, b.title, b.body, m.storage_path,
    b.destination_type,
    coalesce(p.slug, c.slug, pp.slug),
    b.external_url,
    b.sort_order
  from public.banners b
  join public.media_assets m on m.id = b.image_asset_id
  left join public.products p on p.id = b.destination_product_id
  left join public.categories c on c.id = b.destination_category_id
  left join public.promotions pr on pr.id = b.destination_promotion_id
  -- Banner de promoção leva ao PRODUTO alvo: o cliente precisa de uma página
  -- para abrir, e promoção não é página (RN-BANNER-002).
  left join public.product_variants pv on pv.id = pr.variant_id
  left join public.products pp on pp.id = coalesce(pr.product_id, pv.product_id)
  where coalesce(public.banner_visivel(b.id), false)
  order by b.sort_order, b.created_at;
$$;

-- media_assets é interno (metadado). O caminho do arquivo sai por estas
-- funções, que devolvem só o `storage_path` do bucket público — nunca a
-- linha inteira.
revoke all on function public.categorias_publicas() from public;
revoke all on function public.cardapio_publico(text) from public;
revoke all on function public.produto_publico(text) from public;
revoke all on function public.tamanhos_publicos(uuid) from public;
revoke all on function public.sabores_publicos(uuid) from public;
revoke all on function public.bordas_publicas(uuid, uuid) from public;
revoke all on function public.adicionais_publicos(uuid, uuid) from public;
revoke all on function public.combo_publico(uuid) from public;
revoke all on function public.buscar_catalogo(text) from public;
revoke all on function public.banners_publicos() from public;

grant execute on function public.categorias_publicas() to anon, authenticated;
grant execute on function public.cardapio_publico(text) to anon, authenticated;
grant execute on function public.produto_publico(text) to anon, authenticated;
grant execute on function public.tamanhos_publicos(uuid) to anon, authenticated;
grant execute on function public.sabores_publicos(uuid) to anon, authenticated;
grant execute on function public.bordas_publicas(uuid, uuid) to anon, authenticated;
grant execute on function public.adicionais_publicos(uuid, uuid) to anon, authenticated;
grant execute on function public.combo_publico(uuid) to anon, authenticated;
grant execute on function public.buscar_catalogo(text) to anon, authenticated;
grant execute on function public.banners_publicos() to anon, authenticated;
