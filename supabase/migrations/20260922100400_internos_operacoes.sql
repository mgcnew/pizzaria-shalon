-- 0076 — Operações internas: cortesia, consumo, perda e o livro do funcionário
-- 04-REGRAS-NEGOCIO.md RN-CONS-001..005, RN-CORT-001/002, RN-PERDA-001/002,
-- RN-CLASS-001, RN-EMPFIN-001..003, RN-RUN-005/006 · CLAUDE.md §17, §27, §34
--
-- O PREÇO VEM DE `montar_item`, a MESMA autoridade do cardápio, do balcão e
-- da alteração (CLAUDE.md §17: não duplicar a fórmula). Um consumo de
-- funcionário é uma pizza montada como qualquer outra — o que muda é que ela
-- não vira venda. Criar um terceiro jeito de montar item produziria um
-- terceiro preço para a mesma pizza.
--
-- E O VALOR QUE ELE DEVOLVE É "DE REFERÊNCIA". Serve para dimensionar o
-- movimento no relatório, não para cobrar de ninguém e não para faturar.

alter table public.internal_product_movements add column idempotency_key uuid;
create unique index internal_movements_idempotencia
  on public.internal_product_movements (idempotency_key)
  where idempotency_key is not null;

alter table public.employee_ledger_entries add column idempotency_key uuid;
create unique index employee_ledger_idempotencia
  on public.employee_ledger_entries (idempotency_key)
  where idempotency_key is not null;

-- =================================================== movimento interno
create or replace function public.registrar_movimento_interno(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_tipo text := nullif(p_dados ->> 'tipo', '');
  v_funcionario uuid;
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_idem uuid;
  v_qtd integer;
  v_item jsonb;
  v_res jsonb;
  v_det jsonb;
  v_id uuid;
  v_total numeric := 0;
  v_linhas integer := 0;
  v_func record;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('internal.register') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para registrar movimentos internos.');
  end if;

  if v_tipo not in ('courtesy', 'employee_consumption', 'owner_consumption', 'loss') then
    return jsonb_build_object('ok', false, 'erro', 'Tipo de movimento inválido.');
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
    select count(*) into v_qtd from public.internal_product_movements m
      where m.idempotency_key = v_idem;
    if v_qtd > 0 then
      return jsonb_build_object('ok', true, 'ja_existia', true);
    end if;
  end if;

  begin
    v_funcionario := nullif(p_dados ->> 'funcionario_id', '')::uuid;
  exception when others then
    v_funcionario := null;
  end;

  -- RN-CONS-001: consumo de funcionário tem dono, e o dono existe.
  if v_tipo = 'employee_consumption' and v_funcionario is null then
    return jsonb_build_object('ok', false, 'erro', 'Escolha o funcionário.');
  end if;
  if v_funcionario is not null then
    select * into v_func from public.employees e where e.id = v_funcionario;
    if v_func.id is null then
      return jsonb_build_object('ok', false, 'erro', 'Funcionário não encontrado.');
    end if;
  end if;
  -- Cortesia e perda não têm funcionário: com um, pareceriam consumo, que é
  -- a confusão que RN-CLASS-001 manda evitar.
  if v_tipo in ('courtesy', 'loss') and v_funcionario is not null then
    return jsonb_build_object('ok', false, 'erro',
      'Cortesia e perda não são vinculadas a funcionário.');
  end if;
  -- RN-CORT-002: cortesia exige autorizador. Quem registra pode ser o
  -- próprio autorizador, mas alguém tem de assinar embaixo.
  if v_tipo = 'courtesy' and nullif(p_dados ->> 'autorizado_por', '') is null then
    return jsonb_build_object('ok', false, 'erro', 'Cortesia exige um autorizador.');
  end if;

  if jsonb_typeof(p_dados -> 'itens') <> 'array'
     or jsonb_array_length(p_dados -> 'itens') = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Informe ao menos um item.');
  end if;

  -- Valida TODOS antes de gravar QUALQUER um.
  for v_item in select * from jsonb_array_elements(p_dados -> 'itens') loop
    v_res := public.montar_item(v_item);
    if not (v_res ->> 'ok')::boolean then
      return jsonb_build_object('ok', false,
        'erro', format('%s: %s', coalesce(v_res ->> 'nome', 'Item'), v_res ->> 'erro'));
    end if;
  end loop;

  insert into public.internal_product_movements (
    movement_type, employee_id, reason, authorized_by, occurred_at,
    attachment_asset_id, notes, created_by, idempotency_key)
  values (
    v_tipo, v_funcionario, v_motivo,
    nullif(p_dados ->> 'autorizado_por', '')::uuid,
    coalesce(nullif(p_dados ->> 'quando', '')::timestamptz, now()),
    nullif(p_dados ->> 'anexo_id', '')::uuid,
    nullif(btrim(coalesce(p_dados ->> 'observacao', '')), ''),
    v_ator, v_idem)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_dados -> 'itens') loop
    v_res := public.montar_item(v_item);
    v_det := v_res -> 'detalhe';

    insert into public.internal_product_movement_items (
      movement_id, product_id, variant_id,
      product_name_snapshot, size_name_snapshot,
      quantity, reference_unit_price, observation)
    values (
      v_id,
      (v_det ->> 'produto_id')::uuid,
      nullif(v_det ->> 'tamanho_id', '')::uuid,
      v_det ->> 'produto_nome',
      nullif(v_det ->> 'tamanho_nome', ''),
      (v_res ->> 'quantidade')::numeric,
      (v_res ->> 'preco_unitario')::numeric,
      nullif(btrim(coalesce(v_item ->> 'observacao', '')), ''));

    v_total := v_total + (v_res ->> 'total')::numeric;
    v_linhas := v_linhas + 1;
  end loop;

  perform public.log_audit('interno_' || v_tipo, 'internal_product_movements', v_id, null,
    jsonb_build_object('itens', v_linhas, 'valor_referencia', v_total::numeric(12,2),
                       'funcionario_id', v_funcionario),
    v_motivo);

  -- NÃO cria lançamento no livro do funcionário. Quem decide que este
  -- consumo vira dívida é alguém com permissão financeira, num ato separado
  -- (RN-RUN-006 aplicado por analogia, §18.2).
  return jsonb_build_object('ok', true, 'ja_existia', false,
    'movimento_id', v_id, 'itens', v_linhas,
    'valor_referencia', v_total::numeric(12,2));
