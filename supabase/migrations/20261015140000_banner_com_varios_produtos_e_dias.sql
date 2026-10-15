-- 0151 — Banner com vários produtos e dias da semana
-- D-2026-10-15-126 · RN-BANNER-002/003 (ampliadas)
--
-- O destino do banner era UMA entidade. Agora pode ser um conjunto de
-- produtos ("destaque"): o cliente toca no banner e vê a página com todos
-- eles. O banner também ganha dias da semana, com a mesma semântica da
-- promoção (0150): nulo = todos os dias; combina com o período por datas.

alter table public.banners
  add column weekdays smallint[];

alter table public.banners
  add constraint banners_dias_validos check (
    weekdays is null
    or (cardinality(weekdays) between 1 and 7
        and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
  );

comment on column public.banners.weekdays is
  'Dias da semana em que aparece (ISO: 1 = segunda … 7 = domingo). Nulo = todos os dias.';

-- ------------------------------------------------------------ destino 'products'
alter table public.banners drop constraint banners_destino_tipo;
alter table public.banners drop constraint banners_destino_coerente;

alter table public.banners add constraint banners_destino_tipo check (
  destination_type in ('product', 'products', 'category', 'promotion', 'external', 'none')
);

alter table public.banners add constraint banners_destino_coerente check (
  case destination_type
    when 'product' then destination_product_id is not null
      and destination_category_id is null and destination_promotion_id is null and external_url is null
    when 'category' then destination_category_id is not null
      and destination_product_id is null and destination_promotion_id is null and external_url is null
    when 'promotion' then destination_promotion_id is not null
      and destination_product_id is null and destination_category_id is null and external_url is null
    when 'external' then external_url is not null
      and destination_product_id is null and destination_category_id is null and destination_promotion_id is null
    -- 'products' e 'none': nenhuma entidade única; os produtos moram em banner_products.
    else destination_product_id is null and destination_category_id is null
      and destination_promotion_id is null and external_url is null
  end
);

create table public.banner_products (
  banner_id uuid not null references public.banners (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  sort_order integer not null default 0,
  primary key (banner_id, product_id)
);

create index banner_products_product_idx on public.banner_products (product_id);

comment on table public.banner_products is
  'Produtos de um banner com destino "products" (destaque). Referencia entidade, nunca URL digitada (RN-BANNER-002).';

alter table public.banner_products enable row level security;

create policy banner_products_select on public.banner_products for select to anon, authenticated
  using (
    public.has_permission('catalog.view')
    or exists (
      select 1 from public.banners b
       where b.id = banner_id and b.is_active
         and (b.starts_at is null or b.starts_at <= now())
         and (b.ends_at is null or b.ends_at > now())
    )
  );
create policy banner_products_insert on public.banner_products for insert to authenticated
  with check (public.has_permission('catalog.manage'));
create policy banner_products_update on public.banner_products for update to authenticated
  using (public.has_permission('catalog.manage')) with check (public.has_permission('catalog.manage'));
create policy banner_products_delete on public.banner_products for delete to authenticated
  using (public.has_permission('catalog.manage'));

grant select on public.banner_products to anon, authenticated;
grant insert, update, delete on public.banner_products to authenticated;

-- ---------------------------------------------------------- visibilidade
create or replace function public.banner_visivel(p_banner_id uuid, p_em timestamptz default now())
returns boolean language sql stable set search_path = ''
as $$
  select b.is_active
     and (b.starts_at is null or b.starts_at <= p_em)
     and (b.ends_at is null or b.ends_at > p_em)
     and public.promocao_no_dia(b.weekdays, p_em)
     and case b.destination_type
       when 'product' then coalesce(public.produto_disponivel(b.destination_product_id), false)
       -- Destaque: aparece enquanto ao menos um dos produtos está disponível.
       when 'products' then exists (
         select 1 from public.banner_products bp
          where bp.banner_id = b.id
            and coalesce(public.produto_disponivel(bp.product_id), false)
       )
       when 'category' then exists (
         select 1 from public.categories c
         where c.id = b.destination_category_id and c.is_active and c.is_temporarily_available
       )
       when 'promotion' then exists (
         select 1 from public.promotions pr
         where pr.id = b.destination_promotion_id
           and pr.is_active and pr.starts_at <= p_em
           and (pr.ends_at is null or pr.ends_at > p_em)
           and public.promocao_no_dia(pr.weekdays, p_em)
       )
       else true
     end
  from public.banners b
  where b.id = p_banner_id;
$$;

-- ------------------------------------------------------- banners públicos
create or replace function public.banners_publicos()
returns table(id uuid, titulo text, corpo text, imagem_path text, destino_tipo text,
              destino_slug text, url_externa text, ordem integer)
language sql stable set search_path = ''
as $$
  select
    b.id, b.title, b.body,
    public.caminho_publico_da_midia(b.image_asset_id),
    b.destination_type,
    coalesce(
      p.slug, c.slug,
      case when b.destination_type = 'products' then 'destaque/' || b.id::text end,
      case when b.destination_type = 'promotion' and (
        select count(distinct coalesce(x.product_id, xv.product_id))
          from public.promotions x
          left join public.product_variants xv on xv.id = x.variant_id
         where x.campaign_id = pr.campaign_id and x.is_active) > 1
      then 'promocao/' || pr.id::text end,
      pp.slug),
    b.external_url,
    b.sort_order
  from public.banners b
  left join public.products p on p.id = b.destination_product_id
  left join public.categories c on c.id = b.destination_category_id
  left join public.promotions pr on pr.id = b.destination_promotion_id
  left join public.product_variants pv on pv.id = pr.variant_id
  left join public.products pp on pp.id = coalesce(pr.product_id, pv.product_id)
  where coalesce(public.banner_visivel(b.id), false)
    and public.caminho_publico_da_midia(b.image_asset_id) is not null
  order by b.sort_order, b.created_at;
$$;

-- Os produtos do destaque, para a página pública. Vazio = banner fora do ar.
create or replace function public.itens_do_banner(p_banner_id uuid)
returns table(produto_id uuid, titulo_do_banner text)
language sql stable security definer set search_path = ''
as $$
  select bp.product_id, b.title
    from public.banners b
    join public.banner_products bp on bp.banner_id = b.id
   where b.id = p_banner_id
     and coalesce(public.banner_visivel(b.id), false)
   order by bp.sort_order;
$$;

revoke all on function public.itens_do_banner(uuid) from public;
grant execute on function public.itens_do_banner(uuid) to anon, authenticated;

-- ---------------------------------------------------- listagem administrativa
drop function public.catalogo_banners_admin();

create function public.catalogo_banners_admin()
returns table(
  id uuid, titulo text, corpo text, imagem_path text, destino_tipo text,
  destino_nome text, url_externa text, inicio timestamptz, fim timestamptz,
  ativo boolean, visivel_agora boolean, ordem integer,
  dias smallint[], itens integer)
language sql stable set search_path = ''
as $$
  select
    b.id, b.title, b.body, m.storage_path,
    b.destination_type,
    coalesce(
      p.name, c.name, pr.name,
      (select string_agg(x.name, ', ' order by bp.sort_order)
         from public.banner_products bp join public.products x on x.id = bp.product_id
        where bp.banner_id = b.id)),
    b.external_url,
    b.starts_at, b.ends_at, b.is_active,
    coalesce(public.banner_visivel(b.id), false),
    b.sort_order,
    b.weekdays,
    (select count(*)::integer from public.banner_products bp where bp.banner_id = b.id)
  from public.banners b
  join public.media_assets m on m.id = b.image_asset_id
  left join public.products p on p.id = b.destination_product_id
  left join public.categories c on c.id = b.destination_category_id
  left join public.promotions pr on pr.id = b.destination_promotion_id
  order by b.sort_order, b.created_at;
$$;

revoke all on function public.catalogo_banners_admin() from public, anon;
grant execute on function public.catalogo_banners_admin() to authenticated;
