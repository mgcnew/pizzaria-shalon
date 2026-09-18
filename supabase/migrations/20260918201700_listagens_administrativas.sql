-- 0028 — Listagens administrativas do catálogo
-- CLAUDE.md §17 e §39 · 03-RLS-RBAC-SEGURANCA.md §8.2
--
-- POR QUE ESTAS FUNÇÕES EXISTEM: a tela de Produtos precisa mostrar preço
-- efetivo e disponibilidade de cada item. Calcular isso em TypeScript
-- duplicaria a fórmula que já vive no banco (§17 proíbe), e chamar
-- preco_efetivo_* uma vez por linha seria N+1 (§39).
--
-- SECURITY INVOKER: o RLS continua valendo. Quem tem catalog.view enxerga o
-- catálogo inteiro; quem não tem enxerga o que o cliente enxerga.

create or replace function public.catalogo_produtos_admin()
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_id uuid, categoria_nome text, categoria_pausada boolean,
  ativo boolean, disponivel_hoje boolean, disponivel boolean, destaque boolean,
  preco_base numeric, preco_min numeric, preco_max numeric,
  em_promocao boolean, tamanhos integer,
  limite_por_pedido integer, limite_adicionais integer,
  imagem_path text, ordem integer
) language sql stable set search_path = ''
as $$
  select
    p.id, p.name, p.slug, p.product_type, p.short_description,
    c.id, c.name, not c.is_temporarily_available,
    p.is_active, p.is_temporarily_available,
    coalesce(public.produto_disponivel(p.id), false), p.is_featured,
    p.base_price,
    -- Pizza mostra a faixa de preço dos tamanhos que oferece; produto simples
    -- mostra o próprio preço efetivo.
    coalesce(
      (select min(public.preco_efetivo_variante(pv.id))
         from public.product_variants pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)),
    coalesce(
      (select max(public.preco_efetivo_variante(pv.id))
         from public.product_variants pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)),
    exists (
      select 1 from public.promotions pr
      where pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
        and (pr.product_id = p.id
             or pr.variant_id in (select pv.id from public.product_variants pv
                                   where pv.product_id = p.id))),
    (select count(*)::integer from public.product_variants pv where pv.product_id = p.id),
    p.max_quantity_per_order, p.max_addons,
    m.storage_path, p.sort_order
  from public.products p
  join public.categories c on c.id = p.category_id
  left join public.media_assets m on m.id = p.image_asset_id
  order by c.sort_order, p.sort_order, p.name;
$$;

comment on function public.catalogo_produtos_admin is 'Lista de produtos com preço efetivo e disponibilidade calculados no banco (CLAUDE.md §17).';

create or replace function public.catalogo_variacoes_admin(p_product_id uuid)
returns table (
  id uuid, tamanho_id uuid, tamanho_nome text, fatias integer, max_sabores integer,
  preco numeric, preco_efetivo numeric, ativa boolean,
  disponivel_hoje boolean, disponivel boolean, em_promocao boolean
) language sql stable set search_path = ''
as $$
  select
    pv.id, s.id, s.name, s.slice_count, s.max_flavors,
    pv.price, public.preco_efetivo_variante(pv.id),
    pv.is_active, pv.is_temporarily_available,
    coalesce(public.variante_disponivel(pv.id), false),
    exists (
      select 1 from public.promotions pr
      where pr.variant_id = pv.id and pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now()))
  from public.product_variants pv
  join public.pizza_sizes s on s.id = pv.size_id
  where pv.product_id = p_product_id
  order by s.sort_order, s.name;
$$;

