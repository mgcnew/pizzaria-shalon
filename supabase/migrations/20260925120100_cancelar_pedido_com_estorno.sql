-- =============================================================================
-- CANCELAMENTO COM ESTORNO, EM UMA TRANSAÇÃO — Fase 12 (PDV), Etapa 1
--
-- 04-REGRAS-NEGOCIO.md RN-CAIXA-019 · 09-PDV-FRENTE-DE-CAIXA.md §1.5
-- CLAUDE.md §21, §28, §33, §34 · Decisão: D-2026-09-25-78
--
-- ESTA FUNÇÃO NÃO DECIDE NADA. ELA COMPÕE.
--
-- O estorno continua sendo decidido por `reverter_pagamento`. A transição
-- continua sendo decidida por `comando_pedido`, que é a única porta de
-- transição do pedido (CLAUDE.md §21). Aqui só se garante que as duas
-- aconteçam **juntas ou nenhuma**.
--
-- Reescrever qualquer uma das duas dentro daqui criaria uma segunda autoridade
-- sobre dinheiro e sobre estado — e as duas divergiriam algum dia. Por isso
-- esta função tem menos de cem linhas: tudo o que ela sabe fazer é ordenar,
-- conferir e desfazer.
--
-- POR QUE `raise` E NÃO `return`
--
-- `reverter_pagamento` e `comando_pedido` devolvem `ok: false` em vez de
-- lançar exceção. Algumas saídas de falha de `reverter_pagamento` acontecem
-- DENTRO do laço de pagamentos, depois de já ter gravado o estorno de uma
-- linha anterior. Um `return` deixaria isso gravado. Só o `raise` desfaz.
--
-- Sem isso, o estado intermediário possível seria o pior de todos: dinheiro
-- devolvido, pedido ainda vivo na fila.
--
-- O QUE A FUNÇÃO HERDA, E É DESEJÁVEL
--
-- `reverter_pagamento` recusa quando o recebimento foi em dinheiro, a sessão
-- daquele recebimento já fechou e não há caixa aberto agora. Logo, cancelar
-- uma venda em dinheiro com a gaveta fechada é recusado. Tirar dinheiro exige
-- gaveta aberta, e essa regra não é reimplementada aqui: ela vem de graça.
-- =============================================================================

