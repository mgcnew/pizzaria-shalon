-- 0177 — Saída rápida da gaveta e causas da diferença do fechamento
-- D-2026-10-27-171 · 04 RN-CAIXA-008/010/012/014/016 · CLAUDE.md §25, §28, §33, §34
--
-- O PROBLEMA. Quase todo fechamento sai com diferença e a balconista não sabe
-- explicar. De 14 a 25/10 a gaveta não registrou NENHUMA saída — nenhuma
-- sangria, despesa, pagamento de motoboy. A sangria só existia por tecla (F9) e
-- a despesa pelo caixa só no Financeiro, que a balconista não abre. O dinheiro
-- saía mesmo assim: falta no fechamento. E dinheiro de entrega registrado com
-- "entrou na gaveta" desmarcado ficava pendente para sempre: sobra no dia, e um
-- "fora da gaveta" que só crescia (R$ 296,98 em 25/10).
--
-- ESTA MIGRATION:
--  1. `tirar_dinheiro_da_gaveta`: um ato, com o motivo escolhido num toque —
--     pagamento do motoboy, compra, retirada da dona ou outro. Retirada da dona
--     é SANGRIA (o dinheiro continua da loja). As outras são DESPESA PAGA PELO
--     CAIXA: lançamento no Financeiro, na categoria do motivo, mais o movimento
--     de saída na sessão aberta (RN-CAIXA-010). Exige só `cash.adjust`.
--  2. `dinheiro_entrou_na_gaveta`: o pagamento em dinheiro que ficou "fora da
--     gaveta" entra no caixa DO TURNO EM QUE FOI RECEBIDO. Turno aberto: o
--     esperado sobe e pronto (`payments.register`). Turno já fechado: o
--     esperado e a diferença gravados são recalculados, o fechamento original
--     fica em `cash_session_corrections` (`cash_collected`) e a contagem física
--     não muda (`cash.reopen`, RN-CAIXA-016). Pedido de saída de entrega fica
--     com o acerto do motoboy.
--  3. `causas_da_diferenca`: o que o banco sabe e pode explicar a diferença de
--     uma sessão — dinheiro fora da gaveta, forma registrada diferente da
--     escolhida no pedido (dinheiro × outra), vendas com troco e quantas saídas
--     foram registradas. Só leitura, `cash.view`.

-- Categorias da saída rápida. A função as encontra pelo NOME (único): renomear
-- uma delas no Financeiro faz a saída daquele motivo recusar com mensagem.
insert into public.financial_categories (name, kind, is_active, sort_order)
select v.nome, 'expense', true, v.ordem
  from (values ('Pagamento de motoboy', 10), ('Compras do dia', 11), ('Outras despesas do caixa', 12)) v(nome, ordem)
 where not exists (select 1 from public.financial_categories c where c.name = v.nome);

alter table public.cash_session_corrections
  drop constraint cash_session_corrections_tipo;
alter table public.cash_session_corrections
  add constraint cash_session_corrections_tipo
  check (correction_type in ('reopen', 'reclose', 'payment_change', 'cash_collected'));