end;
$$;

comment on function public.registrar_movimento_interno is
  'RN-CLASS-001: saída de produto que não é venda. Preço vem de `montar_item` e é de referência.';

revoke all on function public.registrar_movimento_interno(jsonb) from public, anon;
grant execute on function public.registrar_movimento_interno(jsonb) to authenticated;

-- ---------------------------------------------- reverter movimento interno
create or replace function public.reverter_movimento_interno(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_mov record;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('internal.register') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para estornar movimentos internos.');
  end if;
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo do estorno.');
  end if;

  select * into v_mov from public.internal_product_movements m where m.id = p_id for update;
  if v_mov.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Movimento não encontrado.');
  end if;
  if v_mov.status = 'reversed' then
    return jsonb_build_object('ok', false, 'ja_revertido', true,
      'erro', 'Este movimento já foi estornado.');
  end if;

  -- Se o movimento já virou lançamento no livro do funcionário, estornar só
  -- ele deixaria a dívida de pé sem o fato que a originou. O financeiro vem
  -- primeiro, e é de quem tem a permissão dele.
  if exists (select 1 from public.employee_ledger_entries l
              where l.related_internal_movement_id = p_id and l.status = 'confirmed') then
    return jsonb_build_object('ok', false, 'tem_lancamento', true, 'erro',
      'Este movimento já virou lançamento no histórico do funcionário. Estorne o lançamento primeiro.');
  end if;

  update public.internal_product_movements
     set status = 'reversed', reversed_by = v_ator,
         reversed_at = now(), reversal_reason = v_motivo
   where id = p_id;

  perform public.log_audit('interno_estornar', 'internal_product_movements', p_id,
    jsonb_build_object('status', 'confirmed', 'tipo', v_mov.movement_type),
    jsonb_build_object('status', 'reversed'), v_motivo);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.reverter_movimento_interno(uuid, text) from public, anon;
grant execute on function public.reverter_movimento_interno(uuid, text) to authenticated;

-- ================================================ livro do funcionário
-- Adiantamento, consumo lançado, diferença autorizada. Sempre um ATO
-- EXPLÍCITO de quem tem permissão financeira — nunca efeito colateral.
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

  begin
    insert into public.employee_ledger_entries (
      employee_id, entry_type, amount, occurred_at, reason, notes,
      related_driver_run_id, related_internal_movement_id,
      attachment_asset_id, created_by, authorized_by, idempotency_key)
    values (
      v_funcionario, v_tipo, v_valor,
      coalesce(nullif(p_dados ->> 'quando', '')::timestamptz, now()),
      v_motivo, nullif(btrim(coalesce(p_dados ->> 'observacao', '')), ''),
      v_corrida, v_mov,
      nullif(p_dados ->> 'anexo_id', '')::uuid,
      v_ator, v_ator, v_idem)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'ja_lancado', true, 'erro',
      'Este movimento ou corrida já tem lançamento no histórico do funcionário.');
  end;

  perform public.log_audit('funcionario_lancamento_' || v_tipo,
    'employee_ledger_entries', v_id, null,
    jsonb_build_object('funcionario_id', v_funcionario, 'valor', v_valor,
                       'corrida', v_corrida, 'movimento', v_mov),
    v_motivo);

  -- RN-EMPFIN-003: isto NÃO desconta salário, não calcula encargo e não gera
  -- folha. É conferência gerencial, e o salário continua noutra tabela.
  return jsonb_build_object('ok', true, 'ja_existia', false, 'lancamento_id', v_id);
end;
$$;

comment on function public.lancar_no_funcionario is
  'RN-EMPFIN-002/003: conferência gerencial. Não desconta salário nem gera folha.';

revoke all on function public.lancar_no_funcionario(jsonb) from public, anon;
grant execute on function public.lancar_no_funcionario(jsonb) to authenticated;

-- --------------------------------------------- reverter lançamento
create or replace function public.reverter_lancamento_funcionario(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_lanc record;
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

  update public.employee_ledger_entries
     set status = 'reversed', reversed_by = v_ator,
         reversed_at = now(), reversal_reason = v_motivo
   where id = p_id;

  perform public.log_audit('funcionario_lancamento_estornar',
    'employee_ledger_entries', p_id,
    jsonb_build_object('status', 'confirmed', 'valor', v_lanc.amount,
                       'tipo', v_lanc.entry_type),
    jsonb_build_object('status', 'reversed'), v_motivo);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.reverter_lancamento_funcionario(uuid, text) from public, anon;
grant execute on function public.reverter_lancamento_funcionario(uuid, text) to authenticated;
