-- 0075 — Operações da entrega: atribuir, despachar, retornar e conciliar
-- 04-REGRAS-NEGOCIO.md RN-RUN-001..007, RN-MOTO-003/004, RN-PGTO-014,
-- RN-CAIXA-014/017 · 03-RLS-RBAC-SEGURANCA.md §19 · CLAUDE.md §21, §33, §34
--
-- A MÁQUINA DE ESTADOS DO PEDIDO CONTINUA SENDO UMA SÓ. Nada aqui grava
-- `orders.status` diretamente: despachar, concluir e registrar falha chamam
-- `comando_pedido`, que é a única porta de transição desde a Fase 6. A
-- corrida tem o estado DELA — montando, na rua, voltou, acertada — e os dois
-- não se confundem.
--
-- O DINHEIRO SÓ ENTRA NA GAVETA NO ACERTO. É a tradução de RN-PGTO-014: o
-- pedido entregue não é valor recebido. Enquanto o motoboy está na rua, o
-- dinheiro dele é recebimento sem sessão (RN-CAIXA-017) e aparece separado no
-- fechamento. `conciliar_corrida` é o único lugar do sistema que transforma
-- esse dinheiro em papel na gaveta.

-- ============================================================ atribuir
-- Abre a corrida do motoboy se ainda não houver uma, e pendura o pedido nela.
-- Trocar de motoboy é chamar de novo com outro: o vínculo anterior vira
-- `reassigned` e permanece (§3 — não sobrescrever silenciosamente).
create or replace function public.atribuir_entrega(p_order_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_pedido record;
  v_motoboy record;
  v_run record;
  v_run_id uuid;
  v_anterior record;
  v_vinculo uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('deliveries.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para gerenciar entregas.');
  end if;

  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  -- Retirada NUNCA entra em corrida. Não é restrição de tela: é o que
  -- separa os dois fluxos de conclusão (RN-STATE-005/006).
  if v_pedido.fulfillment_type <> 'delivery' then
    return jsonb_build_object('ok', false, 'erro',
      'Este pedido é de retirada e não sai para entrega.');
  end if;
  -- Só ANTES de sair. Trocar o motoboy de um pedido que já está na rua é
  -- caso real (moto quebrou, outro vai buscar) que nenhum documento
  -- normativo define — e inventar aqui mudaria o que "saiu para entrega"
  -- significa. Está registrado como lacuna.
  if v_pedido.status <> 'ready_for_delivery' then
    return jsonb_build_object('ok', false, 'erro',
      'Só pedido pronto para entrega pode ser atribuído a um motoboy.',
      'status', v_pedido.status);
  end if;

  -- RN-MOTO-001: motoboy é funcionário, e pode não ter login. O que se exige
  -- é que ele seja entregador e esteja ativo — funcionário desligado não
  -- recebe entrega nova (RN-FUNC-001: ele continua existindo, só não opera).
  select * into v_motoboy from public.employees e
    where e.id = nullif(p_dados ->> 'motoboy_id', '')::uuid;
  if v_motoboy.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Motoboy não encontrado.');
  end if;
  if not v_motoboy.is_driver then
    return jsonb_build_object('ok', false, 'erro',
      format('%s não está cadastrado como entregador.', v_motoboy.full_name));
  end if;
  if v_motoboy.employment_status <> 'active' then
    return jsonb_build_object('ok', false, 'erro',
      format('%s não está ativo e não pode receber entregas.', v_motoboy.full_name));
  end if;

  -- A corrida aberta do motoboy, ou uma nova. Uma por vez: o índice parcial
  -- da 0073 recusa a segunda.
  select * into v_run from public.driver_runs r
    where r.driver_employee_id = v_motoboy.id and r.status in ('open', 'out')
    order by r.created_at desc limit 1 for update;

  if v_run.id is null then
    insert into public.driver_runs (driver_employee_id, created_by)
    values (v_motoboy.id, v_ator)
    returning id into v_run_id;
  else
    v_run_id := v_run.id;
  end if;

  -- Vínculo ativo anterior, se houver: é a troca de motoboy.
  select * into v_anterior from public.driver_run_orders o
    where o.order_id = p_order_id and o.delivery_status = 'pending' for update;

  if v_anterior.id is not null then
    if v_anterior.driver_run_id = v_run_id then
      return jsonb_build_object('ok', false, 'ja_atribuido', true,
        'erro', 'Este pedido já está com esse motoboy.');
    end if;
    update public.driver_run_orders set delivery_status = 'reassigned'
      where id = v_anterior.id;
  end if;

  insert into public.driver_run_orders (driver_run_id, order_id, assigned_by)
  values (v_run_id, p_order_id, v_ator)
  returning id into v_vinculo;

  perform public.log_audit(
    case when v_anterior.id is null then 'entrega_atribuir' else 'entrega_trocar_motoboy' end,
    'orders', p_order_id,
    case when v_anterior.id is null then null
         else jsonb_build_object('corrida_anterior', v_anterior.driver_run_id) end,
    jsonb_build_object('corrida', v_run_id, 'motoboy', v_motoboy.full_name),
    nullif(btrim(coalesce(p_dados ->> 'motivo', '')), ''));

  return jsonb_build_object('ok', true, 'corrida_id', v_run_id,
    'vinculo_id', v_vinculo, 'trocou', v_anterior.id is not null);
end;
$$;

comment on function public.atribuir_entrega is 'RN-RUN-001. Troca de motoboy preserva o vínculo anterior como `reassigned`.';

revoke all on function public.atribuir_entrega(uuid, jsonb) from public, anon;
grant execute on function public.atribuir_entrega(uuid, jsonb) to authenticated;

-- ============================================================ despachar
-- A saída. Cada pedido vai para "Saiu para entrega" pela porta de sempre.
create or replace function public.despachar_corrida(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_run record;
  v_vinculo record;
  v_res jsonb;
  v_saiu integer := 0;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('deliveries.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para gerenciar entregas.');
  end if;

  select * into v_run from public.driver_runs r where r.id = p_run_id for update;
  if v_run.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Corrida não encontrada.');
  end if;
  if v_run.status <> 'open' then
    return jsonb_build_object('ok', false, 'ja_saiu', true,
      'erro', 'Esta corrida já saiu.', 'status', v_run.status);
  end if;

  if not exists (select 1 from public.driver_run_orders o
                  where o.driver_run_id = p_run_id and o.delivery_status = 'pending') then
    return jsonb_build_object('ok', false, 'erro',
      'Não há pedido nesta corrida para despachar.');
  end if;

  -- Confere TODOS antes de mover QUALQUER um: meia corrida na rua e meia na
  -- loja seria pior que não ter saído (CLAUDE.md §34).
  if exists (
    select 1 from public.driver_run_orders o
      join public.orders d on d.id = o.order_id
     where o.driver_run_id = p_run_id and o.delivery_status = 'pending'
       and d.status <> 'ready_for_delivery'
  ) then
    return jsonb_build_object('ok', false, 'erro',
      'Algum pedido desta corrida não está pronto para sair. Confira a fila.');
  end if;

  for v_vinculo in
    select * from public.driver_run_orders o
     where o.driver_run_id = p_run_id and o.delivery_status = 'pending'
  loop
    -- CLAUDE.md §21: a transição é da máquina de estados, não daqui.
    v_res := public.comando_pedido(v_vinculo.order_id, 'despachar');
    if not (v_res ->> 'ok')::boolean then
      -- Falha parcial deixaria metade da corrida na rua e metade na loja.
      raise exception 'Não foi possível despachar o pedido: %', v_res ->> 'erro';
    end if;
    v_saiu := v_saiu + 1;
  end loop;

  update public.driver_runs
     set status = 'out', departed_at = now()
   where id = p_run_id;

  perform public.log_audit('entrega_saida', 'driver_runs', p_run_id,
    jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'out', 'pedidos', v_saiu), null);

  return jsonb_build_object('ok', true, 'pedidos', v_saiu);
end;
$$;

comment on function public.despachar_corrida is 'RN-RUN-002. Chama `comando_pedido` para cada pedido — não grava status.';

revoke all on function public.despachar_corrida(uuid) from public, anon;
grant execute on function public.despachar_corrida(uuid) to authenticated;

-- ============================================================== retorno
-- Conferência pedido a pedido. Quando o último é decidido, a corrida passa
-- sozinha para "voltou" — é estado derivado, não um clique a mais.
create or replace function public.registrar_retorno(p_vinculo_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_vinculo record;
  v_run record;
  v_entregue boolean;
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_res jsonb;
  v_pendentes integer;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('deliveries.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para gerenciar entregas.');
  end if;

  select * into v_vinculo from public.driver_run_orders o where o.id = p_vinculo_id for update;
  if v_vinculo.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Entrega não encontrada.');
  end if;
  if v_vinculo.delivery_status <> 'pending' then
    return jsonb_build_object('ok', false, 'ja_conferida', true,
      'erro', 'Esta entrega já foi conferida.', 'situacao', v_vinculo.delivery_status);
  end if;

  select * into v_run from public.driver_runs r where r.id = v_vinculo.driver_run_id for update;
  if v_run.status <> 'out' then
    return jsonb_build_object('ok', false, 'erro',
      'A corrida precisa estar na rua para registrar retorno.', 'status', v_run.status);
  end if;

  v_entregue := coalesce((p_dados ->> 'entregue')::boolean, true);

  if v_entregue then
    -- RN-PGTO-014: concluir registra que CHEGOU. Não cria recebimento, não
    -- reconhece receita e não põe dinheiro em caixa nenhum.
    v_res := public.comando_pedido(v_vinculo.order_id, 'concluir');
    if not (v_res ->> 'ok')::boolean then
      return jsonb_build_object('ok', false, 'erro', v_res ->> 'erro');
    end if;

    update public.driver_run_orders
       set delivery_status = 'delivered', delivered_at = now()
     where id = p_vinculo_id;
  else
    -- RN-STATE-008: falha exige motivo. RN-RUN-007: falha não é dinheiro
    -- recebido pelo motoboy, e nada aqui inventa receita nem desconto.
    if v_motivo is null then
      return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da falha na entrega.');
    end if;

    v_res := public.comando_pedido(v_vinculo.order_id, 'registrar_falha_entrega',
      jsonb_build_object('motivo', v_motivo));
    if not (v_res ->> 'ok')::boolean then
      return jsonb_build_object('ok', false, 'erro', v_res ->> 'erro');
    end if;

    update public.driver_run_orders
       set delivery_status = 'failed', failure_reason = v_motivo
     where id = p_vinculo_id;
  end if;

  select count(*) into v_pendentes from public.driver_run_orders o
    where o.driver_run_id = v_run.id and o.delivery_status = 'pending';

  if v_pendentes = 0 then
    update public.driver_runs set status = 'settling', returned_at = now()
      where id = v_run.id;
  end if;

  perform public.log_audit(
    case when v_entregue then 'entrega_concluir' else 'entrega_falhar' end,
    'orders', v_vinculo.order_id,
    jsonb_build_object('corrida', v_run.id),
    jsonb_build_object('situacao', case when v_entregue then 'delivered' else 'failed' end),
    v_motivo);

  return jsonb_build_object('ok', true, 'entregue', v_entregue,
    'corrida_voltou', v_pendentes = 0);
end;
$$;

comment on function public.registrar_retorno is 'RN-RUN-003/007. Entregue ou falhou; nenhum dos dois move dinheiro.';

revoke all on function public.registrar_retorno(uuid, jsonb) from public, anon;
grant execute on function public.registrar_retorno(uuid, jsonb) to authenticated;

-- ============================================================ conciliar
-- O ÚNICO LUGAR onde o dinheiro da rua vira papel na gaveta.
--
-- O esperado não é digitado: ele é a soma dos recebimentos em dinheiro já
-- registrados nos pedidos ENTREGUES desta corrida que ainda não entraram em
-- gaveta nenhuma. Cartão e Pix não entram — não há papel para conferir, e
-- fabricar movimento físico para eles seria exatamente o erro que a Fase 7
-- evitou (RN-CAIXA-014).
create or replace function public.conciliar_corrida(p_run_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_run record;
  v_esperado numeric := 0;
  v_devolvido numeric;
  v_diferenca numeric;
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_sessao uuid;
  v_pag record;
  v_sem_pagamento integer;
  v_id uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('deliveries.settle') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para fazer o acerto do motoboy.');
  end if;

  select * into v_run from public.driver_runs r where r.id = p_run_id for update;
  if v_run.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Corrida não encontrada.');
  end if;
  if v_run.status = 'settled' then
    return jsonb_build_object('ok', false, 'ja_acertada', true,
      'erro', 'Esta corrida já foi acertada.');
  end if;
  if v_run.status <> 'settling' then
    return jsonb_build_object('ok', false, 'erro',
      'A corrida ainda tem entrega por conferir.', 'status', v_run.status);
  end if;

  -- O dinheiro que o motoboy deveria trazer.
  select coalesce(sum(p.amount), 0) into v_esperado
    from public.payments p
    join public.driver_run_orders o on o.order_id = p.order_id
   where o.driver_run_id = p_run_id
     and o.delivery_status = 'delivered'
     and p.status = 'confirmed'
     and p.payment_method_family_snapshot = 'cash'
     and p.cash_session_id is null;

  -- Entrega conferida e sem recebimento registrado não trava o acerto, mas
  -- é dita: quase sempre significa que alguém esqueceu de registrar.
  select count(*) into v_sem_pagamento
    from public.driver_run_orders o
   where o.driver_run_id = p_run_id
     and o.delivery_status = 'delivered'
     and not exists (select 1 from public.payments p
                      where p.order_id = o.order_id and p.status = 'confirmed');

  v_devolvido := nullif(p_dados ->> 'devolvido', '')::numeric;
  if v_devolvido is null or v_devolvido < 0 then
    return jsonb_build_object('ok', false, 'erro',
      'Informe quanto o motoboy trouxe em dinheiro.',
      'esperado', v_esperado, 'pedidos_sem_pagamento', v_sem_pagamento);
  end if;
  if v_devolvido <> round(v_devolvido, 2) then
    return jsonb_build_object('ok', false, 'erro', 'Valor com mais de dois decimais.');
  end if;

  v_diferenca := v_devolvido - v_esperado;

  -- RN-RUN-004: diferença exige motivo.
  if v_diferenca <> 0 and v_motivo is null then
    return jsonb_build_object('ok', false, 'exige_motivo', true,
      'erro', 'Há diferença no acerto. Informe o motivo para concluir.',
      'esperado', v_esperado, 'devolvido', v_devolvido, 'diferenca', v_diferenca);
  end if;

  -- Dinheiro precisa de gaveta. Sem caixa aberto, o acerto não acontece —
  -- senão o valor sairia da rua e não chegaria a lugar nenhum.
  if v_esperado > 0 or v_devolvido > 0 then
    select s.id into v_sessao from public.cash_sessions s
      where s.status = 'open' order by s.opened_at desc limit 1;
    if v_sessao is null then
      return jsonb_build_object('ok', false, 'sem_caixa', true,
        'erro', 'Não há caixa aberto. Abra o caixa para receber o dinheiro do motoboy.',
        'esperado', v_esperado);
    end if;
  end if;

  -- Agora sim: cada recebimento da rua entra na gaveta, um a um, com o
  -- movimento físico que o fechamento vai somar.
  for v_pag in
    select p.* from public.payments p
      join public.driver_run_orders o on o.order_id = p.order_id
     where o.driver_run_id = p_run_id
       and o.delivery_status = 'delivered'
       and p.status = 'confirmed'
       and p.payment_method_family_snapshot = 'cash'
       and p.cash_session_id is null
     for update
  loop
    update public.payments set cash_session_id = v_sessao where id = v_pag.id;

    insert into public.cash_movements (
      cash_session_id, movement_type, direction, amount,
      order_id, payment_id, reason, created_by)
    values (v_sessao, 'sale_receipt', 'in', v_pag.amount,
      v_pag.order_id, v_pag.id, 'Acerto de entrega', v_ator);
  end loop;

  insert into public.driver_run_settlements (
    driver_run_id, expected_cash, returned_cash, difference,
    difference_reason, notes, settled_by, cash_session_id)
  values (
    p_run_id, v_esperado, v_devolvido, v_diferenca,
    case when v_diferenca <> 0 then v_motivo end,
    nullif(btrim(coalesce(p_dados ->> 'observacao', '')), ''),
    v_ator, v_sessao)
  returning id into v_id;

  update public.driver_runs
     set status = 'settled', settled_at = now(), settled_by = v_ator
   where id = p_run_id;

  perform public.log_audit('entrega_conciliar', 'driver_runs', p_run_id,
    jsonb_build_object('status', 'settling'),
    jsonb_build_object('status', 'settled', 'esperado', v_esperado,
                       'devolvido', v_devolvido, 'diferenca', v_diferenca,
                       'cash_session_id', v_sessao,
                       'pedidos_sem_pagamento', v_sem_pagamento),
    v_motivo);

  -- RN-RUN-005: a diferença fica registrada e NADA acontece com o salário.
  -- Transformá-la em lançamento do funcionário é outro ato, de outra pessoa
  -- (RN-RUN-006, `lancar_diferenca_do_motoboy`).
  return jsonb_build_object('ok', true, 'acerto_id', v_id,
    'esperado', v_esperado, 'devolvido', v_devolvido, 'diferenca', v_diferenca,
    'pedidos_sem_pagamento', v_sem_pagamento);
end;
$$;

comment on function public.conciliar_corrida is
  'RN-PGTO-014: único lugar onde o dinheiro da rua entra na gaveta. Diferença não desconta salário.';

revoke all on function public.conciliar_corrida(uuid, jsonb) from public, anon;
grant execute on function public.conciliar_corrida(uuid, jsonb) to authenticated;