-- ---------------------------------------------------------------------------
-- 1. Saída rápida
-- ---------------------------------------------------------------------------
create or replace function public.tirar_dinheiro_da_gaveta(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(p_dados ->> 'motivo', '');
  v_obs text := nullif(btrim(coalesce(p_dados ->> 'observacao', '')), '');
  v_valor numeric;
  v_idem uuid;
  v_sessao uuid;
  v_esperado numeric;
  v_rotulo text;
  v_categoria text;
  v_cat uuid;
  v_texto text;
  v_lanc uuid;
  v_mov uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('cash.adjust') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para tirar dinheiro da gaveta.');
  end if;

  v_rotulo := case v_motivo
    when 'motoboy' then 'Pagamento do motoboy'
    when 'compra' then 'Compra'
    when 'retirada' then 'Retirada da dona'
    when 'outro' then 'Outro'
  end;
  if v_rotulo is null then
    return jsonb_build_object('ok', false, 'erro', 'Escolha o motivo da saída.');
  end if;
  if v_motivo = 'outro' and (v_obs is null or length(v_obs) < 3) then
    return jsonb_build_object('ok', false, 'erro', 'Diga para que foi o dinheiro.');
  end if;
  if v_obs is not null and length(v_obs) > 300 then
    return jsonb_build_object('ok', false, 'erro', 'Observação longa demais.');
  end if;

  begin
    v_valor := nullif(p_dados ->> 'valor', '')::numeric;
  exception when others then
    v_valor := null;
  end;
  if v_valor is null or v_valor <= 0 then
    return jsonb_build_object('ok', false, 'erro', 'Informe um valor maior que zero.');
  end if;
  if v_valor <> round(v_valor, 2) then
    return jsonb_build_object('ok', false, 'erro', 'Valor com mais de dois decimais.');
  end if;

  begin
    v_idem := nullif(p_dados ->> 'idempotency_key', '')::uuid;
  exception when others then
    v_idem := null;
  end;
  if v_idem is not null and exists (select 1 from public.cash_movements m where m.idempotency_key = v_idem) then
    return jsonb_build_object('ok', true, 'ja_existia', true);
  end if;

  select s.id into v_sessao from public.cash_sessions s
   where s.status = 'open' order by s.opened_at desc limit 1 for update;
  if v_sessao is null then
    return jsonb_build_object('ok', false, 'sem_caixa', true, 'erro', 'Não há caixa aberto.');
  end if;
  v_esperado := public.esperado_em_caixa(v_sessao);
  if v_valor > v_esperado then
    return jsonb_build_object('ok', false, 'erro',
      'O valor é maior que o dinheiro que o sistema espera na gaveta.', 'esperado', v_esperado);
  end if;

  v_texto := v_rotulo || coalesce(': ' || v_obs, '');

  if v_motivo = 'retirada' then
    -- Sangria: o dinheiro sai da gaveta, mas continua sendo da loja.
    insert into public.cash_movements (
      cash_session_id, movement_type, direction, amount, reason, created_by, idempotency_key)
    values (v_sessao, 'withdrawal', 'out', v_valor, v_texto, v_ator, v_idem)
    returning id into v_mov;
  else
    v_categoria := case v_motivo
      when 'motoboy' then 'Pagamento de motoboy'
      when 'compra' then 'Compras do dia'
      else 'Outras despesas do caixa'
    end;
    select c.id into v_cat from public.financial_categories c where c.name = v_categoria;
    if v_cat is null then
      return jsonb_build_object('ok', false, 'erro', 'Categoria da despesa não encontrada.');
    end if;

    -- Despesa paga pelo caixa (RN-CAIXA-010): lançamento + saída da gaveta.
    insert into public.financial_entries (
      entry_type, category_id, amount, occurred_at, description, cash_session_id, created_by)
    values ('expense', v_cat, v_valor, now(), v_texto, v_sessao, v_ator)
    returning id into v_lanc;

    insert into public.cash_movements (
      cash_session_id, movement_type, direction, amount,
      financial_entry_id, reason, created_by, idempotency_key)
    values (v_sessao, 'expense', 'out', v_valor, v_lanc, v_texto, v_ator, v_idem)
    returning id into v_mov;
  end if;

  perform public.log_audit('caixa_saida_rapida', 'cash_movements', v_mov, null,
    jsonb_build_object('motivo', v_motivo, 'valor', v_valor, 'sessao_id', v_sessao,
                       'lancamento_id', v_lanc),
    v_texto);

  return jsonb_build_object('ok', true, 'ja_existia', false, 'movimento_id', v_mov,
    'lancamento_id', v_lanc);
end;
$$;

comment on function public.tirar_dinheiro_da_gaveta is
  'D-2026-10-27-171: saída da gaveta com motivo de um toque. Retirada = sangria; motoboy/compra/outro = despesa paga pelo caixa.';

revoke all on function public.tirar_dinheiro_da_gaveta(jsonb) from public, anon;
grant execute on function public.tirar_dinheiro_da_gaveta(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Dinheiro que ficou fora da gaveta entra no caixa do turno
-- ---------------------------------------------------------------------------
create or replace function public.dinheiro_entrou_na_gaveta(p_pagamento_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_pag record;
  v_sessao record;
  v_esperado numeric;
  v_diferenca numeric;
  v_snapshot jsonb;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('payments.register') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para registrar recebimento.');
  end if;

  select p.* into v_pag from public.payments p where p.id = p_pagamento_id for update;
  if v_pag.id is null or v_pag.status <> 'confirmed' or v_pag.payment_method_family_snapshot <> 'cash' then
    return jsonb_build_object('ok', false, 'erro', 'Pagamento em dinheiro não encontrado.');
  end if;
  -- Já entrou (duplo toque, duas telas): nada a fazer.
  if v_pag.cash_session_id is not null then
    return jsonb_build_object('ok', true, 'ja_existia', true);
  end if;
  if v_pag.responsible_driver_run_id is not null
     or exists (select 1 from public.driver_run_orders r where r.order_id = v_pag.order_id) then
    return jsonb_build_object('ok', false, 'erro',
      'Este pedido saiu numa entrega: o dinheiro entra pelo acerto do motoboy.');
  end if;

  -- O caixa do turno em que o dinheiro foi recebido.
  select s.* into v_sessao from public.cash_sessions s
   where s.opened_at <= v_pag.received_at
     and (s.closed_at is null or s.closed_at >= v_pag.received_at)
   order by s.opened_at desc limit 1
   for update;
  if v_sessao.id is null then
    return jsonb_build_object('ok', false, 'erro',
      'Nenhum caixa estava aberto quando esse dinheiro foi recebido.');
  end if;
  if v_sessao.status = 'closed' and not public.has_permission('cash.reopen') then
    return jsonb_build_object('ok', false, 'erro',
      'Esse dinheiro é de um caixa já fechado. Só quem pode corrigir caixa fechado faz isso.');
  end if;

  update public.payments set cash_session_id = v_sessao.id where id = v_pag.id;

  insert into public.cash_movements (
    cash_session_id, movement_type, direction, amount, order_id, payment_id, reason, created_by)
  values (v_sessao.id, 'sale_receipt', 'in', v_pag.amount, v_pag.order_id, v_pag.id,
    'Dinheiro que estava fora da gaveta', v_ator);

  if v_sessao.status = 'closed' then
    v_esperado := public.esperado_em_caixa(v_sessao.id);
    v_diferenca := v_sessao.counted_cash_amount - v_esperado;
    v_snapshot := jsonb_build_object(
      'esperado', v_sessao.expected_cash_amount, 'contado', v_sessao.counted_cash_amount,
      'diferenca', v_sessao.difference_amount, 'justificativa', v_sessao.difference_reason);

    update public.cash_sessions
       set expected_cash_amount = v_esperado,
           difference_amount = v_diferenca,
           difference_reason = case
             when v_diferenca <> 0 and (difference_reason is null or length(btrim(difference_reason)) < 3)
               then 'Correção: dinheiro que estava fora da gaveta'
             else difference_reason end
     where id = v_sessao.id;

    insert into public.cash_session_corrections (
      cash_session_id, correction_type, reason, before_snapshot, after_snapshot, created_by)
    values (v_sessao.id, 'cash_collected', 'Dinheiro que estava fora da gaveta', v_snapshot,
      jsonb_build_object('esperado', v_esperado, 'contado', v_sessao.counted_cash_amount,
                         'diferenca', v_diferenca, 'pagamento_id', v_pag.id,
                         'pedido_id', v_pag.order_id, 'valor', v_pag.amount),
      v_ator);
  end if;

  perform public.log_audit('caixa_dinheiro_entrou_na_gaveta', 'payments', v_pag.id, null,
    jsonb_build_object('valor', v_pag.amount, 'sessao_id', v_sessao.id,
                       'sessao_fechada', v_sessao.status = 'closed',
                       'esperado', v_esperado, 'diferenca', v_diferenca),
    null);

  return jsonb_build_object('ok', true, 'ja_existia', false, 'sessao_id', v_sessao.id,
    'sessao_fechada', v_sessao.status = 'closed', 'diferenca', v_diferenca);
end;
$$;

comment on function public.dinheiro_entrou_na_gaveta is
  'D-2026-10-27-171: o dinheiro registrado fora da gaveta entra no caixa do turno em que foi recebido; turno fechado é corrigido e o original guardado.';

revoke all on function public.dinheiro_entrou_na_gaveta(uuid) from public, anon;
grant execute on function public.dinheiro_entrou_na_gaveta(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Causas da diferença
-- ---------------------------------------------------------------------------
create or replace function public.causas_da_diferenca(p_sessao uuid default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_s record;
begin
  if not public.has_permission('cash.view') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para ver o caixa.');
  end if;

  select * into v_s from public.cash_sessions s
   where s.id = coalesce(p_sessao, (select s2.id from public.cash_sessions s2
                                     where s2.status = 'open' order by s2.opened_at desc limit 1));
  if v_s.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não encontrada.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'sessao_id', v_s.id,

    -- Dinheiro registrado com "entrou na gaveta" desmarcado e nunca recolhido.
    -- Todos, não só deste turno: o antigo corrige o caixa do dia dele.
    'fora_da_gaveta', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pagamento_id', p.id, 'pedido_id', o.id, 'numero', o.order_number,
               'cliente', o.customer_name_snapshot, 'valor', p.amount,
               'recebido_em', p.received_at,
               'deste_turno', t.id = v_s.id,
               'turno_id', t.id, 'turno_data', t.operational_date,
               'turno_fechado', t.status = 'closed')
             order by p.received_at)
        from public.payments p
        join public.orders o on o.id = p.order_id
        left join lateral (
          select s.id, s.operational_date, s.status from public.cash_sessions s
           where s.opened_at <= p.received_at
             and (s.closed_at is null or s.closed_at >= p.received_at)
           order by s.opened_at desc limit 1) t on true
       where p.status = 'confirmed' and p.cash_session_id is null
         and p.payment_method_family_snapshot = 'cash'
         and o.status not in ('cancelled', 'rejected')
         and p.responsible_driver_run_id is null
         and not exists (select 1 from public.driver_run_orders r where r.order_id = o.id)), '[]'::jsonb),

    -- O cliente escolheu dinheiro e ficou registrado outra forma, ou o contrário.
    'forma_diferente', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pedido_id', o.id, 'numero', o.order_number, 'cliente', o.customer_name_snapshot,
               'valor', p.amount, 'escolhida', i.payment_method_name_snapshot,
               'registrada', p.payment_method_name_snapshot)
             order by o.order_number)
        from public.payments p
        join public.orders o on o.id = p.order_id
        join public.order_payment_intents i on i.order_id = o.id
       where p.cash_session_id = v_s.id and p.status = 'confirmed'
         and (i.payment_method_family_snapshot = 'cash') <> (p.payment_method_family_snapshot = 'cash')), '[]'::jsonb),

    -- Vendas em dinheiro com troco: valor entregue digitado errado vira troco errado.
    'trocos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pedido_id', o.id, 'numero', o.order_number, 'valor', p.amount,
               'entregue', p.tendered_amount, 'troco', p.change_amount)
             order by o.order_number)
        from public.payments p
        join public.orders o on o.id = p.order_id
       where p.cash_session_id = v_s.id and p.status = 'confirmed'
         and p.payment_method_family_snapshot = 'cash' and coalesce(p.change_amount, 0) > 0), '[]'::jsonb),

    'saidas_registradas', (
      select count(*) from public.cash_movements m
       where m.cash_session_id = v_s.id and m.direction = 'out'
         and m.movement_type in ('withdrawal', 'expense', 'employee_advance'))
  );
end;
$$;

comment on function public.causas_da_diferenca is
  'D-2026-10-27-171: o que pode explicar a diferença de uma sessão de caixa. Só leitura.';

revoke all on function public.causas_da_diferenca(uuid) from public, anon;
grant execute on function public.causas_da_diferenca(uuid) to authenticated;
