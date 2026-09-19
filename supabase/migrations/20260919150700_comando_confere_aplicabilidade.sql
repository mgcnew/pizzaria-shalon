-- 0057 — o comando passa a conferir se ele se APLICA ao pedido
--
-- O DEFEITO, encontrado pelo teste de clique duplo.
--
-- `comando_pedido` validava a transição comparando o status calculado com o
-- atual. Quando os dois eram iguais, o bloco de transição era pulado — e a
-- função devolvia `ok: true` sem fazer nada.
--
-- Na prática: aceitar um pedido JÁ aceito respondia "aceito". Concluir um
-- pedido JÁ concluído respondia "concluído". Nada era corrompido, mas a
-- operação recebia confirmação de um ato que não aconteceu, e a auditoria
-- ganhava um registro de algo que não mudou nada.
--
-- Não bastava proibir status igual: `aprovar_entrega` legitimamente mantém o
-- status quando o Pix ainda bloqueia (D-2026-09-19-37). O que faltava era
-- verificar a PRÉ-CONDIÇÃO de cada comando — e essa verificação já existia,
-- em `acoes_do_pedido`, usada pela interface para decidir os botões.
--
-- Agora as duas usam a mesma fonte: se a ação não aparece em
-- `acoes_do_pedido`, o comando não executa. A interface e o servidor
-- deixam de poder divergir.
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

comment on function public.comando_pedido is 'CLAUDE.md §21: a única porta de transição. Permissão, aplicabilidade, pré-condição, histórico e auditoria.';

-- A proposta de alteração passa a dizer o que realmente está no caminho.
-- Antes, a segunda proposta batia primeiro no teste de status — e o
-- operador lia "não pode ser alterado" quando o problema era outro:
-- existe uma proposta aguardando o cliente.
create or replace function public.propor_alteracao(p_order_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_pedido record;
  v_motivo text;
  v_item jsonb;
  v_res jsonb;
  v_depois jsonb := '[]'::jsonb;
  v_antes jsonb;
  v_subtotal numeric := 0;
  v_total numeric;
  v_exige boolean;
  v_numero integer;
  v_revisao uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('orders.request_change') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para alterar pedidos.');
  end if;

  v_motivo := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da alteração.');
  end if;

  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  if exists (select 1 from public.order_revisions r
              where r.order_id = p_order_id and r.status = 'pending_customer') then
    return jsonb_build_object('ok', false, 'erro',
      'Já existe uma alteração aguardando resposta do cliente.');
  end if;

  -- Alterar pedido já pronto, despachado, concluído, rejeitado ou cancelado
  -- não é alteração: é outra coisa, e a V1 não a tem.
  if v_pedido.status not in ('waiting_store_confirmation', 'confirmed') then
    return jsonb_build_object('ok', false, 'erro',
      'Este pedido não está em um momento em que possa ser alterado.');
  end if;

  if jsonb_typeof(p_dados -> 'itens') <> 'array'
     or jsonb_array_length(p_dados -> 'itens') = 0 then
    return jsonb_build_object('ok', false, 'erro', 'A alteração precisa ter pelo menos um item.');
  end if;

  -- CLAUDE.md §16: os itens propostos são REPRECIFICADOS pelo servidor, com
  -- a mesma `montar_item` do cardápio e do carrinho.
  for v_item in select * from jsonb_array_elements(p_dados -> 'itens') loop
    v_res := public.montar_item(v_item);
    if not (v_res ->> 'ok')::boolean then
      return jsonb_build_object('ok', false,
        'erro', format('%s: %s', coalesce(v_res ->> 'nome', 'Item'), v_res ->> 'erro'));
    end if;
    v_depois := v_depois || jsonb_build_array(
      v_res || jsonb_build_object('observacao', v_item ->> 'observacao'));
    v_subtotal := v_subtotal + (v_res ->> 'total')::numeric;
  end loop;

  v_total := v_subtotal + v_pedido.delivery_fee;

  select coalesce(jsonb_agg(jsonb_build_object(
           'linha', i.line_number, 'nome', i.product_name_snapshot,
           'tamanho', i.size_name_snapshot, 'borda', i.crust_name_snapshot,
           'quantidade', i.quantity, 'preco_unitario', i.unit_price,
           'total', i.line_total, 'observacao', i.observation,
           'sabores', (select jsonb_agg(f.flavor_name_snapshot order by f.sort_order)
                         from public.order_item_flavors f where f.order_item_id = i.id),
           'adicionais', (select jsonb_agg(a.addon_name_snapshot order by a.addon_name_snapshot)
                            from public.order_item_addons a where a.order_item_id = i.id)
         ) order by i.line_number), '[]'::jsonb)
    into v_antes
    from public.order_items i where i.order_id = p_order_id;

  v_exige := v_total <> v_pedido.total
             or v_subtotal <> v_pedido.subtotal
             or jsonb_array_length(v_depois) <> jsonb_array_length(v_antes);

  select coalesce(max(r.revision_number), 0) + 1 into v_numero
    from public.order_revisions r where r.order_id = p_order_id;

  insert into public.order_revisions (
    order_id, revision_number, reason, proposed_by, requires_customer_approval,
    status, status_before, items_before, items_after,
    subtotal_before, total_before, subtotal_after, total_after)
  values (
    p_order_id, v_numero, v_motivo, v_ator, v_exige,
    case when v_exige then 'pending_customer' else 'approved' end,
    v_pedido.status, v_antes, v_depois,
    v_pedido.subtotal, v_pedido.total, v_subtotal, v_total)
  returning id into v_revisao;

  if v_exige then
    update public.orders set status = 'change_requested_waiting_customer' where id = p_order_id;
    insert into public.order_status_history
      (order_id, from_status, to_status, actor_type, actor_user_id, reason)
    values (p_order_id, v_pedido.status, 'change_requested_waiting_customer',
            'user', v_ator, v_motivo);
  else
    perform public.aplicar_revisao(v_revisao);
  end if;

  perform public.log_audit('pedido_propor_alteracao', 'orders', p_order_id,
    jsonb_build_object('subtotal', v_pedido.subtotal, 'total', v_pedido.total, 'itens', v_antes),
    jsonb_build_object('subtotal', v_subtotal, 'total', v_total, 'itens', v_depois),
    v_motivo);

  return jsonb_build_object('ok', true, 'revisao_id', v_revisao,
    'aguarda_cliente', v_exige, 'subtotal', v_subtotal, 'total', v_total);
end;
$$;

comment on function public.propor_alteracao is 'RN-ALT: propõe alteração reprecificada pelo servidor. Itens ou total diferentes exigem o cliente.';
