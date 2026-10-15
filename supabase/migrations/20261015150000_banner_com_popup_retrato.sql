-- 0152 — Imagem de popup (retrato 1:2) no banner
-- D-2026-10-15-127 · RN-BANNER-002/003
--
-- O banner ganha uma SEGUNDA imagem, opcional, em retrato (1:2). Ela é o que
-- aparece no popup de abertura do cardápio. Regra da Shalon: sem imagem de
-- popup, não há popup — nada de aviso sem arte.
--
-- A visibilidade é a do banner (`banner_visivel`): popup só aparece se o
-- banner aparece (ativo, no período, no dia da semana, destino disponível).

alter table public.banners
  add column popup_image_asset_id uuid references public.media_assets (id) on delete restrict;

comment on column public.banners.popup_image_asset_id is
  'Imagem em retrato (1:2) do popup de abertura. Nulo = o banner não gera popup.';

drop function public.banners_publicos();

create function public.banners_publicos()
returns table(id uuid, titulo text, corpo text, imagem_path text, destino_tipo text,
              destino_slug text, url_externa text, ordem integer, popup_imagem_path text)
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
    b.sort_order,
    case when b.popup_image_asset_id is not null
         then public.caminho_publico_da_midia(b.popup_image_asset_id) end
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

grant execute on function public.banners_publicos() to anon, authenticated;

-- Listagem administrativa: o painel mostra quais banners têm popup.
drop function public.catalogo_banners_admin();

create function public.catalogo_banners_admin()
returns table(
  id uuid, titulo text, corpo text, imagem_path text, destino_tipo text,
  destino_nome text, url_externa text, inicio timestamptz, fim timestamptz,
  ativo boolean, visivel_agora boolean, ordem integer,
  dias smallint[], itens integer, tem_popup boolean)
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
    (select count(*)::integer from public.banner_products bp where bp.banner_id = b.id),
    b.popup_image_asset_id is not null
  from public.banners b
  join public.media_assets m on m.id = b.image_asset_id
  left join public.products p on p.id = b.destination_product_id
  left join public.categories c on c.id = b.destination_category_id
  left join public.promotions pr on pr.id = b.destination_promotion_id
  order by b.sort_order, b.created_at;
$$;

revoke all on function public.catalogo_banners_admin() from public, anon;
grant execute on function public.catalogo_banners_admin() to authenticated;
