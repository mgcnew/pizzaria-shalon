-- 0082 — A-19: adiantamento de funcionário pago em dinheiro pela gaveta
-- 04-REGRAS-NEGOCIO.md RN-EMPFIN-004 · 02 §12.3 e §13.3 · 03 §16.5
-- CLAUDE.md §25, §28, §34
--
-- UM FATO, DOIS LIVROS. Quando a Shalon adianta R$ 200 em dinheiro para o
-- funcionário, duas coisas aconteceram ao mesmo tempo: ele passou a ter um
-- lançamento no histórico dele, e saiu dinheiro físico da gaveta. Registrar
-- só um dos dois deixa o caixa mentindo ou o histórico incompleto.
--
-- POR QUE NÃO É SANGRIA. Sangria é a Shalon tirando o próprio dinheiro da
-- gaveta e levando para outro lugar dela — o cofre, o banco. Adiantamento é
-- dinheiro que sai para a mão de uma pessoa, e que a Shalon vai conferir
-- depois com ela. Os dois tiram dinheiro fisicamente, e é só isso que têm em
-- comum: somá-los no mesmo tipo apagaria a pergunta "quanto saiu para quem".
--
-- E NÃO É DESPESA, nem venda, nem diferença de caixa. Não altera
-- `employee_financial_profiles` e não desconta salário (RN-EMPFIN-003).

-- ------------------------------------------------------------- tipo próprio
alter table public.cash_movements drop constraint cash_movements_tipo;
alter table public.cash_movements add constraint cash_movements_tipo check (
  movement_type in ('opening', 'sale_receipt', 'supply', 'withdrawal',
                    'expense', 'refund', 'adjustment', 'other',
                    'employee_advance'));

alter table public.cash_movements drop constraint cash_movements_sentido_do_tipo;
alter table public.cash_movements add constraint cash_movements_sentido_do_tipo check (
  (movement_type = 'opening'          and direction = 'in')
  or (movement_type = 'sale_receipt'     and direction = 'in')
  or (movement_type = 'supply'           and direction = 'in')
  or (movement_type = 'withdrawal'       and direction = 'out')
  or (movement_type = 'expense'          and direction = 'out')
  -- Adiantamento SAI. Um adiantamento que entra dinheiro seria devolução, e
  -- devolução é outro fato.
  or (movement_type = 'employee_advance' and direction = 'out')
  or (movement_type in ('refund', 'adjustment', 'other'))
);

alter table public.cash_movements drop constraint cash_movements_motivo_quando_exigido;
alter table public.cash_movements add constraint cash_movements_motivo_quando_exigido check (
  movement_type not in ('withdrawal', 'adjustment', 'other', 'employee_advance')
  or (reason is not null and length(btrim(reason)) >= 3)
);

-- ------------------------------------------------------------- o vínculo
-- O elo que permite reconstruir os dois lados do mesmo fato. Fica no
-- movimento porque o movimento nasce depois do lançamento, e assim não há
-- referência circular entre as duas tabelas.
alter table public.cash_movements
  add column employee_ledger_entry_id uuid
    references public.employee_ledger_entries (id) on delete restrict;

create index cash_movements_lancamento_funcionario
  on public.cash_movements (employee_ledger_entry_id)
  where employee_ledger_entry_id is not null;

comment on column public.cash_movements.employee_ledger_entry_id is
  'RN-EMPFIN-004: lançamento do funcionário que este movimento físico paga. Os dois nascem e morrem juntos.';

-- RN-EMPFIN-001 prevê registrar a forma de pagamento do adiantamento. Quando
-- é pela gaveta, é dinheiro por definição; quando não é, a Shalon diz qual foi.
alter table public.employee_ledger_entries
  add column payment_method_id uuid references public.payment_methods (id) on delete set null,
  add column payment_method_name_snapshot text;

comment on column public.employee_ledger_entries.payment_method_name_snapshot is
  'Snapshot: renomear a forma depois NÃO reescreve o lançamento.';

