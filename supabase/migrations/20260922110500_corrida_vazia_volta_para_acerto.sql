-- 0085 — A corrida que ficou sem entrega pendente volta para o acerto
-- RN-RUN-003/008 · CLAUDE.md §26
--
-- O CASO QUE FALTAVA: João saiu com UMA entrega, a moto quebrou, e ele
-- transferiu justamente aquela. A corrida dele ficava em `out` para sempre —
-- sem nada para conferir, e portanto sem nunca chegar a `settling`. Como o
-- acerto só aceita `settling`, o dinheiro que ele porventura já tivesse
-- recebido ficava preso na rua, sem porta de entrada para a gaveta.
--
-- Quando a transferência esvazia a corrida de origem, ela passa a "voltou —
-- a acertar", que é exatamente o que aconteceu: não há mais o que entregar, e
-- ele tem contas a prestar. É a mesma transição que `registrar_retorno` faz
-- quando o último pedido é conferido.

create or replace function public.transferir_entrega(p_vinculo_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_vinculo record;
  v_origem record;
  v_pedido record;
  v_destino record;
  v_run record;
  v_run_id uuid;
  v_novo uuid;
  v_id uuid;
  v_carimbados integer := 0;
  v_pendentes integer;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('deliveries.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para gerenciar entregas.');
  end if;
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'erro',
      'Informe o motivo da transferência.');
  end if;

  select * into v_vinculo from public.driver_run_orders o
    where o.id = p_vinculo_id for update;
  if v_vinculo.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Entrega não encontrada.');
  end if;

  if v_vinculo.delivery_status <> 'pending' then
    return jsonb_build_object('ok', false, 'ja_conferida', true,
      'situacao', v_vinculo.delivery_status,
      'erro', case v_vinculo.delivery_status
                when 'delivered' then 'Esta entrega já foi concluída e não pode ser transferida.'
                when 'failed'    then 'Esta entrega já foi registrada como não realizada.'
                else 'Esta entrega não está mais ativa nesta corrida.' end);
  end if;

  select * into v_origem from public.driver_runs r
    where r.id = v_vinculo.driver_run_id for update;

  if v_origem.status <> 'out' then
    return jsonb_build_object('ok', false, 'nao_esta_em_rota', true,
      'status', v_origem.status,
      'erro', 'Esta corrida ainda não saiu. Para trocar o motoboy antes da saída, use a atribuição.');
  end if;

  select * into v_pedido from public.orders d where d.id = v_vinculo.order_id for update;
  if v_pedido.status <> 'out_for_delivery' then
    return jsonb_build_object('ok', false, 'erro',
      'Só pedido em rota pode ser transferido.', 'status', v_pedido.status);
  end if;

  if exists (select 1 from public.payments p
              where p.order_id = v_pedido.id and p.status = 'confirmed'
                and p.cash_session_id is not null) then
    return jsonb_build_object('ok', false, 'ja_conciliado', true, 'erro',
      'O dinheiro deste pedido já entrou no caixa. Ele não pode ser transferido.');
  end if;

  select * into v_destino from public.employees e
    where e.id = nullif(p_dados ->> 'motoboy_id', '')::uuid;
  if v_destino.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Motoboy não encontrado.');
  end if;
  if not v_destino.is_driver then
    return jsonb_build_object('ok', false, 'erro',
      format('%s não está cadastrado como entregador.', v_destino.full_name));
  end if;
  if v_destino.employment_status <> 'active' then
    return jsonb_build_object('ok', false, 'erro',
      format('%s não está ativo e não pode assumir entregas.', v_destino.full_name));
  end if;
  if v_destino.id = v_origem.driver_employee_id then
    return jsonb_build_object('ok', false, 'erro',
      'O pedido já está com esse motoboy.');
  end if;

  select * into v_run from public.driver_runs r
    where r.driver_employee_id = v_destino.id and r.status in ('open', 'out')
    order by r.created_at desc limit 1 for update;

  if v_run.id is null then
    insert into public.driver_runs (driver_employee_id, status, departed_at, created_by)
    values (v_destino.id, 'out', now(), v_ator)
    returning id into v_run_id;
  else
    v_run_id := v_run.id;
  end if;

  -- RN-RUN-009: o que ele JÁ RECEBEU continua sendo dele para prestar contas.
  update public.payments p
     set responsible_driver_run_id = v_origem.id
   where p.order_id = v_pedido.id
     and p.status = 'confirmed'
     and p.payment_method_family_snapshot = 'cash'
     and p.cash_session_id is null
     and p.responsible_driver_run_id is null;
  get diagnostics v_carimbados = row_count;

  update public.driver_run_orders
     set delivery_status = 'transferred'
   where id = p_vinculo_id;

  insert into public.driver_run_orders (driver_run_id, order_id, assigned_by)
  values (v_run_id, v_pedido.id, v_ator)
  returning id into v_novo;

  insert into public.delivery_transfers (
    order_id, from_run_id, from_link_id, from_employee_id,
    to_run_id, to_link_id, to_employee_id,
    reason, notes, transferred_by)
  values (
    v_pedido.id, v_origem.id, p_vinculo_id, v_origem.driver_employee_id,
    v_run_id, v_novo, v_destino.id,
    v_motivo, nullif(btrim(coalesce(p_dados ->> 'observacao', '')), ''), v_ator)
  returning id into v_id;

  -- A CORRIDA DE ORIGEM PODE TER FICADO VAZIA. Sem isto ela fica em `out`
  -- para sempre e o dinheiro que ele tem na mão nunca acha a porta do caixa.
  select count(*) into v_pendentes from public.driver_run_orders o
   where o.driver_run_id = v_origem.id and o.delivery_status = 'pending';

  if v_pendentes = 0 then
    update public.driver_runs set status = 'settling', returned_at = now()
     where id = v_origem.id;
  end if;

  perform public.log_audit('entrega_transferir', 'orders', v_pedido.id,
    jsonb_build_object('corrida', v_origem.id, 'motoboy', v_origem.driver_employee_id),
    jsonb_build_object('corrida', v_run_id, 'motoboy', v_destino.id,
                       'pagamentos_carimbados', v_carimbados,
                       'origem_voltou', v_pendentes = 0),
    v_motivo);

  return jsonb_build_object('ok', true, 'transferencia_id', v_id,
    'corrida_destino', v_run_id, 'vinculo_destino', v_novo,
    'dinheiro_permanece_com_o_anterior', v_carimbados > 0,
    -- A corrida de quem transferiu ficou sem nada e já espera acerto.
    'origem_voltou', v_pendentes = 0);
end;
$$;

comment on function public.transferir_entrega is
  'RN-RUN-008/009: transfere a responsabilidade por UMA entrega em rota. Não move dinheiro. Esvaziar a corrida de origem a manda para o acerto.';

revoke all on function public.transferir_entrega(uuid, jsonb) from public, anon;
grant execute on function public.transferir_entrega(uuid, jsonb) to authenticated;
