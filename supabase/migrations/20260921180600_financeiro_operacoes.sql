-- 0067 — Operações financeiras: categorias, entradas, despesas e estorno
-- 04-REGRAS-NEGOCIO.md RN-FIN-001..005, RN-CAIXA-010 · 03 §17 · CLAUDE.md §27, §28
--
-- DESPESA NÃO É SANGRIA, e a diferença aparece aqui em duas escritas
-- distintas: o LANÇAMENTO (`financial_entries`) diz que houve um gasto, com
-- categoria e motivo; o MOVIMENTO (`cash_movements`) diz que saiu dinheiro da
-- gaveta. Uma conta paga por transferência gera o primeiro e não o segundo.
-- Uma sangria gera o segundo e não o primeiro — porque sangria não é gasto,
-- é dinheiro mudando de lugar (RN-CAIXA-008/010).

-- ========================================================== categorias
-- RN-FIN-001: configuráveis por usuário autorizado. `finance.create` é a
-- permissão de escrita do módulo financeiro e é quem a Shalon concede a
-- quem cuida do dinheiro — não criei permissão nova para isto.
create or replace function public.salvar_categoria_financeira(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_id uuid;
  v_nome text := nullif(btrim(coalesce(p_dados ->> 'nome', '')), '');
  v_tipo text := nullif(p_dados ->> 'tipo', '');
  v_ativa boolean := coalesce((p_dados ->> 'ativa')::boolean, true);
  v_antes jsonb;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('finance.create') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para gerenciar categorias.');
  end if;
  if v_nome is null or length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'erro', 'Informe o nome da categoria.');
  end if;
  if v_tipo not in ('income', 'expense', 'both') then
    return jsonb_build_object('ok', false, 'erro', 'Informe se a categoria é de entrada, despesa ou ambas.');
  end if;

  begin
    v_id := nullif(p_dados ->> 'id', '')::uuid;
  exception when others then
    v_id := null;
  end;

  if v_id is null then
    begin
      insert into public.financial_categories (name, kind, is_active, sort_order)
      values (v_nome, v_tipo, v_ativa, coalesce((p_dados ->> 'ordem')::integer, 0))
      returning id into v_id;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'erro', 'Já existe uma categoria com esse nome.');
    end;

    perform public.log_audit('financeiro_categoria_criar', 'financial_categories', v_id,
      null, jsonb_build_object('nome', v_nome, 'tipo', v_tipo), null);
  else
    select jsonb_build_object('nome', c.name, 'tipo', c.kind, 'ativa', c.is_active)
      into v_antes from public.financial_categories c where c.id = v_id;
    if v_antes is null then
      return jsonb_build_object('ok', false, 'erro', 'Categoria não encontrada.');
    end if;

    begin
      update public.financial_categories
         set name = v_nome, kind = v_tipo, is_active = v_ativa,
             sort_order = coalesce((p_dados ->> 'ordem')::integer, sort_order)
       where id = v_id;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'erro', 'Já existe uma categoria com esse nome.');
    end;

    perform public.log_audit('financeiro_categoria_editar', 'financial_categories', v_id,
      v_antes, jsonb_build_object('nome', v_nome, 'tipo', v_tipo, 'ativa', v_ativa), null);
  end if;

  return jsonb_build_object('ok', true, 'categoria_id', v_id);
end;
$$;

comment on function public.salvar_categoria_financeira is 'RN-FIN-001: plano de contas configurável. Categoria nunca é apagada — é desativada.';

revoke all on function public.salvar_categoria_financeira(jsonb) from public, anon;
grant execute on function public.salvar_categoria_financeira(jsonb) to authenticated;

