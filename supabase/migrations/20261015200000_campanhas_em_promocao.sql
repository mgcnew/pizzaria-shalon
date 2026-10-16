-- 0157 — Campanhas de promoção vigentes, para o cabeçalho da vitrine
-- D-2026-10-15-133
--
-- O cardápio sabia QUE um item está em promoção, mas não de qual campanha:
-- nem o nome, nem os dias da semana, nem até quando, nem o preço comum. Esta
-- função devolve uma linha por campanha vigente AGORA (ativa, no período e no
-- dia da semana), com os produtos que ela cobre. É só leitura; preço e
-- disponibilidade de cada item continuam vindo do cardápio.

create or replace function public.campanhas_em_promocao()
returns table(
  campanha_id uuid,
  nome text,
  dias smallint[],
  fim timestamptz,
  preco_min numeric,
  preco_max numeric,
  produtos uuid[])
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
    array_agg(distinct coalesce(pr.product_id, pv.product_id))
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
