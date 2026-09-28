-- Alinha o grafo de estados à regra de produtos sem produção.
--
-- A migration 20260927200000 passou a oferecer `marcar_pronto` diretamente
-- para pedidos confirmed sem produção, mas o grafo ainda só aceitava a saída
-- de `in_production`. `comando_pedido` validava a ação e depois recusava a
-- própria transição. A condição por pedido continua em `acoes_do_pedido`:
-- estas arestas não fazem produtos de produção pularem a cozinha.

insert into public.order_status_transitions (from_status, to_status) values
  ('confirmed', 'ready_for_pickup'),
  ('confirmed', 'ready_for_delivery')
on conflict (from_status, to_status) do nothing;

do $post$
begin
  if not public.transicao_permitida('confirmed', 'ready_for_pickup') then
    raise exception 'Venda pronta de retirada continua sem transição no grafo';
  end if;

  if not public.transicao_permitida('confirmed', 'ready_for_delivery') then
    raise exception 'Pedido pronto de entrega continua sem transição no grafo';
  end if;
end $post$;