-- ==================================================== lançar no funcionário
create or replace function public.lancar_no_funcionario(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_tipo text := nullif(p_dados ->> 'tipo', '');
  v_funcionario uuid;
  v_valor numeric;
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_idem uuid;
  v_qtd integer;
  v_mov uuid;
  v_corrida uuid;
  v_id uuid;
  v_func record;
  v_pelo_caixa boolean := coalesce((p_dados ->> 'pelo_caixa')::boolean, false);
  v_forma record;
  v_forma_id uuid;
  v_sessao uuid;
  v_mov_caixa uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  -- §18.2 e RN-FUNC-003: registrar consumo NÃO abre este livro. Quem lança
  -- aqui é quem administra o financeiro do funcionário.
  if not public.has_permission('employees.finance.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para lançar no histórico do funcionário.');
  end if;

  if v_tipo not in ('consumption', 'advance', 'discrepancy', 'adjustment', 'other') then
    return jsonb_build_object('ok', false, 'erro', 'Tipo de lançamento inválido.');
  end if;
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo.');
  end if;

  begin
    v_idem := nullif(p_dados ->> 'idempotency_key', '')::uuid;
  exception when others then
    v_idem := null;
  end;
  if v_idem is not null then
    select count(*) into v_qtd from public.employee_ledger_entries l
      where l.idempotency_key = v_idem;
    if v_qtd > 0 then
      return jsonb_build_object('ok', true, 'ja_existia', true);
    end if;
  end if;

  v_funcionario := nullif(p_dados ->> 'funcionario_id', '')::uuid;
  select * into v_func from public.employees e where e.id = v_funcionario;
  if v_func.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Funcionário não encontrado.');
  end if;

  v_valor := nullif(p_dados ->> 'valor', '')::numeric;
  if v_valor is null or v_valor <= 0 then
    return jsonb_build_object('ok', false, 'erro', 'Informe um valor maior que zero.');
  end if;
  if v_valor <> round(v_valor, 2) then
    return jsonb_build_object('ok', false, 'erro', 'Valor com mais de dois decimais.');
  end if;

  v_mov := nullif(p_dados ->> 'movimento_id', '')::uuid;
  v_corrida := nullif(p_dados ->> 'corrida_id', '')::uuid;

  if v_mov is not null and not exists (
    select 1 from public.internal_product_movements m
     where m.id = v_mov and m.status = 'confirmed') then
    return jsonb_build_object('ok', false, 'erro',
      'O movimento interno informado não existe ou foi estornado.');
  end if;
  if v_corrida is not null and not exists (
    select 1 from public.driver_runs r where r.id = v_corrida and r.status = 'settled') then
    return jsonb_build_object('ok', false, 'erro',
      'A corrida informada não existe ou ainda não foi acertada.');
  end if;

  -- ---------------------------------------------- adiantamento pela gaveta
  if v_pelo_caixa then
    -- Só adiantamento tira dinheiro da gaveta. Consumo, diferença e ajuste
    -- são conferência: não houve dinheiro saindo agora.
    if v_tipo <> 'advance' then
      return jsonb_build_object('ok', false, 'erro',
        'Só adiantamento é pago pela gaveta. Os demais lançamentos são de conferência.');
    end if;
    -- Tirar dinheiro do caixa é ato de caixa, e exige a permissão de caixa
    -- além da financeira. Sem isto, uma permissão abriria a outra.
    if not public.has_permission('cash.adjust') then
      return jsonb_build_object('ok', false, 'erro',
        'Você não tem permissão para retirar dinheiro do caixa.');
    end if;
    -- RN-CAIXA-003: dinheiro físico sai de uma gaveta aberta. Sem sessão, o
    -- valor sairia de lugar nenhum.
    select s.id into v_sessao from public.cash_sessions s
      where s.status = 'open' order by s.opened_at desc limit 1;
    if v_sessao is null then
      return jsonb_build_object('ok', false, 'sem_caixa', true, 'erro',
        'Não há caixa aberto. Abra o caixa para pagar o adiantamento em dinheiro.');
    end if;
    if v_valor > public.esperado_em_caixa(v_sessao) then
      return jsonb_build_object('ok', false, 'erro',
        'O adiantamento é maior que o dinheiro que deveria haver na gaveta.');
    end if;
    select * into v_forma from public.payment_methods m where m.payment_family = 'cash' limit 1;
    v_forma_id := v_forma.id;
  else
    v_forma_id := nullif(p_dados ->> 'forma_id', '')::uuid;
    if v_forma_id is not null then
      select * into v_forma from public.payment_methods m where m.id = v_forma_id;
      if v_forma.id is null then
        return jsonb_build_object('ok', false, 'erro', 'Forma de pagamento inválida.');
      end if;
    end if;
  end if;

  begin
    insert into public.employee_ledger_entries (
      employee_id, entry_type, amount, occurred_at, reason, notes,
      related_driver_run_id, related_internal_movement_id,
      attachment_asset_id, created_by, authorized_by, idempotency_key,
      payment_method_id, payment_method_name_snapshot)
    values (
      v_funcionario, v_tipo, v_valor,
      coalesce(nullif(p_dados ->> 'quando', '')::timestamptz, now()),
      v_motivo, nullif(btrim(coalesce(p_dados ->> 'observacao', '')), ''),
      v_corrida, v_mov,
      nullif(p_dados ->> 'anexo_id', '')::uuid,
      v_ator, v_ator, v_idem,
      v_forma_id, v_forma.name)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'ja_lancado', true, 'erro',
      'Este movimento ou corrida já tem lançamento no histórico do funcionário.');
  end;

  -- O SEGUNDO LADO DO MESMO FATO. Está na mesma transação da RPC: se este
  -- insert falhar, o lançamento acima não fica (CLAUDE.md §34).
  if v_pelo_caixa then
    insert into public.cash_movements (
      cash_session_id, movement_type, direction, amount,
      reason, created_by, employee_ledger_entry_id)
    values (v_sessao, 'employee_advance', 'out', v_valor,
      format('Adiantamento a %s — %s', v_func.full_name, v_motivo),
      v_ator, v_id)
    returning id into v_mov_caixa;
  end if;

  perform public.log_audit('funcionario_lancamento_' || v_tipo,
    'employee_ledger_entries', v_id, null,
    jsonb_build_object('funcionario_id', v_funcionario, 'valor', v_valor,
                       'corrida', v_corrida, 'movimento', v_mov,
                       'pelo_caixa', v_pelo_caixa,
                       'cash_movement_id', v_mov_caixa),
    v_motivo);

  -- RN-EMPFIN-003: isto NÃO desconta salário, não calcula encargo e não gera
  -- folha. É conferência gerencial, e o salário continua noutra tabela.
  return jsonb_build_object('ok', true, 'ja_existia', false, 'lancamento_id', v_id,
    'movimento_caixa_id', v_mov_caixa,
    'esperado', case when v_pelo_caixa then public.esperado_em_caixa(v_sessao) end);
