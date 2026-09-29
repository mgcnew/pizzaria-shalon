-- 0132 — a aba Encerrados abre pelo expediente, não pela história inteira
-- 05-PLANO-IMPLEMENTACAO.md §14.5 · CLAUDE.md §39 · D-2026-09-29-93
--
-- O PROBLEMA. `fila_de_pedidos(true)` devolve TODO pedido encerrado desde
-- sempre. A Fase 10 mediu 7.600 encerrados em 592 ms no banco (depois da
-- 0108); a tela ainda manda cada um ao navegador e o desenha duas vezes
-- (tabela e cartões). Com ~40 pedidos por dia, são ~1.200 por mês, e a aba
-- piora todo dia. A 0108 registrou que quantos mostrar era decisão de
-- produto; a decisão veio em 29/09/2026.
--
-- A REGRA DECIDIDA:
--
--   - com caixa aberto, a aba mostra os encerrados FEITOS desde a abertura
--     do caixa: o expediente de verdade, que atravessa a meia-noite
--     (CLAUDE.md §25: a meia-noite não fecha, não cria nem troca caixa);
--   - sem caixa aberto, mostra os do dia de calendário no fuso da loja;
--   - "Carregar dias anteriores" recua a janela 7 dias por vez, sempre até o
--     começo de um dia de calendário. A janela nunca encolhe: com um caixa
--     esquecido aberto há dez dias, recuar 7 não corta a abertura.
--
-- O critério é `created_at`, o mesmo da ordenação da lista, e é o que o
-- índice `orders_status_criado (status, created_at desc)` já atende.
--
-- A ABERTURA DO CAIXA ATRAVESSA O RLS DE `cash_sessions` (que pede
-- `cash.view`), porque a função é DEFINER. Sai daqui só o instante da
-- abertura, que decide a janela, e nenhum valor. É o mesmo "caixa aberto"
-- que a tela de Pedidos já mostra a quem opera o balcão.
--
-- PERMISSÃO: a mesma guarda da 0131. Sem `orders.view` a lista vem vazia e
-- `ha_mais` é falso, pelo mesmo InitPlan de uma avaliação por chamada.
--
-- `fila_de_pedidos(true)` continua existindo e protegida (0131); a
-- aplicação deixa de chamá-la para a aba Encerrados.
create or replace function public.pedidos_encerrados(p_dias_anteriores integer default 0)
returns jsonb language sql stable security definer set search_path = ''
as $$
  with parametros as (
    -- Fora do intervalo não é erro de operador, é URL editada: satura.
    select greatest(0, least(coalesce(p_dias_anteriores, 0), 3650)) as dias,
           public.fuso_da_loja() as fuso,
           public.dia_da_loja(now()) as hoje,
           (select min(s.opened_at) from public.cash_sessions s where s.status = 'open')
             as caixa_aberto_em,
           (select public.has_permission('orders.view')) as pode
  ),
  janela as (
    select
      p.pode,
      p.caixa_aberto_em is not null and p.dias = 0 as pelo_caixa,
      least(
        coalesce(p.caixa_aberto_em, (p.hoje::timestamp at time zone p.fuso)),
        ((p.hoje - p.dias)::timestamp at time zone p.fuso)
      ) as desde,
      p.dias
    from parametros p
  )
  select jsonb_build_object(
    'desde', j.desde,
    'origem', case when j.pelo_caixa then 'caixa' else 'dia' end,
    'dias_anteriores', j.dias,
    'ha_mais', j.pode and exists (
      select 1 from public.orders o
       where o.status in ('completed', 'rejected', 'cancelled')
         and o.created_at < j.desde),
    'pedidos', coalesce((
      select jsonb_agg(f order by f.criado_em desc)
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
          true as encerrado,
          -- Estado terminal não tem transição de saída (0108).
          '[]'::jsonb as acoes
        from public.orders o
        left join public.order_payment_intents pi on pi.order_id = o.id
        where o.status in ('completed', 'rejected', 'cancelled')
          and o.created_at >= j.desde
          and j.pode
      ) f
    ), '[]'::jsonb)
  )
  from janela j;
$$;
comment on function public.pedidos_encerrados is
  'Aba Encerrados: desde a abertura do caixa (ou o dia de calendario), recuando por dias. DEFINER com a guarda de orders.view (0131, 0132).';

revoke all on function public.pedidos_encerrados(integer) from public, anon;
grant execute on function public.pedidos_encerrados(integer) to authenticated;
