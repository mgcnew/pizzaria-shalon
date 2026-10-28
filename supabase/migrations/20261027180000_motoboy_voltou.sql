-- 0179 — Várias entregas por saída, troco da gaveta e "Motoboy voltou"
-- D-2026-10-27-174 · 04 RN-RUN-003/004, RN-PGTO-014, RN-CAIXA-012-A · CLAUDE.md §26, §34
--
-- O PEDIDO DA LOJA. O motoboy sai com várias entregas na mesma viagem e leva
-- troco tirado da gaveta. O recebimento é feito pedido a pedido na tela
-- Pedidos (o "Receber" de sempre, com o dinheiro "com o motoboy"), e a
-- entrega só sai dos pedidos em aberto quando ele volta e entrega o dinheiro.
-- A página Entregas deixa de fazer o acerto.
--
-- ESTA MIGRATION:
--  1. `driver_runs.change_float`: troco que o motoboy levou da gaveta.
--     Movimento novo `driver_change`: sai na saída, volta no acerto.
--  2. `sair_com_entregas`: "Saiu com…" com várias entregas e o troco, num ato.
--     `sair_com_motoboy` (0178) passa a chamá-la.
--  3. `registrar_retorno`: entrega só é dada como feita com o recebimento
--     registrado (ou fiado).
--  4. `conciliar_corrida`: o esperado do motoboy inclui o troco, que volta à
--     gaveta; entrega fiada não trava o acerto.
--  5. `motoboy_voltou`: conclui as entregas da corrida (as que falharam, com
--     motivo) e faz o acerto com o que ele entregou — tudo ou nada.
--  6. `finalizar_pedido`: Concluir/Falhou de entrega na rua mandam para o
--     "Motoboy voltou", em vez de concluir uma a uma.
--  7. Leituras: `fila_de_pedidos` diz com quem a entrega está; `corrida` e
--     `central_de_entregas` mostram o troco; `motoboys_para_despacho` traz as
--     entregas prontas; `causas_da_diferenca` diz o que cada motoboy entregou
--     na gaveta; `corridas_do_dia` é o histórico da página Entregas.

-- ---------------------------------------------------------------------------
-- 1. Troco do motoboy
-- ---------------------------------------------------------------------------
alter table public.driver_runs
  add column if not exists change_float numeric(12,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'driver_runs_troco_valido') then
    alter table public.driver_runs
      add constraint driver_runs_troco_valido check (change_float >= 0);
  end if;
end;
$$;

comment on column public.driver_runs.change_float is
  'D-2026-10-27-174: troco que o motoboy levou da gaveta nesta saída. Volta no acerto.';

alter table public.cash_movements drop constraint cash_movements_tipo;
alter table public.cash_movements add constraint cash_movements_tipo check (movement_type = any (array[
  'opening', 'sale_receipt', 'supply', 'withdrawal', 'expense', 'refund', 'adjustment',
  'other', 'employee_advance', 'driver_difference', 'driver_change']));

alter table public.cash_movements drop constraint cash_movements_sentido_do_tipo;
alter table public.cash_movements add constraint cash_movements_sentido_do_tipo check (
  (movement_type = 'opening' and direction = 'in')
  or (movement_type = 'sale_receipt' and direction = 'in')
  or (movement_type = 'supply' and direction = 'in')
  or (movement_type = 'withdrawal' and direction = 'out')
  or (movement_type = 'expense' and direction = 'out')
  or (movement_type = 'employee_advance' and direction = 'out')
  -- 0179: o troco sai com o motoboy e volta no acerto.
  or movement_type = any (array['refund', 'adjustment', 'other', 'driver_difference', 'driver_change']));