end;
$$;

comment on function public.lancar_no_funcionario is
  'RN-EMPFIN-002/003/004: conferência gerencial. Adiantamento pela gaveta cria o movimento físico junto, atomicamente. Não desconta salário nem gera folha.';

revoke all on function public.lancar_no_funcionario(jsonb) from public, anon;
grant execute on function public.lancar_no_funcionario(jsonb) to authenticated;

-- ================================================ reverter os dois juntos
create or replace function public.reverter_lancamento_funcionario(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_lanc record;
  v_mov record;
  v_sessao record;
  v_comp uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('employees.finance.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para estornar lançamentos do funcionário.');
  end if;
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo do estorno.');
  end if;

  select * into v_lanc from public.employee_ledger_entries l where l.id = p_id for update;
  if v_lanc.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Lançamento não encontrado.');
  end if;
  if v_lanc.status = 'reversed' then
    return jsonb_build_object('ok', false, 'ja_revertido', true,
      'erro', 'Este lançamento já foi estornado.');
  end if;

  -- O outro lado do fato, se existir.
  select * into v_mov from public.cash_movements m
    where m.employee_ledger_entry_id = p_id and m.reverses_movement_id is null
    for update;

  if v_mov.id is not null then
    -- Estornar só o lançamento deixaria a gaveta acreditando que o dinheiro
    -- saiu por um fato que não existe mais. Os dois voltam, ou nenhum volta.
    if not public.has_permission('cash.adjust') then
      return jsonb_build_object('ok', false, 'erro',
        'Este adiantamento saiu da gaveta. Estorná-lo exige também permissão de caixa.');
    end if;
    if v_mov.reversed_at is not null then
      return jsonb_build_object('ok', false, 'erro',
        'O movimento de caixa deste adiantamento já foi estornado. Verifique o extrato.');
    end if;

    -- RN-CAIXA-015: sessão fechada não se edita por dentro.
    select * into v_sessao from public.cash_sessions s
      where s.id = v_mov.cash_session_id for update;
    if v_sessao.status <> 'open' then
      return jsonb_build_object('ok', false, 'caixa_fechado', true, 'erro',
        'O caixa que pagou este adiantamento já foi fechado. Reabra o caixa para corrigi-lo.');
    end if;

    -- Compensatório vinculado, como em toda reversão de caixa da Fase 7: o
    -- original permanece no extrato.
    insert into public.cash_movements (
      cash_session_id, movement_type, direction, amount,
      reason, created_by, reverses_movement_id, employee_ledger_entry_id)
    values (v_mov.cash_session_id, 'adjustment', 'in', v_mov.amount,
      v_motivo, v_ator, v_mov.id, p_id)
    returning id into v_comp;

    update public.cash_movements
       set reversed_at = now(), reversed_by = v_ator, reversal_reason = v_motivo
     where id = v_mov.id;
  end if;

  update public.employee_ledger_entries
     set status = 'reversed', reversed_by = v_ator,
         reversed_at = now(), reversal_reason = v_motivo
   where id = p_id;

  perform public.log_audit('funcionario_lancamento_estornar',
    'employee_ledger_entries', p_id,
    jsonb_build_object('status', 'confirmed', 'valor', v_lanc.amount,
                       'tipo', v_lanc.entry_type,
                       'cash_movement_id', v_mov.id),
    jsonb_build_object('status', 'reversed', 'compensatorio_id', v_comp),
    v_motivo);

  return jsonb_build_object('ok', true, 'compensatorio_id', v_comp,
    'esperado', case when v_mov.id is not null
                     then public.esperado_em_caixa(v_mov.cash_session_id) end);
end;
$$;

comment on function public.reverter_lancamento_funcionario is
  'RN-EMPFIN-004: estorna o lançamento e, quando houve pagamento pela gaveta, o movimento físico junto. Nunca metade.';

revoke all on function public.reverter_lancamento_funcionario(uuid, text) from public, anon;
grant execute on function public.reverter_lancamento_funcionario(uuid, text) to authenticated;

-- ============================ o caixa não estorna metade do fato sozinho
-- Sem este guarda, alguém com `finance.reverse` estornaria o movimento pelo
-- extrato e deixaria o adiantamento vivo no histórico do funcionário — o
-- exato meio-estorno que A-19 proíbe.
create or replace function public.reverter_movimento_caixa(p_movimento uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_mov record;
  v_sessao record;
  v_id uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('finance.reverse') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para estornar.');
  end if;
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo do estorno.');
  end if;

  select * into v_mov from public.cash_movements m where m.id = p_movimento for update;
  if v_mov.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Movimento não encontrado.');
  end if;
  -- CLAUDE.md §34: duplo estorno.
  if v_mov.reversed_at is not null then
    return jsonb_build_object('ok', false, 'ja_revertido', true,
      'erro', 'Este movimento já foi estornado.');
  end if;
  if v_mov.reverses_movement_id is not null then
    return jsonb_build_object('ok', false, 'erro',
      'Um estorno não é estornado. Registre um novo movimento.');
  end if;

  -- A-19: este movimento é metade de um fato de dois lados.
  if v_mov.employee_ledger_entry_id is not null then
    return jsonb_build_object('ok', false, 'tem_lancamento', true, 'erro',
      'Este movimento é o pagamento de um adiantamento. Estorne o adiantamento no histórico do funcionário, e os dois voltam juntos.');
  end if;

  -- RN-CAIXA-015: sessão fechada não se edita. Estornar dentro dela mudaria
  -- um fechamento já assinado — o caminho para isso é a reabertura.
  select * into v_sessao from public.cash_sessions s where s.id = v_mov.cash_session_id for update;
  if v_sessao.status <> 'open' then
    return jsonb_build_object('ok', false, 'caixa_fechado', true,
      'erro', 'O caixa desse movimento já foi fechado. Reabra o caixa para corrigi-lo.');
  end if;

  -- O compensatório vai para o lado oposto, vinculado ao original.
  insert into public.cash_movements (
    cash_session_id, movement_type, direction, amount,
    order_id, payment_id, financial_entry_id,
    reason, created_by, reverses_movement_id)
  values (v_mov.cash_session_id, 'adjustment',
    case when v_mov.direction = 'in' then 'out' else 'in' end,
    v_mov.amount, v_mov.order_id, v_mov.payment_id, v_mov.financial_entry_id,
    v_motivo, v_ator, v_mov.id)
  returning id into v_id;

  update public.cash_movements
     set reversed_at = now(), reversed_by = v_ator, reversal_reason = v_motivo
   where id = v_mov.id;

  perform public.log_audit('caixa_estornar_movimento', 'cash_movements', v_mov.id,
    jsonb_build_object('tipo', v_mov.movement_type, 'sentido', v_mov.direction,
                       'valor', v_mov.amount),
    jsonb_build_object('compensatorio_id', v_id), v_motivo);

  return jsonb_build_object('ok', true, 'compensatorio_id', v_id,
    'esperado', public.esperado_em_caixa(v_mov.cash_session_id));
end;
$$;

comment on function public.reverter_movimento_caixa is 'RN-FIN-003/004: o original permanece e ganha um compensatório vinculado. Adiantamento se estorna pelo histórico do funcionário.';

revoke all on function public.reverter_movimento_caixa(uuid, text) from public, anon;
grant execute on function public.reverter_movimento_caixa(uuid, text) to authenticated;

-- ------------------------------------------- o livro mostra os dois lados
create or replace function public.historico_do_funcionario(
  p_funcionario uuid, p_limite integer default 100)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'funcionario_id', p_funcionario,
    'lancamentos', coalesce((
      select jsonb_agg(t.linha order by t.occurred_at desc)
        from (
          select l.occurred_at,
                 jsonb_build_object(
                   'lancamento_id', l.id,
                   'tipo', l.entry_type,
                   'valor', l.amount::numeric(12,2),
                   'quando', l.occurred_at,
                   'motivo', l.reason,
                   'observacao', l.notes,
                   'status', l.status,
                   'forma_pagamento', l.payment_method_name_snapshot,
                   'corrida_id', l.related_driver_run_id,
                   'movimento_id', l.related_internal_movement_id,
                   'anexo_id', l.attachment_asset_id,
                   -- RN-EMPFIN-004: o outro lado do mesmo fato.
                   'movimento_caixa_id', (
                       select m.id from public.cash_movements m
                        where m.employee_ledger_entry_id = l.id
                          and m.reverses_movement_id is null),
                   'pago_pela_gaveta', exists (
                       select 1 from public.cash_movements m
                        where m.employee_ledger_entry_id = l.id
                          and m.reverses_movement_id is null),
                   'estornado_em', l.reversed_at,
                   'motivo_do_estorno', l.reversal_reason) as linha
            from public.employee_ledger_entries l
           where l.employee_id = p_funcionario
           order by l.occurred_at desc
           limit greatest(coalesce(p_limite, 100), 1)
        ) t), '[]'::jsonb),
    -- Somatório de CONFERÊNCIA. Não é saldo devedor exigível, não desconta
    -- de salário nenhum e não vira folha (RN-EMPFIN-003).
    'total_confirmado', coalesce((
      select sum(l.amount) from public.employee_ledger_entries l
       where l.employee_id = p_funcionario and l.status = 'confirmed'), 0)::numeric(12,2)
  );
$$;

comment on function public.historico_do_funcionario is
  'RN-EMPFIN-001/003/004: consumo, adiantamento e diferença. Nunca salário. Nunca desconto automático.';

revoke all on function public.historico_do_funcionario(uuid, integer) from public, anon;
grant execute on function public.historico_do_funcionario(uuid, integer) to authenticated;
