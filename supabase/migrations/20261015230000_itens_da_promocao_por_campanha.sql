-- 0160 — itens_da_promocao aceita o id da campanha
-- D-2026-10-15-137
--
-- A vitrine só conhece o id da CAMPANHA; o banner guarda o de uma PROMOÇÃO da
-- campanha. A função agora resolve os dois, para o botão "Ver os N sabores"
-- da vitrine levar à mesma página do banner.

create or replace function public.itens_da_promocao(p_promotion_id uuid)
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
   where (base.id = p_promotion_id or base.campaign_id = p_promotion_id)
     and x.is_active and x.starts_at <= now()
     and (x.ends_at is null or x.ends_at > now())
     and public.promocao_no_dia(x.weekdays, now());
$$;