-- RN-PROMO-002: a situação é derivada do período e do liga/desliga, nunca
-- gravada — promoção não "vira" expirada por rotina, ela simplesmente passa.
create or replace function public.catalogo_promocoes_admin()
returns table (
  id uuid, nome text, alvo_tipo text, alvo_nome text,
  preco_promocional numeric, preco_normal numeric,
  inicio timestamptz, fim timestamptz, ativa boolean,
  situacao text, limite_por_pedido integer
) language sql stable set search_path = ''
as $$
  select
    pr.id, pr.name, pr.target_type,
    coalesce(p.name, pp.name || ' · ' || s.name),
    pr.promotional_price,
    coalesce(p.base_price, pv.price),
    pr.starts_at, pr.ends_at, pr.is_active,
    case
      when not pr.is_active then 'inativa'
      when pr.starts_at > now() then 'agendada'
      when pr.ends_at is not null and pr.ends_at <= now() then 'encerrada'
      else 'vigente'
    end,
    pr.max_quantity_per_order
  from public.promotions pr
  left join public.products p on p.id = pr.product_id
  left join public.product_variants pv on pv.id = pr.variant_id
  left join public.products pp on pp.id = pv.product_id
  left join public.pizza_sizes s on s.id = pv.size_id
  order by pr.starts_at desc;
$$;

create or replace function public.catalogo_combos_admin()
returns table (
  id uuid, nome text, slug text, preco numeric, preco_efetivo numeric,
  ativo boolean, disponivel boolean, componentes integer,
  composicao text, soma_componentes numeric
) language sql stable set search_path = ''
as $$
  select
    p.id, p.name, p.slug, p.base_price, public.preco_efetivo_produto(p.id),
    p.is_active, coalesce(public.produto_disponivel(p.id), false),
    (select count(*)::integer from public.combo_components cc where cc.combo_product_id = p.id),
    (select string_agg(
        cc.quantity || '× ' || cp.name
          || coalesce(' (' || s.name || ')', ''), ' + ' order by cc.sort_order)
       from public.combo_components cc
       join public.products cp on cp.id = cc.component_product_id
       left join public.product_variants cv on cv.id = cc.component_variant_id
       left join public.pizza_sizes s on s.id = cv.size_id
      where cc.combo_product_id = p.id),
    -- 79.5: a soma dos componentes é INFORMAÇÃO administrativa. O preço
    -- cobrado continua sendo o do combo (RN-COMBO-006).
    (select sum(cc.quantity * coalesce(
        public.preco_efetivo_variante(cc.component_variant_id),
        public.preco_efetivo_produto(cc.component_product_id)))
       from public.combo_components cc
      where cc.combo_product_id = p.id)
  from public.products p
  where p.product_type = 'combo'
  order by p.sort_order, p.name;
$$;

comment on function public.catalogo_combos_admin is 'RN-COMBO-006: soma_componentes é informação administrativa, não o preço cobrado.';

create or replace function public.catalogo_banners_admin()
returns table (
  id uuid, titulo text, corpo text, imagem_path text,
  destino_tipo text, destino_nome text, url_externa text,
  inicio timestamptz, fim timestamptz, ativo boolean,
  visivel_agora boolean, ordem integer
) language sql stable set search_path = ''
as $$
  select
    b.id, b.title, b.body, m.storage_path,
    b.destination_type,
    coalesce(p.name, c.name, pr.name),
    b.external_url,
    b.starts_at, b.ends_at, b.is_active,
    coalesce(public.banner_visivel(b.id), false),
    b.sort_order
  from public.banners b
  join public.media_assets m on m.id = b.image_asset_id
  left join public.products p on p.id = b.destination_product_id
  left join public.categories c on c.id = b.destination_category_id
  left join public.promotions pr on pr.id = b.destination_promotion_id
  order by b.sort_order, b.created_at;
$$;

-- Listagens administrativas: só usuário autenticado. O cardápio público da
-- Fase 4 terá projeção própria, com o que o cliente precisa e nada além.
revoke all on function public.catalogo_produtos_admin() from public, anon;
revoke all on function public.catalogo_variacoes_admin(uuid) from public, anon;
revoke all on function public.catalogo_promocoes_admin() from public, anon;
revoke all on function public.catalogo_combos_admin() from public, anon;
revoke all on function public.catalogo_banners_admin() from public, anon;

grant execute on function public.catalogo_produtos_admin() to authenticated;
grant execute on function public.catalogo_variacoes_admin(uuid) to authenticated;
grant execute on function public.catalogo_promocoes_admin() to authenticated;
grant execute on function public.catalogo_combos_admin() to authenticated;
grant execute on function public.catalogo_banners_admin() to authenticated;