-- ---------------------------------------------------------------------------
-- 2. "Saiu com…" com várias entregas e o troco
-- ---------------------------------------------------------------------------
create or replace function public.sair_com_entregas(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motoboy uuid;
  v_nome text;
  v_pedidos uuid[];
  v_id uuid;
  v_troco numeric;
  v_res jsonb;
  v_run record;
  v_sessao uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;

  begin
    v_motoboy := nullif(p_dados ->> 'motoboy_id', '')::uuid;
    select array_agg(distinct x::uuid) into v_pedidos
      from jsonb_array_elements_text(coalesce(p_dados -> 'pedidos', '[]'::jsonb)) x;
    v_troco := coalesce(nullif(p_dados ->> 'troco', '')::numeric, 0);
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'Dados inválidos para a saída.');
  end;

  if v_motoboy is null then
    return jsonb_build_object('ok', false, 'erro', 'Escolha o motoboy.');
  end if;
  if v_pedidos is null or cardinality(v_pedidos) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Escolha ao menos uma entrega.');
  end if;
  if cardinality(v_pedidos) > 15 then
    return jsonb_build_object('ok', false, 'erro', 'Entregas demais numa saída só.');
  end if;
  if v_troco < 0 or v_troco <> round(v_troco, 2) then
    return jsonb_build_object('ok', false, 'erro', 'Valor do troco inválido.');
  end if;

  -- Toque duplo: todas já estão na rua com este motoboy.
  if (select count(*) from public.driver_run_orders l
        join public.driver_runs r on r.id = l.driver_run_id
       where l.order_id = any(v_pedidos) and l.delivery_status = 'pending'
         and r.driver_employee_id = v_motoboy and r.status = 'out') = cardinality(v_pedidos) then
    return jsonb_build_object('ok', true, 'ja_existia', true);
  end if;

  -- Vincula cada uma. `atribuir_entrega` checa permissão, modalidade, "pronto
  -- para entrega", motoboy ativo e presente, e abre a saída se não houver.
  foreach v_id in array v_pedidos loop
    v_res := public.atribuir_entrega(v_id, jsonb_build_object('motoboy_id', v_motoboy));
    if not coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception using errcode = 'P0001', message = format('#%s: %s',
        (select o.order_number from public.orders o where o.id = v_id), v_res ->> 'erro');
    end if;
  end loop;

  select r.* into v_run from public.driver_runs r
   where r.driver_employee_id = v_motoboy and r.status in ('open', 'out')
   order by r.created_at desc limit 1 for update;

  if v_run.status = 'open' then
    v_res := public.despachar_corrida(v_run.id);
    if not coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception using errcode = 'P0001', message = coalesce(v_res ->> 'erro', 'Não foi possível despachar.');
    end if;
  else
    -- O motoboy já está na rua: as entregas vão junto, na mesma saída.
    foreach v_id in array v_pedidos loop
      v_res := public.comando_pedido(v_id, 'despachar', '{}'::jsonb);
      if not coalesce((v_res ->> 'ok')::boolean, false) then
        raise exception using errcode = 'P0001', message = format('#%s: %s',
          (select o.order_number from public.orders o where o.id = v_id), v_res ->> 'erro');
      end if;
    end loop;
  end if;

  -- O troco sai da gaveta agora e volta no acerto: sem isto, a gaveta
  -- fecharia com a falta do troco que está na rua.
  if v_troco > 0 then
    select s.id into v_sessao from public.cash_sessions s
     where s.status = 'open' order by s.opened_at desc limit 1;
    if v_sessao is null then
      raise exception using errcode = 'P0001', message = 'Abra o caixa para tirar o troco da gaveta.';
    end if;
    if v_troco > public.esperado_em_caixa(v_sessao) then
      raise exception using errcode = 'P0001', message = 'O troco é maior que o dinheiro esperado na gaveta.';
    end if;

    select e.full_name into v_nome from public.employees e where e.id = v_motoboy;
    insert into public.cash_movements (cash_session_id, movement_type, direction, amount, reason, created_by)
    values (v_sessao, 'driver_change', 'out', v_troco, 'Troco levado por ' || v_nome, v_ator);

    update public.driver_runs set change_float = change_float + v_troco where id = v_run.id;
  end if;

  perform public.log_audit('entrega_saiu_com', 'driver_runs', v_run.id, null,
    jsonb_build_object('pedidos', to_jsonb(v_pedidos), 'troco', v_troco), null);

  return jsonb_build_object('ok', true, 'corrida_id', v_run.id);
exception
  when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'erro', sqlerrm);
end;
$$;

comment on function public.sair_com_entregas is
  'D-2026-10-27-174: "Saiu com…" — vincula várias entregas ao motoboy, põe na rua e registra o troco que saiu da gaveta, num ato.';

revoke all on function public.sair_com_entregas(jsonb) from public, anon;
grant execute on function public.sair_com_entregas(jsonb) to authenticated;

