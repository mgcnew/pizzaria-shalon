-- Venda rápida do PDV: cria, recebe e encerra numa única transação.
--
-- Um item pronto continua registrado em orders/payments para auditoria,
-- relatórios e fechamento, mas não permanece na fila operacional. Se qualquer
-- item exigir produção, toda a operação é recusada: esse carrinho pertence ao
-- fluxo de Pedidos e deve acompanhar a produção.

create or replace function public.finalizar_venda_rapida_pdv(
  p_pedido jsonb,
  p_pagamento jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_criacao jsonb;
  v_recebimento jsonb;
  v_transicao jsonb;
  v_pedido record;
  v_pagamento record;
  v_erro text;
begin
  if public.current_app_user_id() is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;

  if not public.has_permission('orders.create_manual')
     or not public.has_permission('payments.register')
     or not public.has_permission('orders.accept') then
    return jsonb_build_object('ok', false,
      'erro', 'Você não tem permissão para concluir vendas no PDV.');
  end if;

  if not exists (select 1 from public.cash_sessions s where s.status = 'open') then
    return jsonb_build_object('ok', false, 'sem_caixa', true,
      'erro', 'Abra o caixa antes de concluir a venda.');
  end if;

  -- A RPC é pública para `authenticated`, portanto o contrato do PDV também
  -- é protegido aqui. Não basta a action montar estes campos corretamente.
  if p_pedido ->> 'origem' is distinct from 'counter'
     or p_pedido ->> 'modalidade' is distinct from 'pickup'
     or coalesce(jsonb_typeof(p_pedido -> 'endereco'), 'null') <> 'null'
     or p_pedido -> 'pagamento' ->> 'forma_id'
        is distinct from p_pagamento ->> 'forma_id' then
    return jsonb_build_object('ok', false,
      'erro', 'A venda rápida aceita somente balcão, retirada e pagamento no PDV.');
  end if;

  -- O bloco cria uma subtransação. Qualquer recusa levanta uma exceção local;
  -- o handler devolve uma mensagem, mas todas as escritas deste bloco voltam.
  begin
    v_criacao := public.criar_pedido(p_pedido, '');
    if not coalesce((v_criacao ->> 'ok')::boolean, false) then
      v_erro := coalesce(v_criacao ->> 'erro', 'Não foi possível criar a venda.');
      raise exception 'venda_rapida_recusada';
    end if;

    select * into v_pedido
      from public.orders o
     where o.id = (v_criacao ->> 'pedido_id')::uuid
     for update;

    -- Reenvio da mesma tentativa depois da resposta ter se perdido.
    if coalesce((v_criacao ->> 'ja_existia')::boolean, false) then
      if v_pedido.status = 'completed'
         and v_pedido.payment_status = 'confirmed'
         and not coalesce(v_pedido.requires_production, true) then
        select p.payment_method_name_snapshot as forma,
               p.tendered_amount as recebido,
               p.change_amount as troco
          into v_pagamento
          from public.payments p
         where p.order_id = v_pedido.id and p.status = 'confirmed'
         order by p.received_at desc limit 1;

        return jsonb_build_object(
          'ok', true, 'ja_existia', true,
          'pedido_id', v_pedido.id, 'numero', v_pedido.order_number,
          'total', v_pedido.total, 'forma', v_pagamento.forma,
          'recebido', v_pagamento.recebido, 'troco', v_pagamento.troco);
      end if;

      v_erro := 'Esta tentativa já existe, mas não é uma venda rápida concluída.';
      raise exception 'venda_rapida_recusada';
    end if;

    if coalesce(v_pedido.requires_production, true) then
      v_erro := 'Esta venda contém item que exige produção. Envie o carrinho para Pedidos.';
      raise exception 'venda_rapida_recusada';
    end if;

    v_recebimento := public.registrar_pagamento(
      v_pedido.id,
      jsonb_build_object(
        'idempotency_key', p_pedido ->> 'idempotency_key',
        'linhas', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'forma_id', p_pagamento ->> 'forma_id',
          'bandeira_id', p_pagamento ->> 'bandeira_id',
          'valor', v_pedido.total,
          'recebido', p_pagamento ->> 'recebido',
          'na_gaveta', true))))) ;

    if not coalesce((v_recebimento ->> 'ok')::boolean, false) then
      v_erro := coalesce(v_recebimento ->> 'erro', 'Não foi possível registrar o pagamento.');
      raise exception 'venda_rapida_recusada';
    end if;

    -- No balcão, escolher Pix significa que ele já foi conferido e recebido.
    -- A intenção criada por criar_pedido não pode manter a venda bloqueada.
    if v_pedido.status = 'waiting_pix_confirmation' then
      update public.order_payment_intents
         set pix_confirmation_status = 'confirmed',
             pix_confirmed_by = public.current_app_user_id(),
             pix_confirmed_at = now()
       where order_id = v_pedido.id;

      update public.orders
         set status = 'confirmed',
             accepted_by = public.current_app_user_id(),
             accepted_at = now()
       where id = v_pedido.id;

      insert into public.order_status_history
        (order_id, from_status, to_status, actor_type, actor_user_id, reason)
      values (v_pedido.id, v_pedido.status, 'confirmed', 'user',
              public.current_app_user_id(), 'Pix recebido na venda rápida do PDV');

      perform public.log_audit(
        'pix_confirmar_pdv', 'orders', v_pedido.id,
        jsonb_build_object('status', v_pedido.status, 'pix', 'pending'),
        jsonb_build_object('status', 'confirmed', 'pix', 'confirmed'),
        'Pix recebido na venda rápida do PDV');
    end if;

    v_transicao := public.comando_pedido(v_pedido.id, 'marcar_pronto', '{}'::jsonb);
    if not coalesce((v_transicao ->> 'ok')::boolean, false) then
      v_erro := coalesce(v_transicao ->> 'erro', 'Não foi possível encerrar a venda.');
      raise exception 'venda_rapida_recusada';
    end if;

    v_transicao := public.comando_pedido(v_pedido.id, 'concluir', '{}'::jsonb);
    if not coalesce((v_transicao ->> 'ok')::boolean, false) then
      v_erro := coalesce(v_transicao ->> 'erro', 'Não foi possível concluir a venda.');
      raise exception 'venda_rapida_recusada';
    end if;

    select p.payment_method_name_snapshot as forma,
           p.tendered_amount as recebido,
           p.change_amount as troco
      into v_pagamento
      from public.payments p
     where p.order_id = v_pedido.id and p.status = 'confirmed'
     order by p.received_at desc limit 1;

    return jsonb_build_object(
      'ok', true, 'ja_existia', false,
      'pedido_id', v_pedido.id, 'numero', v_pedido.order_number,
      'total', v_pedido.total, 'forma', v_pagamento.forma,
      'recebido', v_pagamento.recebido, 'troco', v_pagamento.troco);
  exception when others then
    return jsonb_build_object('ok', false,
      'erro', coalesce(v_erro, 'Não foi possível concluir a venda agora.'));
  end;
end;
$$;

revoke all on function public.finalizar_venda_rapida_pdv(jsonb, jsonb) from public, anon;
grant execute on function public.finalizar_venda_rapida_pdv(jsonb, jsonb) to authenticated;

comment on function public.finalizar_venda_rapida_pdv is
  'Venda sem produção: criação, pagamento e conclusão atômicos no PDV.';
