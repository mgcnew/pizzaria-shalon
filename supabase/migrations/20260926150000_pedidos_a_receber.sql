-- =============================================================================
-- PEDIDOS A RECEBER — Fase 12 (PDV), Etapa 5
--
-- 09-PDV-FRENTE-DE-CAIXA.md §0.2, §0.3, §1.3, §4.2, §6.1 · Etapa 5 do §13
-- Decisões: D-2026-09-25-78, D-2026-09-26-79 (critério `reversed`),
--           D-2026-09-26-80 (origem × modalidade)
--
-- ESCOPO: listar o que está aguardando dinheiro. NÃO recebe pagamento, não
-- avança produção, não abre caixa, não escreve nada.
--
-- TRÊS COISAS QUE ESTA FUNÇÃO **NÃO** É
--
-- 1. NÃO É UMA SEGUNDA AUTORIDADE SOBRE DINHEIRO. Quem autoriza receber é
--    `registrar_pagamento`, que já recusa `cancelled`/`rejected` e já devolve
--    `ja_pago` quando existe pagamento confirmado. Esta função devolve uma
--    LISTA; nada nela autoriza coisa alguma. Entre a leitura e o recebimento,
--    outro terminal pode pagar ou cancelar — e é o servidor que vai recusar,
--    não esta lista.
--
-- 2. NÃO É UMA FILA NOVA. Nenhuma tabela foi criada. A fonte de verdade é
--    `orders` + `order_payment_intents`, que já têm tudo.
--
-- 3. NÃO É A FILA OPERACIONAL. `fila_de_pedidos` responde "o que a cozinha tem
--    de fazer". Esta responde "de quem a casa tem de cobrar". São os dois eixos
--    do §0.2, e confundi-los é exatamente o que o PDV não pode fazer.
--
-- O CRITÉRIO, E POR QUE `reversed` ENTRA
--
--   payment_status in ('pending','reversed')  and  status not in ('cancelled','rejected')
--
-- A especificação original dizia só `= 'pending'`. `reverter_pagamento` NÃO
-- exige pedido cancelado: pede `finance.reverse`, estorna os pagamentos e faz
-- `orders.payment_status = 'reversed'` sem tocar em `orders.status`. Existe,
-- portanto, dinheiro devolvido com pedido vivo — e ali o cliente continua
-- devendo, porque não há pagamento confirmado.
--
-- Comprovado em transação com rollback antes da decisão: pedido pago, avançado
-- para `in_production`, estornado sem cancelamento, e `registrar_pagamento`
-- devolveu `ok: true`. Com o critério literal, a lista mostraria um conjunto
-- MENOR do que o banco aceita — e um pedido com a pizza no forno e o cliente
-- devendo não apareceria para cobrança (D-2026-09-26-79).
--
-- `reversed` NÃO é devolvido como `pending`: `status_financeiro` traz o valor
-- real, para a tela escrever "Estornado" e não "Pendente".
--
-- O STATUS OPERACIONAL NÃO FILTRA NADA. `aceito`, `em produção` e `pronto`
-- convivem na mesma lista (§4.2). É o que permite receber um pedido que ainda
-- está no forno.
-- =============================================================================

create or replace function public.pedidos_a_receber()
returns table (
  id                 uuid,
  numero             bigint,
  -- §0.3: origem e modalidade são colunas DIFERENTES, devolvidas separadas.
  -- `source='counter'` é origem Balcão; a modalidade continua sendo só
  -- `delivery` ou `pickup`. Não existe modalidade `balcao`.
  origem             text,
  modalidade         text,
  cliente_nome       text,
  cliente_whatsapp   text,
  total              numeric,
  -- Os DOIS EIXOS, em colunas separadas e com nomes que não se confundem.
  status_operacional text,
  status_financeiro  text,
  criado_em          timestamptz,
  idade_minutos      integer,
  -- A forma ESPERADA e o troco, de `order_payment_intents` (§1.3). São o que o
  -- cliente avisou, não o que foi recebido — o §24 exige preservar os dois, e
  -- receber é a Etapa 7.
  forma_esperada     text,
  bandeira_esperada  text,
  valor_esperado     numeric,
  precisa_troco      boolean,
  troco_para         numeric,
  troco_esperado     numeric
) language plpgsql stable security definer set search_path = ''
as $$
begin
  -- §6.1: `payments.register`. Conjunto vazio, e não exceção: isto alimenta uma
  -- lista de tela, e quem não pode receber não deveria ver a aba. Mesma postura
  -- de `buscar_catalogo_pdv`.
  if not public.has_permission('payments.register') then
    return;
  end if;

  return query
  select
    o.id,
    o.order_number,
    o.source,
    o.fulfillment_type,
    -- Snapshot, e não join em `customers`: §16 exige que o histórico do pedido
    -- não mude quando o cadastro do cliente muda. Pedido de balcão sem cliente
    -- identificado devolve NULL, e a tela escreve "Balcão".
    o.customer_name_snapshot,
    o.customer_whatsapp_snapshot,
    o.total,
    o.status,
    o.payment_status,
    o.created_at,
    -- Idade em minutos, calculada no banco: o §4.2 mostra "12 min" e o fuso do
    -- navegador não pode influir nisso.
    floor(extract(epoch from (now() - o.created_at)) / 60)::integer,
    i.payment_method_name_snapshot,
    i.payment_brand_name_snapshot,
    i.amount_expected,
    coalesce(i.needs_change, false),
    i.change_for_amount,
    i.expected_change_amount
  from public.orders o
  -- LEFT JOIN, e é seguro: `order_payment_intents_uma_por_pedido` é UNIQUE em
  -- `order_id`, então no máximo uma intenção por pedido e nenhuma linha se
  -- multiplica. Pedido sem intenção registrada aparece com a forma esperada
  -- nula — o §4.2 mostra isso como "—".
  left join public.order_payment_intents i on i.order_id = o.id
  where o.payment_status in ('pending', 'reversed')
    and o.status not in ('cancelled', 'rejected')
  -- Mais antigo primeiro: quem está esperando há mais tempo é cobrado antes.
  order by o.created_at, o.order_number;
end;
$$;

comment on function public.pedidos_a_receber is
  'Pedidos aguardando dinheiro: payment_status in (pending, reversed) fora de cancelado/rejeitado. Leitura pura, nao autoriza recebimento. payments.register.';

-- ============================================================== PRIVILÉGIOS

-- Consultar de quem a casa tem de cobrar é assunto interno. `anon` não tem o
-- que fazer aqui.
revoke all on function public.pedidos_a_receber() from public, anon;
grant execute on function public.pedidos_a_receber() to authenticated;
