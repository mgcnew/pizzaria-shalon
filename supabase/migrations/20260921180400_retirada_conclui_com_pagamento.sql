-- 0065 — Retirada não conclui sem o pagamento registrado
-- 04-REGRAS-NEGOCIO.md §44 invariante 13 · 01-DOCUMENTO-MESTRE.md §79.18
-- RN-PGTO-002/003 · CLAUDE.md §21, §24
--
-- O invariante 13 manda impedir "conclusão de retirada apenas por ter ficado
-- pronta". Desde a Fase 6 concluir já era um ato próprio — `marcar_pronto` e
-- `concluir` são comandos diferentes. Faltava a outra metade, que 01 §79.18
-- diz com todas as letras: na retirada, o pagamento efetivo é confirmado
-- quando pendente.
--
-- ISTO NÃO É `completed -> receita automática`, que a autorização proíbe. A
-- direção é a inversa: a conclusão DEPENDE de o recebimento já ter sido
-- registrado por alguém. Concluir não cria dinheiro nenhum.
--
-- Só muda a ramificação de `concluir`. O resto da função é a 0057.

create or replace function public.comando_pedido(
  p_order_id uuid, p_comando text, p_dados jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_permissao text;
  v_pedido record;
  v_pix text;
  v_novo text;
  v_motivo text;
  v_revisao_aberta boolean;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;

  v_permissao := public.permissao_do_comando(p_comando);
  if v_permissao is null then
    return jsonb_build_object('ok', false, 'erro', 'Comando desconhecido.');
  end if;

  -- RN-RBAC-004: decide a permissão semântica efetiva, nunca o nome do cargo.
  if not public.has_permission(v_permissao) then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para esta ação.');
  end if;

  -- CLAUDE.md §34: trava a linha. Dois atendentes clicando "aceitar" ao
  -- mesmo tempo viram duas execuções em fila, e a segunda encontra o estado
  -- já mudado — em vez de as duas lerem o estado antigo.
  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  -- A pré-condição do comando, pela MESMA regra que a interface consulta.
  -- É isto que faz o segundo clique encontrar "não se aplica" em vez de um
  -- "pronto" que não aconteceu.
  if not exists (
    select 1 from jsonb_array_elements(public.acoes_do_pedido(p_order_id)) a
    where a ->> 'comando' = p_comando
  ) then
    return jsonb_build_object('ok', false,
      'erro', 'Esta ação não se aplica ao pedido neste momento.',
      'status', v_pedido.status);
  end if;

  select pi.pix_confirmation_status into v_pix
    from public.order_payment_intents pi where pi.order_id = p_order_id;

  select exists (select 1 from public.order_revisions r
                  where r.order_id = p_order_id and r.status = 'pending_customer')
    into v_revisao_aberta;

  v_motivo := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');

  -- ------------------------------------------------------------ comandos
  if p_comando = 'confirmar_pix' then
    -- CLAUDE.md §23: selecionar Pix não é pagar. Alguém confirma, e fica
    -- registrado quem e quando.
    if v_pix is distinct from 'pending' then
      return jsonb_build_object('ok', false, 'erro', 'Este pedido não está aguardando Pix.');
    end if;

    update public.order_payment_intents
       set pix_confirmation_status = 'confirmed',
           pix_confirmed_by = v_ator, pix_confirmed_at = now()
     where order_id = p_order_id;

    v_novo := case
      when v_pedido.delivery_approval_status = 'pending' then 'waiting_delivery_approval'
      else 'waiting_store_confirmation' end;

  elsif p_comando = 'aprovar_entrega' then
    if v_pedido.delivery_approval_status is distinct from 'pending' then
      return jsonb_build_object('ok', false, 'erro', 'Este pedido não aguarda aprovação de entrega.');
    end if;

    update public.orders
       set delivery_approval_status = 'approved',
           delivery_approval_decided_by = v_ator, delivery_approval_decided_at = now()
     where id = p_order_id;

    -- Se o Pix ainda bloqueia, o status não anda: só a dimensão da entrega
    -- foi resolvida (D-2026-09-19-37).
    v_novo := case
      when v_pedido.status = 'waiting_delivery_approval' then 'waiting_store_confirmation'
      else v_pedido.status end;

  elsif p_comando = 'rejeitar_entrega' then
    if v_motivo is null then
      return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da recusa.');
    end if;

    update public.orders
       set delivery_approval_status = 'rejected',
           delivery_approval_decided_by = v_ator, delivery_approval_decided_at = now(),
           rejection_reason = v_motivo
     where id = p_order_id;
    v_novo := 'rejected';

  elsif p_comando = 'aceitar' then
    -- RN-STATE-003: só com todas as pré-condições resolvidas. Cada bloqueio
    -- é dito por nome, para a operação saber o que resolver.
    if v_pix = 'pending' then
      return jsonb_build_object('ok', false, 'bloqueio', 'pix',
        'erro', 'O Pix ainda não foi confirmado.');
    end if;
    if v_pedido.delivery_approval_status = 'pending' then
      return jsonb_build_object('ok', false, 'bloqueio', 'entrega',
        'erro', 'A entrega ainda não foi aprovada.');
    end if;
    if v_revisao_aberta then
      return jsonb_build_object('ok', false, 'bloqueio', 'alteracao',
        'erro', 'Há uma alteração aguardando resposta do cliente.');
    end if;
    v_novo := 'confirmed';

  elsif p_comando = 'iniciar_producao' then
    v_novo := 'in_production';

  elsif p_comando = 'marcar_pronto' then
    -- RN-STATE-005/006: "pronto" tem dois significados, conforme a modalidade.
    v_novo := case when v_pedido.fulfillment_type = 'delivery'
                   then 'ready_for_delivery' else 'ready_for_pickup' end;

  elsif p_comando = 'despachar' then
    v_novo := 'out_for_delivery';

  elsif p_comando = 'concluir' then
    -- Invariante 13 de 04 §44: o sistema deve impedir "conclusão de retirada
    -- apenas por ter ficado pronta". E 01 §79.18 diz o que falta: "Na
    -- retirada, confirmar pagamento efetivo quando pendente."
    --
    -- Então a retirada só conclui com o recebimento registrado. Não é o
    -- acoplamento proibido `completed -> receita automática`: é o contrário
    -- — a receita precisa ter sido registrada ANTES, por ato de alguém, para
    -- que a conclusão seja possível.
    --
    -- A ENTREGA NÃO É BARRADA, e isso é deliberado. 01 §79.18 põe a
    -- confirmação do pagamento da entrega no RETORNO do motoboy, que é
    -- prestação de contas da Fase 8. Barrar aqui inventaria uma regra que os
    -- documentos não têm, e o fechamento continua honesto de outro jeito:
    -- dinheiro que não entrou na gaveta não é contado como caixa físico
    -- (RN-CAIXA-014) e aparece destacado no fechamento (RN-CAIXA-013).
    if v_pedido.fulfillment_type = 'pickup'
       and v_pedido.payment_status is distinct from 'confirmed' then
      return jsonb_build_object('ok', false, 'bloqueio', 'pagamento',
        'erro', 'Registre o pagamento recebido antes de concluir a retirada.');
    end if;
    v_novo := 'completed';

  elsif p_comando = 'registrar_falha_entrega' then
    if v_motivo is null then
      return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da falha na entrega.');
    end if;
    v_novo := 'delivery_failed';

  elsif p_comando = 'rejeitar' then
    -- RN-STATE-009: rejeição é antes do aceite e exige motivo.
    if v_motivo is null then
      return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da rejeição.');
    end if;
    update public.orders set rejection_reason = v_motivo where id = p_order_id;
    v_novo := 'rejected';

  elsif p_comando = 'cancelar' then
    -- RN-STATE-010: cancelamento é distinto de rejeição e NUNCA apaga nada.
    if v_motivo is null then
      return jsonb_build_object('ok', false, 'erro', 'Informe o motivo do cancelamento.');
    end if;
    update public.orders
       set cancellation_reason = v_motivo, cancelled_by = v_ator, cancelled_at = now()
     where id = p_order_id;
    v_novo := 'cancelled';
  end if;

  -- ----------------------------------------------------------- transição
  if v_novo is distinct from v_pedido.status then
    if not public.transicao_permitida(v_pedido.status, v_novo) then
      return jsonb_build_object('ok', false, 'erro',
        format('Não é possível ir de "%s" para "%s".', v_pedido.status, v_novo),
        'de', v_pedido.status, 'para', v_novo);
    end if;

    update public.orders
       set status = v_novo,
           accepted_by  = case when v_novo = 'confirmed' then v_ator else accepted_by end,
           accepted_at  = case when v_novo = 'confirmed' then now() else accepted_at end,
           ready_at     = case when v_novo in ('ready_for_pickup','ready_for_delivery')
                               then now() else ready_at end,
           completed_at = case when v_novo = 'completed' then now() else completed_at end
     where id = p_order_id;

    insert into public.order_status_history
      (order_id, from_status, to_status, actor_type, actor_user_id, reason)
    values (p_order_id, v_pedido.status, v_novo, 'user', v_ator, v_motivo);
  end if;

  -- §33: ator, momento, ação, entidade, antes, depois e motivo.
  perform public.log_audit(
    'pedido_' || p_comando, 'orders', p_order_id,
    jsonb_build_object('status', v_pedido.status,
                       'delivery_approval_status', v_pedido.delivery_approval_status,
                       'pix', v_pix),
    jsonb_build_object('status', coalesce(v_novo, v_pedido.status)),
    v_motivo);

  return jsonb_build_object('ok', true, 'status', coalesce(v_novo, v_pedido.status));
end;
$$;

comment on function public.comando_pedido is 'CLAUDE.md §21: a única porta de transição. Retirada só conclui com pagamento registrado (04 §44, invariante 13).';
