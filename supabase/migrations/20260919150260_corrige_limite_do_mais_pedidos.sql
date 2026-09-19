-- 0052 — corrige o limite de "Mais pedidos"
--
-- Na 0051 o `limit` ficou na consulta EXTERNA, que já é a agregação e
-- devolve uma linha só. Resultado: o limite não limitava nada e o ranking
-- sairia com todos os produtos vendidos, não com os 6 de RN-POP-003.
--
-- O corte precisa acontecer ANTES de agregar, junto da ordenação que o
-- define.
create or replace function public.mais_pedidos(p_limite integer default 6)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'produto_id', r.produto_id, 'quantidade', r.quantidade)
         order by r.quantidade desc, r.nome), '[]'::jsonb)
  from (
    select p.id as produto_id, p.name as nome, sum(x.qtd) as quantidade
    from (
      select f.flavor_product_id as product_id, f.portion * i.quantity as qtd
      from public.order_items i
      join public.orders o on o.id = i.order_id
      join public.order_item_flavors f on f.order_item_id = i.id
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
    where public.produto_disponivel(p.id)
    group by p.id, p.name
    having sum(x.qtd) > 0
    order by sum(x.qtd) desc, p.name
    limit greatest(coalesce(p_limite, 6), 0)
  ) r;
$$;

comment on function public.mais_pedidos is 'RN-POP-001..004: 30 dias, concluídos, por quantidade, meio a meio por fração, sem impulso.';