-- ======================================================= lançamento
create or replace function public.registrar_lancamento(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_tipo text := nullif(p_dados ->> 'tipo', '');
  v_cat record;
  v_valor numeric;
  v_descricao text := nullif(btrim(coalesce(p_dados ->> 'descricao', '')), '');
  v_pelo_caixa boolean := coalesce((p_dados ->> 'pelo_caixa')::boolean, false);
  v_forma_id uuid;
  v_forma_nome text;
  v_sessao_id uuid;
  v_idem uuid;
  v_qtd integer;
  v_id uuid;
  v_corrige uuid;
  v_mov uuid;
  v_quando timestamptz;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('finance.create') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para lançar movimentação financeira.');
  end if;

  if v_tipo not in ('income', 'expense') then
    return jsonb_build_object('ok', false, 'erro', 'Informe se é entrada ou despesa.');
  end if;

  begin
    v_idem := nullif(p_dados ->> 'idempotency_key', '')::uuid;
  exception when others then
    v_idem := null;
  end;
  if v_idem is not null then
    select count(*) into v_qtd from public.cash_movements m where m.idempotency_key = v_idem;
    if v_qtd > 0 then
      return jsonb_build_object('ok', true, 'ja_existia', true);
    end if;
  end if;

  select * into v_cat from public.financial_categories c
    where c.id = nullif(p_dados ->> 'categoria_id', '')::uuid and c.is_active;
  if v_cat.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Escolha uma categoria ativa.');
  end if;
  -- Categoria de despesa não recebe entrada, e vice-versa. `both` aceita as
  -- duas — é a categoria genérica que a Shalon pode querer.
  if v_cat.kind <> 'both' and v_cat.kind <> v_tipo then
    return jsonb_build_object('ok', false, 'erro',
      format('A categoria "%s" não aceita esse tipo de lançamento.', v_cat.name));
  end if;

  v_valor := nullif(p_dados ->> 'valor', '')::numeric;
  if v_valor is null or v_valor <= 0 then
    return jsonb_build_object('ok', false, 'erro', 'Informe um valor maior que zero.');
  end if;
  if v_valor <> round(v_valor, 2) then
    return jsonb_build_object('ok', false, 'erro', 'Valor com mais de dois decimais.');
  end if;
  if v_descricao is null or length(v_descricao) < 3 then
    return jsonb_build_object('ok', false, 'erro', 'Descreva o lançamento.');
  end if;

  v_quando := coalesce(nullif(p_dados ->> 'quando', '')::timestamptz, now());

  if nullif(p_dados ->> 'forma_id', '') is not null then
    select m.id, m.name into v_forma_id, v_forma_nome
      from public.payment_methods m
      where m.id = (p_dados ->> 'forma_id')::uuid and m.is_active;
    if v_forma_id is null then
      return jsonb_build_object('ok', false, 'erro', 'Forma de pagamento inválida ou inativa.');
    end if;
  end if;

  -- RN-CAIXA-010: só quando paga PELO CAIXA a despesa mexe no físico.
  if v_pelo_caixa then
    select s.id into v_sessao_id from public.cash_sessions s
      where s.status = 'open' order by s.opened_at desc limit 1 for update;
    if v_sessao_id is null then
      return jsonb_build_object('ok', false, 'sem_caixa', true,
        'erro', 'Não há caixa aberto para lançar por ele.');
    end if;
    if v_tipo = 'expense' and v_valor > public.esperado_em_caixa(v_sessao_id) then
      return jsonb_build_object('ok', false, 'erro',
        'A despesa é maior que o dinheiro esperado em caixa.',
        'esperado', public.esperado_em_caixa(v_sessao_id));
    end if;
  end if;

  -- RN-FIN-004: o lançamento correto pode apontar para o que ele corrige.
  begin
    v_corrige := nullif(p_dados ->> 'corrige_lancamento_id', '')::uuid;
  exception when others then
    v_corrige := null;
  end;
  if v_corrige is not null then
    if not exists (select 1 from public.financial_entries e
                    where e.id = v_corrige and e.status = 'reversed') then
      return jsonb_build_object('ok', false, 'erro',
        'O lançamento que você quer corrigir não existe ou não foi estornado.');
    end if;
  end if;

  insert into public.financial_entries (
    entry_type, category_id, amount, occurred_at, description,
    payment_method_id, payment_method_name_snapshot, cash_session_id,
    created_by, reverses_entry_id)
  values (
    v_tipo, v_cat.id, v_valor, v_quando, v_descricao,
    v_forma_id, v_forma_nome,
    case when v_pelo_caixa then v_sessao_id end,
    v_ator, v_corrige)
  returning id into v_id;

  if v_pelo_caixa then
    insert into public.cash_movements (
      cash_session_id, movement_type, direction, amount,
      financial_entry_id, reason, created_by, idempotency_key)
    values (v_sessao_id,
      case when v_tipo = 'expense' then 'expense' else 'other' end,
      case when v_tipo = 'expense' then 'out' else 'in' end,
      v_valor, v_id, v_descricao, v_ator, v_idem)
    returning id into v_mov;
  end if;

  perform public.log_audit(
    case when v_tipo = 'expense' then 'financeiro_despesa' else 'financeiro_entrada' end,
    'financial_entries', v_id, null,
    jsonb_build_object('valor', v_valor, 'categoria', v_cat.name,
                       'pelo_caixa', v_pelo_caixa, 'sessao_id', v_sessao_id,
                       'corrige', v_corrige),
    v_descricao);

  return jsonb_build_object('ok', true, 'ja_existia', false,
    'lancamento_id', v_id, 'movimento_id', v_mov,
    'esperado', case when v_pelo_caixa then public.esperado_em_caixa(v_sessao_id) end);
end;
$$;

comment on function public.registrar_lancamento is 'RN-FIN-002 e RN-CAIXA-010. Só toca o caixa físico quando foi pago pelo caixa.';

revoke all on function public.registrar_lancamento(jsonb) from public, anon;
grant execute on function public.registrar_lancamento(jsonb) to authenticated;

-- ======================================================= estorno
-- RN-FIN-003/004: o original NÃO é apagado nem editado. Ele passa a
-- `reversed`, guarda quem/quando/por quê, e o dinheiro que saiu da gaveta
-- volta por um movimento compensatório vinculado ao original.
--
-- O lançamento CORRETO não é criado aqui: quem o cria é a pessoa, com os
-- dados certos, apontando para este com `corrige_lancamento_id`. Gerar um
-- espelho automático seria adivinhar qual era o valor certo.
create or replace function public.reverter_lancamento(p_lancamento uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_lanc record;
  v_mov record;
  v_sessao text;
  v_comp uuid;
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

  select * into v_lanc from public.financial_entries e where e.id = p_lancamento for update;
  if v_lanc.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Lançamento não encontrado.');
  end if;
  -- CLAUDE.md §34: duplo estorno.
  if v_lanc.status = 'reversed' then
    return jsonb_build_object('ok', false, 'ja_revertido', true,
      'erro', 'Este lançamento já foi estornado.');
  end if;

  select * into v_mov from public.cash_movements m
    where m.financial_entry_id = p_lancamento and m.reverses_movement_id is null
      and m.reversed_at is null;

  if v_mov.id is not null then
    select s.status into v_sessao from public.cash_sessions s where s.id = v_mov.cash_session_id;
    -- RN-CAIXA-015: não se mexe em sessão fechada.
    if v_sessao <> 'open' then
      return jsonb_build_object('ok', false, 'caixa_fechado', true,
        'erro', 'O caixa desse lançamento já foi fechado. Reabra o caixa para corrigi-lo.');
    end if;

    insert into public.cash_movements (
      cash_session_id, movement_type, direction, amount,
      financial_entry_id, reason, created_by, reverses_movement_id)
    values (v_mov.cash_session_id, 'adjustment',
      case when v_mov.direction = 'in' then 'out' else 'in' end,
      v_mov.amount, p_lancamento, v_motivo, v_ator, v_mov.id)
    returning id into v_comp;

    update public.cash_movements
       set reversed_at = now(), reversed_by = v_ator, reversal_reason = v_motivo
     where id = v_mov.id;
  end if;

  update public.financial_entries
     set status = 'reversed', reversed_by = v_ator,
         reversed_at = now(), reversal_reason = v_motivo
   where id = p_lancamento;

  perform public.log_audit('financeiro_estornar', 'financial_entries', p_lancamento,
    jsonb_build_object('status', 'confirmed', 'valor', v_lanc.amount,
                       'tipo', v_lanc.entry_type),
    jsonb_build_object('status', 'reversed', 'compensatorio_id', v_comp),
    v_motivo);

  return jsonb_build_object('ok', true, 'lancamento_id', p_lancamento,
    'compensatorio_id', v_comp);
end;
$$;

comment on function public.reverter_lancamento is 'RN-FIN-003/004: original preservado. O lançamento correto é criado por quem sabe o valor certo.';

revoke all on function public.reverter_lancamento(uuid, text) from public, anon;
grant execute on function public.reverter_lancamento(uuid, text) to authenticated;
