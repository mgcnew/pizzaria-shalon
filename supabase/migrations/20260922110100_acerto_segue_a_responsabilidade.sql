-- 0081 — O acerto e o painel passam a seguir a responsabilidade, não o vínculo
-- RN-RUN-009 · 03 §19.5/§19.6 · CLAUDE.md §26
--
-- Depois da transferência em rota, "de quem é este dinheiro" deixa de ser
-- respondível só pelo vínculo de entrega: João pode ter recebido e Pedro ter
-- entregado. `dinheiro_da_corrida` (0080) é a resposta única, e as três
-- rotinas abaixo passam a usá-la em vez de repetir a soma.
--
-- SEM ISSO, o mesmo dinheiro apareceria na corrida de João e na de Pedro — e
-- o painel somaria duas vezes um valor que existe uma vez só.

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

  -- RN-RUN-009: o que ESTA corrida responde, entregas concluídas.
  v_esperado := public.dinheiro_da_corrida(p_run_id, true);

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

  -- Cada recebimento sob responsabilidade DESTA corrida entra na gaveta, um a
  -- um. O predicado é o mesmo de `dinheiro_da_corrida`: o que foi somado é
  -- exatamente o que é recolhido.
  for v_pag in
    select p.* from public.payments p
     where p.status = 'confirmed'
       and p.payment_method_family_snapshot = 'cash'
       and p.cash_session_id is null
       and (
         p.responsible_driver_run_id = p_run_id
         or (p.responsible_driver_run_id is null and exists (
               select 1 from public.driver_run_orders o
                where o.driver_run_id = p_run_id
                  and o.order_id = p.order_id
                  and o.delivery_status = 'delivered'))
       )
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
  -- (RN-RUN-006, `lancar_no_funcionario`).
  return jsonb_build_object('ok', true, 'acerto_id', v_id,
    'esperado', v_esperado, 'devolvido', v_devolvido, 'diferenca', v_diferenca,
    'pedidos_sem_pagamento', v_sem_pagamento);
end;
$$;

comment on function public.conciliar_corrida is
  'RN-PGTO-014: único lugar onde o dinheiro da rua entra na gaveta. Segue a responsabilidade (RN-RUN-009), não o vínculo. Diferença não desconta salário.';

revoke all on function public.conciliar_corrida(uuid, jsonb) from public, anon;
grant execute on function public.conciliar_corrida(uuid, jsonb) to authenticated;

-- ------------------------------------------------------------- projeções
create or replace function public.central_de_entregas()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'aguardando', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pedido_id', d.id,
               'numero', d.order_number,
               'cliente', d.customer_name_snapshot,
               'endereco', d.delivery_address_snapshot,
               'total', d.total::numeric(12,2),
               'taxa', d.delivery_fee::numeric(12,2),
               'pagamento_esperado', pi.payment_method_name_snapshot,
               'familia_esperada', pi.payment_method_family_snapshot,
               'ja_pago', d.payment_status = 'confirmed',
               'pronto_desde', d.ready_at)
             order by d.ready_at nulls last, d.order_number)
        from public.orders d
        left join public.order_payment_intents pi on pi.order_id = d.id
       where d.fulfillment_type = 'delivery'
         and d.status = 'ready_for_delivery'
         and not exists (select 1 from public.driver_run_orders o
                          where o.order_id = d.id and o.delivery_status = 'pending')
    ), '[]'::jsonb),

    'corridas', coalesce((
      select jsonb_agg(t.linha order by t.created_at)
        from (
          select r.created_at, jsonb_build_object(
                   'corrida_id', r.id,
                   'status', r.status,
                   'motoboy_id', r.driver_employee_id,
                   'motoboy', e.full_name,
                   'criada_em', r.created_at,
                   'saiu_em', r.departed_at,
                   'voltou_em', r.returned_at,
                   'pedidos', (select count(*) from public.driver_run_orders o
                                where o.driver_run_id = r.id
                                  and o.delivery_status not in ('reassigned', 'transferred')),
                   'pendentes', (select count(*) from public.driver_run_orders o
                                  where o.driver_run_id = r.id
                                    and o.delivery_status = 'pending'),
                   'transferidos', (select count(*) from public.driver_run_orders o
                                     where o.driver_run_id = r.id
                                       and o.delivery_status = 'transferred'),
                   -- RN-CAIXA-014 + RN-RUN-009: dinheiro NA RUA, atribuído a
                   -- uma corrida só. Não é caixa e não se conta duas vezes.
                   'dinheiro_na_rua', public.dinheiro_da_corrida(r.id, false)
                 ) as linha
            from public.driver_runs r
            join public.employees e on e.id = r.driver_employee_id
           where r.status <> 'settled'
        ) t
    ), '[]'::jsonb),

    'motoboys', coalesce((
      select jsonb_agg(jsonb_build_object(
               'funcionario_id', e.id,
               'nome', e.full_name,
               'ocupado', exists (select 1 from public.driver_runs r
                                   where r.driver_employee_id = e.id
                                     and r.status <> 'settled'))
             order by e.full_name)
        from public.employees e
       where e.is_driver and e.employment_status = 'active'
    ), '[]'::jsonb)
  );
