-- 0159 — Campanha de promoção com fogazza mostra as fogazzas
-- D-2026-10-15-136
--
-- Promoção de uma variante de FOGAZZA (o tamanho "Fogazza" de um sabor de
-- pizza) fazia a vitrine mostrar a PIZZA daquele sabor: a campanha devolvia o
-- produto da variante, e a pizza é o produto. A fogazza é uma oferta
-- diferente (card próprio, sabor escolhido, tamanho fixo), então a campanha
-- passa a separar o que cobre:
--   produtos           produtos que entram como produto (alvo direto, ou
--                      variante de tamanho de PIZZA);
--   variantes_fogazza  as variantes de fogazza, para a vitrine montar os
--                      cards de sabor de fogazza;
--   produtos_fogazza   os produtos (pizzas) por trás delas — só para a
--                      vitrine NÃO listá-los como promoção solta.

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
  na_vitrine boolean,
  variantes_fogazza uuid[],
  produtos_fogazza uuid[])
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
    coalesce(array_agg(distinct coalesce(pr.product_id, pv.product_id))
      filter (where s.sold_as is distinct from 'fogazza'), '{}'),
    bool_and(pr.show_on_menu),
    coalesce(array_agg(distinct pr.variant_id)
      filter (where s.sold_as = 'fogazza'), '{}'),
    coalesce(array_agg(distinct pv.product_id)
      filter (where s.sold_as = 'fogazza'), '{}')
  from public.promotions pr
  left join public.product_variants pv on pv.id = pr.variant_id
  left join public.pizza_sizes s on s.id = pv.size_id
  where pr.is_active
    and pr.starts_at <= now()
    and (pr.ends_at is null or pr.ends_at > now())
    and public.promocao_no_dia(pr.weekdays, now())
  group by pr.campaign_id
  order by min(pr.starts_at) desc;
$$;

revoke all on function public.campanhas_em_promocao() from public;
grant execute on function public.campanhas_em_promocao() to anon, authenticated;

-- Página da promoção: os itens, dizendo quais são fogazza.
drop function public.itens_da_promocao(uuid);

create function public.itens_da_promocao(p_promotion_id uuid)
returns table(produto_id uuid, nome_da_promocao text, variante_de_fogazza uuid)
language sql stable security definer set search_path = ''
as $$
  select distinct
         coalesce(x.product_id, xv.product_id),
         x.name,
         case when s.sold_as = 'fogazza' then x.variant_id end
    from public.promotions base
    join public.promotions x on x.campaign_id = base.campaign_id
    left join public.product_variants xv on xv.id = x.variant_id
    left join public.pizza_sizes s on s.id = xv.size_id
   where base.id = p_promotion_id
     and x.is_active and x.starts_at <= now()
     and (x.ends_at is null or x.ends_at > now())
     and public.promocao_no_dia(x.weekdays, now());
$$;

revoke all on function public.itens_da_promocao(uuid) from public;
grant execute on function public.itens_da_promocao(uuid) to anon, authenticated;