create or replace function public.sair_com_motoboy(p_order_id uuid, p_motoboy_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$
  select public.sair_com_entregas(jsonb_build_object(
    'motoboy_id', p_motoboy_id, 'pedidos', jsonb_build_array(p_order_id)));
$$;

-- ---------------------------------------------------------------------------
-- 3. Entrega feita só com o recebimento registrado
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.registrar_retorno(uuid,jsonb)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0179: entregue com recebimento%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'  if v_entregue then\n',
    E'  if v_entregue then\n    -- 0179: entregue com recebimento. O pedido só sai dos abertos com o que o\n    -- cliente pagou registrado (ou fiado), D-2026-10-27-174.\n    if not exists (select 1 from public.orders d\n                    where d.id = v_vinculo.order_id\n                      and (d.deferred_at is not null\n                           or coalesce((select sum(p.amount) from public.payments p\n                                         where p.order_id = d.id and p.status = ''confirmed''), 0) >= d.total)) then\n      return jsonb_build_object(''ok'', false, ''sem_recebimento'', true,\n        ''erro'', ''Registre o que o cliente pagou antes de dar a entrega como feita.'');\n    end if;\n\n');

  if v_novo = v_def then
    raise exception 'registrar_retorno mudou: patch do recebimento obrigatório';
  end if;

  execute v_novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Acerto com o troco; fiado não trava
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.conciliar_corrida(uuid,jsonb)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0179: troco volta%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'  v_esperado := public.dinheiro_da_corrida(p_run_id, true);\n',
    E'  v_esperado := public.dinheiro_da_corrida(p_run_id, true);\n  -- 0179: troco volta junto com o dinheiro das entregas.\n  v_esperado := v_esperado + coalesce(v_run.change_float, 0);\n');

  v_novo := replace(v_novo,
    E'     and not exists (select 1 from public.payments p\n                      where p.order_id = o.order_id and p.status = ''confirmed'');\n\n  -- O recebimento é feito no acerto',
    E'     and not exists (select 1 from public.payments p\n                      where p.order_id = o.order_id and p.status = ''confirmed'')\n     -- 0179: fiado não tem o que receber.\n     and not exists (select 1 from public.orders d\n                      where d.id = o.order_id and d.deferred_at is not null);\n\n  -- O recebimento é feito no acerto');

  v_novo := replace(v_novo,
    E'      v_pag.order_id, v_pag.id, ''Acerto de entrega'', v_ator);\n  end loop;\n',
    E'      v_pag.order_id, v_pag.id, ''Acerto de entrega'', v_ator);\n  end loop;\n\n  if coalesce(v_run.change_float, 0) > 0 then\n    insert into public.cash_movements (\n      cash_session_id, movement_type, direction, amount, reason, created_by)\n    values (v_sessao, ''driver_change'', ''in'', v_run.change_float,\n      ''Troco devolvido pelo motoboy'', v_ator);\n  end if;\n');

  if v_novo = v_def
     or v_novo not like '%fiado não tem o que receber%'
     or v_novo not like '%Troco devolvido pelo motoboy%' then
    raise exception 'conciliar_corrida mudou: patch do troco';
  end if;

  execute v_novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. "Motoboy voltou"
