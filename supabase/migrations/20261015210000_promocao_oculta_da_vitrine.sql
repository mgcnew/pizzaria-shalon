-- 0158 — Promoção que só aparece pelo banner
-- D-2026-10-15-135
--
-- Com mais de uma promoção ao mesmo tempo, a vitrine empilhava uma faixa
-- embaixo da outra. A dona quer poder OCULTAR uma promoção da vitrine do
-- cardápio e deixá-la acessível só pelo banner (`/promocao/<id>`).
--
-- `show_on_menu` NÃO muda a promoção: preço, vigência e dias valem igual no
-- cardápio e no carrinho. Muda só se ela ganha uma faixa própria na página
-- inicial.

alter table public.promotions
  add column show_on_menu boolean not null default true;

comment on column public.promotions.show_on_menu is
  'Mostra a faixa da campanha na vitrine do cardápio. Falso = só acessível pelo banner. Não altera preço nem vigência.';

-- Vitrine pública: agora diz se a campanha tem faixa na página inicial.
drop function public.campanhas_em_promocao();

create function public.campanhas_em_promocao()
returns table(
  campanha_id uuid,
  nome text,
  dias smallint[],
  fim timestamptz,
  preco_min numeric,
  preco_max numeric,
  produtos uuid[],
  na_vitrine boolean)
language sql stable security definer set search_path = ''
as $$
  select
    pr.campaign_id,
    min(pr.name),
    (select p2.weekdays from public.promotions p2
      where p2.campaign_id = pr.campaign_id order by p2.id limit 1),
    min(pr.ends_at),
    min(pr.promotional_price),
    max(pr.promotional_price),
    array_agg(distinct coalesce(pr.product_id, pv.product_id)),
    bool_and(pr.show_on_menu)
  from public.promotions pr
  left join public.product_variants pv on pv.id = pr.variant_id
  where pr.is_active
    and pr.starts_at <= now()
    and (pr.ends_at is null or pr.ends_at > now())
    and public.promocao_no_dia(pr.weekdays, now())
  group by pr.campaign_id
  order by min(pr.starts_at) desc;
$$;

revoke all on function public.campanhas_em_promocao() from public;
grant execute on function public.campanhas_em_promocao() to anon, authenticated;

-- Listagem do painel: mostra o estado.
drop function public.catalogo_promocoes_admin();

create function public.catalogo_promocoes_admin()
returns table(
  id uuid, nome text, alvo_tipo text, alvo_nome text,
  preco_promocional numeric, preco_normal numeric,
  inicio timestamptz, fim timestamptz, ativa boolean, situacao text,
  limite_por_pedido integer, campanha_id uuid, dias smallint[],
  na_vitrine boolean)
language sql stable set search_path = ''
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
      when not public.promocao_no_dia(pr.weekdays, now()) then 'fora_do_dia'
      else 'vigente'
    end,
    pr.max_quantity_per_order,
    pr.campaign_id,
    pr.weekdays,
    pr.show_on_menu
  from public.promotions pr
  left join public.products p on p.id = pr.product_id
  left join public.product_variants pv on pv.id = pr.variant_id
  left join public.products pp on pp.id = pv.product_id
  left join public.pizza_sizes s on s.id = pv.size_id
  order by pr.starts_at desc, pr.name;
$$;

revoke all on function public.catalogo_promocoes_admin() from public, anon;
grant execute on function public.catalogo_promocoes_admin() to authenticated;