$$;

comment on function public.central_de_entregas is
  'Fila de entrega, corridas vivas e motoboys. `dinheiro_na_rua` não é caixa (RN-CAIXA-014) e pertence a uma corrida só (RN-RUN-009).';

revoke all on function public.central_de_entregas() from public, anon;
grant execute on function public.central_de_entregas() to authenticated;

create or replace function public.corrida(p_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'corrida_id', r.id,
    'status', r.status,
    'motoboy_id', r.driver_employee_id,
    'motoboy', e.full_name,
    'criada_em', r.created_at,
    'saiu_em', r.departed_at,
    'voltou_em', r.returned_at,
    'acertada_em', r.settled_at,
    'observacao', r.notes,

    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'vinculo_id', o.id,
               'pedido_id', d.id,
               'numero', d.order_number,
               'cliente', d.customer_name_snapshot,
               'endereco', d.delivery_address_snapshot,
               'total', d.total::numeric(12,2),
               'situacao', o.delivery_status,
               'motivo_da_falha', o.failure_reason,
               'entregue_em', o.delivered_at,
               'pagamento_esperado', pi.payment_method_name_snapshot,
               'familia_esperada', pi.payment_method_family_snapshot,
               'recebido', coalesce((
                   select sum(p.amount) from public.payments p
                    where p.order_id = d.id and p.status = 'confirmed'), 0)::numeric(12,2),
               'recebido_em_dinheiro', coalesce((
                   select sum(p.amount) from public.payments p
                    where p.order_id = d.id and p.status = 'confirmed'
                      and p.payment_method_family_snapshot = 'cash'), 0)::numeric(12,2),
               'ja_entrou_na_gaveta', exists (
                   select 1 from public.payments p
                    where p.order_id = d.id and p.status = 'confirmed'
                      and p.cash_session_id is not null),
               -- Para onde foi, quando foi transferida.
               'transferida_para', (
                   select e2.full_name from public.delivery_transfers t
                     join public.employees e2 on e2.id = t.to_employee_id
                    where t.from_link_id = o.id),
               'motivo_da_transferencia', (
                   select t.reason from public.delivery_transfers t
                    where t.from_link_id = o.id),
               -- De onde veio, quando esta corrida a recebeu.
               'recebida_de', (
                   select e3.full_name from public.delivery_transfers t
                     join public.employees e3 on e3.id = t.from_employee_id
                    where t.to_link_id = o.id),
               -- RN-RUN-009: o dinheiro deste pedido ficou com quem saiu?
               'dinheiro_com_o_anterior', exists (
                   select 1 from public.payments p
                    where p.order_id = d.id and p.status = 'confirmed'
                      and p.cash_session_id is null
                      and p.responsible_driver_run_id is not null
                      and p.responsible_driver_run_id <> r.id))
             order by o.assigned_at)
        from public.driver_run_orders o
        join public.orders d on d.id = o.order_id
        left join public.order_payment_intents pi on pi.order_id = d.id
       where o.driver_run_id = r.id
    ), '[]'::jsonb),

    -- O mesmo número que `conciliar_corrida` vai recalcular ao gravar.
    'esperado_em_dinheiro', public.dinheiro_da_corrida(r.id, true),

    'pedidos_sem_pagamento', (
      select count(*) from public.driver_run_orders o
       where o.driver_run_id = r.id and o.delivery_status = 'delivered'
         and not exists (select 1 from public.payments p
                          where p.order_id = o.order_id and p.status = 'confirmed')),

    'acerto', (
      select jsonb_build_object(
               'acerto_id', s.id,
               'esperado', s.expected_cash::numeric(12,2),
               'devolvido', s.returned_cash::numeric(12,2),
               'diferenca', s.difference::numeric(12,2),
               'motivo', s.difference_reason,
               'observacao', s.notes,
               'acertado_em', s.settled_at,
               'lancamento_id', (select l.id from public.employee_ledger_entries l
                                  where l.related_driver_run_id = r.id
                                    and l.status = 'confirmed' limit 1))
        from public.driver_run_settlements s where s.driver_run_id = r.id)
  )
  from public.driver_runs r
  join public.employees e on e.id = r.driver_employee_id
  where r.id = p_id;
$$;

revoke all on function public.corrida(uuid) from public, anon;
grant execute on function public.corrida(uuid) to authenticated;