-- ---------------------------------------------------------------------------
create or replace function public.motoboy_voltou(p_run_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_run record;
  v_link record;
  v_falha jsonb;
  v_falhas jsonb := coalesce(p_dados -> 'falhas', '[]'::jsonb);
  v_res jsonb;
  v_detalhe text;
  v_extra jsonb;
begin
  if public.current_app_user_id() is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('deliveries.manage') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para gerenciar entregas.');
  end if;
  if jsonb_typeof(v_falhas) <> 'array' then
    return jsonb_build_object('ok', false, 'erro', 'Dados inválidos.');
  end if;

  select * into v_run from public.driver_runs r where r.id = p_run_id for update;
  if v_run.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Corrida não encontrada.');
  end if;
  if v_run.status = 'settled' then
    return jsonb_build_object('ok', true, 'ja_existia', true);
  end if;
  if v_run.status not in ('out', 'settling') then
    return jsonb_build_object('ok', false, 'erro', 'Esta corrida ainda não saiu.');
  end if;

  -- Cada entrega pendente: feita, ou falhou com o motivo dito.
  for v_link in
    select o.id, o.order_id, d.order_number
      from public.driver_run_orders o
      join public.orders d on d.id = o.order_id
     where o.driver_run_id = p_run_id and o.delivery_status = 'pending'
     order by o.assigned_at
  loop
    v_falha := null;
    select f into v_falha from jsonb_array_elements(v_falhas) f
     where f ->> 'pedido_id' = v_link.order_id::text limit 1;

    v_res := public.registrar_retorno(v_link.id, jsonb_build_object(
      'entregue', v_falha is null,
      'motivo', v_falha ->> 'motivo'));
    if not coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception using errcode = 'P0001', detail = v_res::text,
        message = format('#%s: %s', v_link.order_number, v_res ->> 'erro');
    end if;
  end loop;

  -- O acerto com o que ele entregou. Diferença exige motivo e quem concilia.
  v_res := public.conciliar_corrida(p_run_id, jsonb_build_object(
    'devolvido', p_dados -> 'devolvido',
    'motivo', p_dados ->> 'motivo',
    'observacao', p_dados ->> 'observacao'));
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception using errcode = 'P0001', detail = v_res::text,
      message = coalesce(v_res ->> 'erro', 'Não foi possível fazer o acerto.');
  end if;

  return v_res;
exception
  when sqlstate 'P0001' then
    -- Tudo desfeito; a resposta da etapa que recusou volta para a tela.
    get stacked diagnostics v_detalhe = pg_exception_detail;
    begin
      v_extra := nullif(v_detalhe, '')::jsonb;
    exception when others then
      v_extra := null;
    end;
    return coalesce(v_extra, '{}'::jsonb) || jsonb_build_object('ok', false, 'erro', sqlerrm);
end;
$$;

comment on function public.motoboy_voltou is
  'D-2026-10-27-174: o motoboy voltou — conclui as entregas da corrida (falhas com motivo) e faz o acerto com o que ele entregou, tudo ou nada.';

revoke all on function public.motoboy_voltou(uuid, jsonb) from public, anon;
grant execute on function public.motoboy_voltou(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Concluir / Falhou de entrega na rua: pelo "Motoboy voltou"
-- ---------------------------------------------------------------------------
create or replace function public.finalizar_pedido(p_order_id uuid, p_comando text, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_corrida uuid;
  v_nome text;
begin
  if p_comando in ('concluir', 'registrar_falha_entrega') then
    select r.id, e.full_name into v_corrida, v_nome
      from public.driver_run_orders o
      join public.driver_runs r on r.id = o.driver_run_id
      join public.employees e on e.id = r.driver_employee_id
     where o.order_id = p_order_id and o.delivery_status = 'pending' and r.status = 'out';

    if v_corrida is not null then
      return jsonb_build_object('ok', false, 'motoboy_voltou', true, 'corrida_id', v_corrida,
        'erro', format('Esta entrega está com %s. Use “%s voltou” para concluir.', v_nome, v_nome));
    end if;
  end if;

  return public.comando_pedido(p_order_id, p_comando, p_dados);
end;
$$;

comment on function public.finalizar_pedido is
  'D-2026-10-27-174: comandos da tela Pedidos. Entrega na rua conclui pelo "Motoboy voltou"; o resto é comando_pedido.';

-- ---------------------------------------------------------------------------
-- 7. Leituras
-- ---------------------------------------------------------------------------

-- Com quem está a entrega, na fila de pedidos.
do $$
declare
  v_def text := pg_get_functiondef('public.fila_de_pedidos(boolean)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0179: com quem está%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'      (o.status in (''completed'', ''rejected'', ''cancelled'')) as encerrado,\n',
    E'      (o.status in (''completed'', ''rejected'', ''cancelled'')) as encerrado,\n      -- 0179: com quem está a entrega na rua.\n      (select jsonb_build_object(''corrida_id'', r.id, ''nome'', e.full_name)\n         from public.driver_run_orders l\n         join public.driver_runs r on r.id = l.driver_run_id\n         join public.employees e on e.id = r.driver_employee_id\n        where l.order_id = o.id and l.delivery_status = ''pending'' and r.status = ''out''\n        limit 1) as motoboy,\n');

  if v_novo = v_def then
    raise exception 'fila_de_pedidos mudou: patch do motoboy';
  end if;

  execute v_novo;
end;
$$;

-- O troco na corrida e o dinheiro já recebido das entregas.
do $$
declare
  v_def text := pg_get_functiondef('public.corrida(uuid)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0179: troco%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'    ''observacao'', r.notes,\n',
    E'    ''observacao'', r.notes,\n    -- 0179: troco levado da gaveta e o dinheiro das entregas já recebido.\n    ''troco'', r.change_float::numeric(12,2),\n    ''dinheiro_recebido'', public.dinheiro_da_corrida(r.id, false),\n');

  if v_novo = v_def then
    raise exception 'corrida mudou: patch do troco';
  end if;

  execute v_novo;
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.central_de_entregas()'::regprocedure);
  v_novo text;
begin
  if v_def like '%0179: troco%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'''dinheiro_na_rua'', public.dinheiro_da_corrida(r.id, false)\n',
    E'''dinheiro_na_rua'', public.dinheiro_da_corrida(r.id, false),\n                   -- 0179: troco levado da gaveta.\n                   ''troco'', r.change_float::numeric(12,2)\n');

  if v_novo = v_def then
    raise exception 'central_de_entregas mudou: patch do troco';
  end if;

  execute v_novo;
end;
$$;

-- Quem pode sair agora, e o que está pronto para ir junto.
create or replace function public.motoboys_para_despacho()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_permission('deliveries.manage') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para gerenciar entregas.');
  end if;

  return jsonb_build_object('ok', true,
    'motoboys', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'nome', e.full_name,
               'presente', coalesce(a.status = 'present', false),
               'na_rua', coalesce(r.status = 'out', false),
               'entregas_na_rua', coalesce(r.pendentes, 0))
             order by (r.status = 'out') desc nulls last, (a.status = 'present') desc nulls last, e.full_name)
        from public.employees e
        left join public.employee_attendance a
          on a.employee_id = e.id and a.work_date = public.dia_de_trabalho()
        left join lateral (
          select dr.status,
                 (select count(*) from public.driver_run_orders o
                   where o.driver_run_id = dr.id and o.delivery_status = 'pending') as pendentes
            from public.driver_runs dr
           where dr.driver_employee_id = e.id and dr.status in ('open', 'out')
           order by dr.created_at desc limit 1) r on true
       where e.is_driver and e.employment_status = 'active'
         and a.status is distinct from 'absent'), '[]'::jsonb),
    -- 0179: entregas prontas sem motoboy, para sair juntas.
    'prontas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pedido_id', d.id, 'numero', d.order_number,
               'cliente', d.customer_name_snapshot,
               'bairro', d.delivery_address_snapshot ->> 'bairro',
               'total', d.total::numeric(12,2))
             order by d.ready_at nulls last, d.order_number)
        from public.orders d
       where d.fulfillment_type = 'delivery'
         and d.status = 'ready_for_delivery'
         and not exists (select 1 from public.driver_run_orders o
                          where o.order_id = d.id and o.delivery_status = 'pending')), '[]'::jsonb));
end;
$$;

-- O que cada motoboy entregou nesta gaveta: por onde começar quando falta.
do $$
declare
  v_def text := pg_get_functiondef('public.causas_da_diferenca(uuid)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0179: cada motoboy%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'    ''saidas_registradas'', (\n',
    E'    -- 0179: cada motoboy, com o que entregou nesta gaveta (sem o troco).\n    ''motoboys'', coalesce((\n      select jsonb_agg(jsonb_build_object(\n               ''nome'', t.nome, ''entregas'', t.entregas,\n               ''dinheiro'', t.dinheiro, ''diferenca'', t.diferenca)\n             order by t.nome)\n        from (\n          select e.full_name as nome,\n                 sum((select count(*) from public.driver_run_orders o\n                       where o.driver_run_id = r.id and o.delivery_status = ''delivered''))::int as entregas,\n                 sum(s.expected_cash - r.change_float)::numeric(12,2) as dinheiro,\n                 sum(s.difference)::numeric(12,2) as diferenca\n            from public.driver_run_settlements s\n            join public.driver_runs r on r.id = s.driver_run_id\n            join public.employees e on e.id = r.driver_employee_id\n           where s.cash_session_id = v_s.id\n           group by e.full_name) t), ''[]''::jsonb),\n\n    ''saidas_registradas'', (\n');

  if v_novo = v_def then
    raise exception 'causas_da_diferenca mudou: patch dos motoboys';
  end if;

  execute v_novo;
end;
$$;

-- Histórico da página Entregas: as saídas de um dia de trabalho (vira às 5h).
create or replace function public.corridas_do_dia(p_dia date default null)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(t.linha order by t.departed_at desc), '[]'::jsonb)
    from (
      select r.departed_at, jsonb_build_object(
               'corrida_id', r.id,
               'status', r.status,
               'motoboy', e.full_name,
               'saiu_em', r.departed_at,
               'voltou_em', r.returned_at,
               'acertada_em', r.settled_at,
               'troco', r.change_float::numeric(12,2),
               'entregas', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'numero', d.order_number,
                          'cliente', d.customer_name_snapshot,
                          'bairro', d.delivery_address_snapshot ->> 'bairro',
                          'total', d.total::numeric(12,2),
                          'situacao', o.delivery_status)
                        order by o.assigned_at)
                   from public.driver_run_orders o
                   join public.orders d on d.id = o.order_id
                  where o.driver_run_id = r.id
                    and o.delivery_status <> 'reassigned'), '[]'::jsonb),
               'esperado', s.expected_cash::numeric(12,2),
               'devolvido', s.returned_cash::numeric(12,2),
               'diferenca', s.difference::numeric(12,2),
               'motivo', s.difference_reason) as linha
        from public.driver_runs r
        join public.employees e on e.id = r.driver_employee_id
        left join public.driver_run_settlements s on s.driver_run_id = r.id
       where r.departed_at is not null
         and ((r.departed_at at time zone coalesce((select st.timezone from public.store_settings st limit 1),
                                                   'America/Sao_Paulo')) - interval '5 hours')::date
             = coalesce(p_dia, public.dia_de_trabalho())
    ) t;
$$;

comment on function public.corridas_do_dia is
  'D-2026-10-27-174: saídas de motoboy de um dia de trabalho, com as entregas, o troco e o acerto. Leitura sob RLS.';

revoke all on function public.corridas_do_dia(date) from public, anon;
grant execute on function public.corridas_do_dia(date) to authenticated;

-- O que a tela "Motoboy voltou" mostra: cada entrega, o que já foi recebido e
-- quanto ele precisa entregar. Lida com a autoridade de quem gerencia
-- entregas, porque a balconista não lê `payments` direto.
create or replace function public.a_receber_do_motoboy(p_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_run record;
begin
  if not public.has_permission('deliveries.manage') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para gerenciar entregas.');
  end if;

  select r.*, e.full_name as motoboy into v_run
    from public.driver_runs r join public.employees e on e.id = r.driver_employee_id
   where r.id = p_run_id;
  if v_run.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Corrida não encontrada.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'corrida_id', v_run.id,
    'status', v_run.status,
    'motoboy', v_run.motoboy,
    'saiu_em', v_run.departed_at,
    'troco', v_run.change_float::numeric(12,2),
    'caixa_aberto', exists (select 1 from public.cash_sessions s where s.status = 'open'),
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pedido_id', d.id,
               'numero', d.order_number,
               'cliente', d.customer_name_snapshot,
               'bairro', d.delivery_address_snapshot ->> 'bairro',
               'total', d.total::numeric(12,2),
               'forma_esperada', pi.payment_method_name_snapshot,
               'fiado', d.deferred_at is not null and d.payment_status <> 'confirmed',
               'pago', coalesce(pg.pago, 0)::numeric(12,2),
               'dinheiro_com_ele', coalesce(pg.com_ele, 0)::numeric(12,2))
             order by o.assigned_at)
        from public.driver_run_orders o
        join public.orders d on d.id = o.order_id
        left join public.order_payment_intents pi on pi.order_id = d.id
        left join lateral (
          select sum(p.amount) as pago,
                 sum(p.amount) filter (where p.payment_method_family_snapshot = 'cash'
                                         and p.cash_session_id is null) as com_ele
            from public.payments p
           where p.order_id = d.id and p.status = 'confirmed') pg on true
       where o.driver_run_id = v_run.id and o.delivery_status = 'pending'), '[]'::jsonb),
    -- O mesmo número que `conciliar_corrida` cobra, mais o troco.
    'a_entregar', (public.dinheiro_da_corrida(v_run.id, false) + v_run.change_float)::numeric(12,2));
end;
$$;

comment on function public.a_receber_do_motoboy is
  'D-2026-10-27-174: o que a tela "Motoboy voltou" mostra — entregas pendentes da corrida, o recebido e quanto o motoboy precisa entregar.';

revoke all on function public.a_receber_do_motoboy(uuid) from public, anon;
grant execute on function public.a_receber_do_motoboy(uuid) to authenticated;
