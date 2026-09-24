-- 0108 — a fila de encerrados para de calcular ações que não existem
-- 05-PLANO-IMPLEMENTACAO.md §15 · CLAUDE.md §39
--
-- GARGALO MEDIDO NA FASE 10, com massa descartável de 8.000 pedidos:
--
--   fila_de_pedidos(false)  ~400 abertos     →   2.053 ms
--   fila_de_pedidos(true) ~7.600 encerrados  →  38.689 ms
--
-- Custo rigorosamente linear: ~5,1 ms POR PEDIDO nas duas. E a fila de
-- encerrados cresce para sempre — todo pedido concluído fica nela. 7.600
-- pedidos são cerca de seis meses a 40 por dia; um ano dobra o tempo.
-- Isto não é cenário sintético, é o crescimento natural da operação.
--
-- A CAUSA: `public.acoes_do_pedido(o.id)` é chamada UMA VEZ POR LINHA. Ela
-- consulta `order_commands`, as transições e a permissão do ator para decidir
-- o que se pode fazer com aquele pedido.
--
-- POR QUE A CORREÇÃO NÃO MUDA COMPORTAMENTO. Pedido encerrado não tem ação
-- aplicável, e isso é fato do modelo, não suposição:
--
--   select count(*) from order_status_transitions
--    where from_status in ('completed','cancelled','rejected')   →  0
--
--   acoes_do_pedido() para completed / cancelled / rejected      →  0, 0, 0
--
-- Estado terminal não tem para onde ir, logo não tem comando aplicável. A
-- função devolvia `[]` depois de trabalhar para descobrir isso. Agora o
-- `[]` sai direto, e `acoes_do_pedido` continua sendo chamada exatamente
-- como antes para todo pedido que AINDA está vivo.
--
-- O QUE ESTA MIGRATION NÃO FAZ: não pagina e não limita a fila. Quantos
-- pedidos encerrados a tela deve mostrar, e com que navegação, é decisão de
-- produto — não de hardening. O custo por linha da fila ABERTA (~5 ms)
-- também continua, porque ali a ação é necessária de verdade; com as dezenas
-- de pedidos abertos de uma operação real isso é irrelevante, e com centenas
-- não é. Ficam registrados como observação, não como correção silenciosa.

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
  ) f;
$$;

comment on function public.fila_de_pedidos is
  'Fila da central. Pedido encerrado nao recalcula acoes: estado terminal nao tem transicao de saida (0108).';