create or replace function public.cancelar_pedido_com_estorno(
  p_order_id uuid,
  p_motivo   text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator    uuid := public.current_app_user_id();
  v_motivo  text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_pedido  record;
  v_estorno jsonb;
  v_cancel  jsonb;
  v_qtd     integer;
  v_total   numeric;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;

  -- AS DUAS PERMISSÕES, e a verificação é explícita aqui mesmo.
  -- As funções compostas também verificam as suas, mas quem chama precisa
  -- saber de antemão que faltou uma — e qual — em vez de descobrir no meio da
  -- transação (RN-RBAC-004: decide a permissão semântica, nunca o cargo).
  if not public.has_permission('orders.cancel') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para cancelar pedidos.');
  end if;
  if not public.has_permission('finance.reverse') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para estornar. Cancelar um pedido pago exige as duas permissões.');
  end if;

  -- Motivo obrigatório, com a mesma régua do estorno avulso.
  if v_motivo is null or length(v_motivo) < 3 then
    return jsonb_build_object('ok', false, 'erro',
      'Informe o motivo do cancelamento com ao menos 3 caracteres.');
  end if;

  -- CLAUDE.md §34: trava a linha ANTES de olhar qualquer coisa. Dois
  -- operadores cancelando o mesmo pedido entram em fila, e o segundo encontra
  -- o estado já mudado em vez de repetir o estorno.
  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  select count(*), coalesce(sum(p.amount), 0) into v_qtd, v_total
    from public.payments p
   where p.order_id = p_order_id and p.status = 'confirmed';

  -- IDEMPOTÊNCIA. Já cancelado não é erro: é o segundo clique, ou o colega que
  -- chegou depois. Só o que ainda falta é feito.
  if v_pedido.status = 'cancelled' then
    if v_qtd = 0 then
      return jsonb_build_object('ok', true, 'ja_cancelado', true,
        'estornadas', 0, 'total', 0::numeric(12,2), 'status', 'cancelled');
    end if;

    -- Cancelado E pago: é exatamente o estado que existia antes da guarda da
    -- migration anterior. Este caminho o CONSERTA — estorna o que ficou para
    -- trás, sem tentar cancelar de novo o que já está cancelado.
    v_estorno := public.reverter_pagamento(p_order_id, v_motivo);
    if coalesce((v_estorno ->> 'ok')::boolean, false) is not true then
      raise exception '%', coalesce(v_estorno ->> 'erro', 'Não foi possível estornar.')
        using errcode = 'P0001', detail = v_estorno::text;
    end if;

    perform public.log_audit('pedido_cancelar_com_estorno', 'orders', p_order_id,
      jsonb_build_object('status', 'cancelled', 'payment_status', v_pedido.payment_status,
                         'total_pago', v_total),
      jsonb_build_object('status', 'cancelled', 'payment_status', 'reversed',
                         'linhas_estornadas', v_qtd, 'reparo_de_estado_anterior', true),
      v_motivo);

    return jsonb_build_object('ok', true, 'ja_cancelado', true,
      'estornadas', v_qtd, 'total', v_total::numeric(12,2), 'status', 'cancelled');
  end if;

  if v_pedido.status = 'rejected' then
    return jsonb_build_object('ok', false, 'erro',
      'Pedido rejeitado não é cancelado. A rejeição já encerrou o pedido.');
  end if;

  -- 1. O ESTORNO, se houver dinheiro. Primeiro, de propósito: se o estorno
  --    não puder acontecer — gaveta fechada, por exemplo — o pedido não é
  --    cancelado, e é isso que se quer. Cancelar sem poder devolver seria
  --    voltar ao furo que esta etapa fecha.
  if v_qtd > 0 then
    v_estorno := public.reverter_pagamento(p_order_id, v_motivo);
    if coalesce((v_estorno ->> 'ok')::boolean, false) is not true then
      raise exception '%', coalesce(v_estorno ->> 'erro', 'Não foi possível estornar o pagamento.')
        using errcode = 'P0001', detail = v_estorno::text;
    end if;
  end if;

  -- 2. O CANCELAMENTO, pela única porta de transição (CLAUDE.md §21).
  --    Depois do estorno não há mais pagamento confirmado, então a guarda da
  --    migration anterior não barra. `comando_pedido` continua conferindo a
  --    aplicabilidade pela mesma regra que a interface consulta, a transição
  --    permitida, o histórico de status e a auditoria própria.
  v_cancel := public.comando_pedido(p_order_id, 'cancelar',
                jsonb_build_object('motivo', v_motivo));

  if coalesce((v_cancel ->> 'ok')::boolean, false) is not true then
    raise exception '%', coalesce(v_cancel ->> 'erro', 'Não foi possível cancelar o pedido.')
      using errcode = 'P0001', detail = v_cancel::text;
  end if;

  -- §33: as duas metades ficam amarradas pelo MESMO motivo, para que a leitura
  -- da auditoria mostre que foram um ato só e não dois eventos soltos.
  perform public.log_audit('pedido_cancelar_com_estorno', 'orders', p_order_id,
    jsonb_build_object('status', v_pedido.status,
                       'payment_status', v_pedido.payment_status,
                       'total_pago', v_total),
    jsonb_build_object('status', 'cancelled',
                       'payment_status', case when v_qtd > 0 then 'reversed'
                                              else v_pedido.payment_status end,
                       'linhas_estornadas', v_qtd),
    v_motivo);

  return jsonb_build_object('ok', true, 'ja_cancelado', false,
    'estornadas', v_qtd, 'total', v_total::numeric(12,2), 'status', 'cancelled');
end;
$$;

comment on function public.cancelar_pedido_com_estorno is
  'RN-CAIXA-019: estorno e cancelamento numa transação. Compõe reverter_pagamento e comando_pedido; não decide por elas.';

-- Mesma postura das demais funções internas: quem autoriza é a permissão
-- verificada no corpo, e `anon` não tem o que fazer aqui.
revoke all on function public.cancelar_pedido_com_estorno(uuid, text) from public, anon;
grant execute on function public.cancelar_pedido_com_estorno(uuid, text) to authenticated;
