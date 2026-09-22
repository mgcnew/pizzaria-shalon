-- 0084 — Defeito: `v_forma` era lido sem ter sido atribuído
-- Encontrado pelo teste do complemento (`equipe_fase8b.sql`).
--
-- Em `lancar_no_funcionario`, `v_forma` é um `record` preenchido por um
-- SELECT que só acontece em dois dos três caminhos. No terceiro — lançamento
-- de conferência, sem `pelo_caixa` e sem forma informada — o INSERT lia
-- `v_forma.name` de um record nunca atribuído, e o PL/pgSQL recusa
-- (55000): "the tuple structure of a not-yet-assigned record is
-- indeterminate".
--
-- Consequência: NENHUM lançamento de consumo ou diferença era gravado. É o
-- mesmo defeito que a Fase 7 teve em `registrar_lancamento`, e a correção é
-- a mesma — variável escalar em vez de record, porque só o nome interessa.

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
  -- Escalar, não record: nos caminhos em que não há forma de pagamento, o
  -- valor é simplesmente nulo.
  v_forma_id uuid;
  v_forma_nome text;
  v_sessao uuid;
  v_mov_caixa uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
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

  if v_pelo_caixa then
    if v_tipo <> 'advance' then
      return jsonb_build_object('ok', false, 'erro',
        'Só adiantamento é pago pela gaveta. Os demais lançamentos são de conferência.');
    end if;
    if not public.has_permission('cash.adjust') then
      return jsonb_build_object('ok', false, 'erro',
        'Você não tem permissão para retirar dinheiro do caixa.');
    end if;
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
    select m.id, m.name into v_forma_id, v_forma_nome
      from public.payment_methods m where m.payment_family = 'cash' limit 1;
  else
    v_forma_id := nullif(p_dados ->> 'forma_id', '')::uuid;
    if v_forma_id is not null then
      select m.name into v_forma_nome from public.payment_methods m where m.id = v_forma_id;
      if v_forma_nome is null then
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
      v_forma_id, v_forma_nome)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'ja_lancado', true, 'erro',
      'Este movimento ou corrida já tem lançamento no histórico do funcionário.');
  end;

  -- O SEGUNDO LADO DO MESMO FATO. Mesma transação: se este insert falhar, o
  -- lançamento acima não fica (CLAUDE.md §34).
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
