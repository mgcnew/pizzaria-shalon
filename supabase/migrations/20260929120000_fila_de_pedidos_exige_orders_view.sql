-- 0131 — a fila de pedidos volta a exigir `orders.view`
-- 03-RLS-RBAC-SEGURANCA.md §5 · CLAUDE.md §12, §15 · D-2026-09-29-92
--
-- O DEFEITO. A 0108 (`fila_encerrada_sem_acoes_por_linha`, 23/09) recriou
-- `fila_de_pedidos` como SECURITY DEFINER. Até ali a função era INVOKER, e o
-- comentário dela dizia o contrato: "sem orders.view não retorna nada". Como
-- DEFINER, ela passou a rodar com o dono da função e ignorar o RLS de
-- `orders`, `order_items`, `order_payment_intents` e `order_revisions`. O
-- corpo não tinha nenhuma checagem de permissão.
--
-- Medido no DEV em 29/09/2026, com o JWT de um usuário interno DESATIVADO,
-- para quem o RLS devolve zero linhas de `orders`:
--
--   select count(*) from orders             →  0
--   fila_de_pedidos(true)                   →  16 pedidos, com nome do
--                                              cliente, total e forma de
--                                              pagamento
--
-- Qualquer sessão `authenticated` tinha o mesmo alcance: funcionário
-- desligado com sessão ainda válida, papel customizado sem `orders.view`.
-- `anon` nunca teve EXECUTE (revogado desde a 0050), e a produção ainda não
-- tem contas nem pedidos: não houve exposição de dado real.
--
-- A CORREÇÃO, E POR QUE NÃO É SÓ VOLTAR A INVOKER. As quatro policies de
-- leitura dessas tabelas são `has_permission('orders.view')`, avaliada LINHA A
-- LINHA. Na fila de encerrados, que cresce para sempre, isso seria milhares
-- de avaliações por chamada, e foi esse custo por linha que a 0108 atacou. A
-- função continua DEFINER, e a MESMA regra das policies entra no corpo como
-- `(select public.has_permission('orders.view'))`: um InitPlan, avaliado uma
-- vez por chamada. A regra de acesso fica idêntica à das policies e o
-- desempenho da 0108 é mantido.
--
-- `has_permission` lê o ator do JWT da requisição (`auth.uid()`), e não do
-- papel de banco em execução. Por isso continua respondendo pelo usuário real
-- dentro de uma função DEFINER.
--
-- O corpo é o da 0108 byte a byte, com uma linha a mais no WHERE.
create or replace function public.fila_de_pedidos(p_encerrados boolean default false)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(f order by f.criado_em desc), '[]'::jsonb)
  from (
    select
      o.id, o.order_number as numero, o.status, o.fulfillment_type as modalidade,
      o.source as origem,
      o.customer_name_snapshot as cliente,
      o.subtotal, o.delivery_fee as taxa_entrega, o.total,
      o.created_at as criado_em, o.accepted_at as aceito_em,
      o.estimated_min_minutes as estimativa_min,
      o.estimated_max_minutes as estimativa_max,
      o.general_note as observacao,
      o.delivery_route_distance_km as distancia_km,
      (select count(*) from public.order_items i where i.order_id = o.id) as itens,
      pi.payment_method_name_snapshot as forma_pagamento,
      pi.expected_change_amount as troco,
      (pi.pix_confirmation_status = 'pending') as aguarda_pix,
      (o.delivery_approval_status = 'pending') as aguarda_aprovacao_entrega,
      exists (select 1 from public.order_revisions r
               where r.order_id = o.id and r.status = 'pending_customer') as aguarda_cliente,
      (o.status in ('completed', 'rejected', 'cancelled')) as encerrado,
      -- Estado terminal não tem transição de saída: a lista de ações é
      -- necessariamente vazia, e descobrir isso linha a linha custava ~5 ms
      -- por pedido numa fila que só cresce.
      case
        when o.status in ('completed', 'rejected', 'cancelled') then '[]'::jsonb
        else public.acoes_do_pedido(o.id)
      end as acoes
    from public.orders o
    left join public.order_payment_intents pi on pi.order_id = o.id
    where (o.status in ('completed', 'rejected', 'cancelled')) = p_encerrados
      -- A mesma regra das policies de leitura de pedido, uma vez por chamada.
      and (select public.has_permission('orders.view'))
  ) f;
$$;
comment on function public.fila_de_pedidos is
  'Fila da central. DEFINER com a guarda das policies: sem orders.view devolve []. Encerrado nao recalcula acoes (0108, 0131).';

-- Os grants não mudam com `create or replace`; reafirmados para o arquivo
-- dizer sozinho quem executa.
revoke all on function public.fila_de_pedidos(boolean) from public, anon;
grant execute on function public.fila_de_pedidos(boolean) to authenticated;
