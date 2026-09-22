-- 0066 — Operações de caixa: abrir, movimentar, reverter, fechar, reabrir
-- 04-REGRAS-NEGOCIO.md RN-CAIXA-001..016 · 03-RLS-RBAC-SEGURANCA.md §16
-- 02-MODELO-DADOS-SUPABASE.md §12 · CLAUDE.md §25, §28, §33, §34
--
-- POR QUE RPC E NÃO POLICY DE UPDATE: `cash_sessions` e `cash_movements` não
-- têm policy de escrita para ninguém (0061). Se tivessem, quem as possuísse
-- poderia gravar um `expected_cash_amount` à mão em /rest/v1 — e o
-- fechamento deixaria de ser calculado pelo servidor (03 §16.4).
--
-- O FUNDO INICIAL NÃO VIRA MOVIMENTO. Ele já está em `cash_sessions.
-- opening_amount`, com autor e horário. Criá-lo também como movimento
-- `opening` daria duas fontes para o mesmo dinheiro, e um fundo de R$ 0,00
-- nem poderia existir como movimento (o valor tem de ser positivo). O tipo
-- `opening` continua no CHECK para quem vier depois; a Fase 7 não o usa.

-- Proteção contra dupla sangria e reenvio da Server Action (§23 da
-- autorização, CLAUDE.md §34). O botão desabilitado não é a garantia.
alter table public.cash_movements add column idempotency_key uuid;
create unique index cash_movements_idempotencia on public.cash_movements (idempotency_key)
  where idempotency_key is not null;

-- ------------------------------------------------------------- esperado
-- Uma fonte só para "quanto deveria haver na gaveta". Tanto o fechamento
-- quanto a tela consultam esta função — não duas somas parecidas.
--
-- Movimento revertido NÃO é excluído da conta: ele continua valendo, e o
-- movimento compensatório é que o anula. É assim que a reversão fica
-- visível no extrato em vez de sumir dele.
create or replace function public.esperado_em_caixa(p_sessao uuid)
returns numeric language sql stable security definer set search_path = ''
as $$
  select coalesce(s.opening_amount, 0)
       + coalesce((select sum(m.amount) from public.cash_movements m
                    where m.cash_session_id = p_sessao and m.direction = 'in'), 0)
       - coalesce((select sum(m.amount) from public.cash_movements m
                    where m.cash_session_id = p_sessao and m.direction = 'out'), 0)
    from public.cash_sessions s where s.id = p_sessao;
$$;

comment on function public.esperado_em_caixa is 'Fundo + entradas - saídas. Só dinheiro físico: cartão e Pix não geram movimento (RN-CAIXA-014).';

revoke all on function public.esperado_em_caixa(uuid) from public, anon;
grant execute on function public.esperado_em_caixa(uuid) to authenticated;

-- ---------------------------------------------------- dinheiro fora da gaveta
-- RN-CAIXA-014: dinheiro recebido que ainda não entrou em gaveta nenhuma.
-- Na Fase 7 isso é o recebimento em dinheiro sem sessão vinculada — o caso
-- do valor que ainda está com quem entregou. Não depende de `driver_runs`,
-- que é da Fase 8.
create or replace function public.dinheiro_fora_da_gaveta()
returns numeric language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(p.amount), 0)
    from public.payments p
    join public.orders o on o.id = p.order_id
   where p.status = 'confirmed'
     and p.cash_session_id is null
     and p.payment_method_family_snapshot = 'cash'
     and o.status not in ('cancelled', 'rejected');
$$;

comment on function public.dinheiro_fora_da_gaveta is 'RN-CAIXA-014: recebido em dinheiro que não entrou na gaveta. NÃO é caixa físico.';

revoke all on function public.dinheiro_fora_da_gaveta() from public, anon;
grant execute on function public.dinheiro_fora_da_gaveta() to authenticated;

-- ============================================================== abrir
create or replace function public.abrir_caixa(p_dados jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_caixa uuid;
  v_fundo numeric;
  v_tz text;
  v_data date;
  v_id uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('cash.open') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para abrir o caixa.');
  end if;

  select c.id into v_caixa from public.cash_registers c
    where c.is_active and (nullif(p_dados ->> 'caixa_id', '') is null
                           or c.id = (p_dados ->> 'caixa_id')::uuid)
    order by c.created_at limit 1;
  if v_caixa is null then
    return jsonb_build_object('ok', false, 'erro', 'Nenhum ponto de caixa ativo.');
  end if;

  -- RN-CAIXA-002: R$ 0,00 é um fundo válido. Ausente também significa zero.
  v_fundo := coalesce(nullif(p_dados ->> 'fundo', '')::numeric, 0);
  if v_fundo < 0 then
    return jsonb_build_object('ok', false, 'erro', 'O fundo inicial não pode ser negativo.');
  end if;
  if v_fundo <> round(v_fundo, 2) then
    return jsonb_build_object('ok', false, 'erro', 'Fundo com mais de dois decimais.');
  end if;

  if exists (select 1 from public.cash_sessions s
              where s.cash_register_id = v_caixa and s.status = 'open') then
    return jsonb_build_object('ok', false, 'ja_aberto', true,
      'erro', 'Já existe um caixa aberto. Feche o atual antes de abrir outro.');
  end if;

  -- RN-CAIXA-004: a data operacional é a data LOCAL da abertura. Serve para
  -- agrupar e procurar — nunca para encerrar a sessão.
  select s.timezone into v_tz from public.store_settings s limit 1;
  v_data := (now() at time zone coalesce(v_tz, 'America/Sao_Paulo'))::date;

  begin
    insert into public.cash_sessions (cash_register_id, operational_date, opened_by, opening_amount)
    values (v_caixa, v_data, v_ator, v_fundo)
    returning id into v_id;
  exception when unique_violation then
    -- Duas pessoas clicaram ao mesmo tempo. O índice parcial da 0061 decidiu.
    return jsonb_build_object('ok', false, 'ja_aberto', true,
      'erro', 'Outra pessoa acabou de abrir o caixa.');
  end;

  perform public.log_audit('caixa_abrir', 'cash_sessions', v_id, null,
    jsonb_build_object('fundo', v_fundo, 'data_operacional', v_data,
                       'caixa_id', v_caixa), null);

  return jsonb_build_object('ok', true, 'sessao_id', v_id,
    'fundo', v_fundo, 'data_operacional', v_data);
end;
$$;

comment on function public.abrir_caixa is 'RN-CAIXA-001/002/006. Uma sessão aberta por ponto; o índice parcial decide a corrida.';

revoke all on function public.abrir_caixa(jsonb) from public, anon;
grant execute on function public.abrir_caixa(jsonb) to authenticated;

-- ====================================================== sangria e reforço
-- RN-CAIXA-008/009: sangria é dinheiro FÍSICO saindo da gaveta; reforço é
-- dinheiro físico entrando. Nenhuma das duas é despesa ou receita — o
-- dinheiro continua sendo da Shalon, só mudou de lugar. Despesa tem função
-- própria (0067).
create or replace function public.movimentar_caixa(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_sessao record;
  v_tipo text := nullif(p_dados ->> 'tipo', '');
  v_sentido text;
  v_valor numeric;
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_idem uuid;
  v_id uuid;
  v_qtd integer;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('cash.adjust') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para movimentar o caixa.');
  end if;

  if v_tipo not in ('supply', 'withdrawal', 'adjustment') then
    return jsonb_build_object('ok', false, 'erro', 'Tipo de movimento inválido.');
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

  select * into v_sessao from public.cash_sessions s
    where s.status = 'open' order by s.opened_at desc limit 1 for update;
  if v_sessao.id is null then
    return jsonb_build_object('ok', false, 'sem_caixa', true,
      'erro', 'Não há caixa aberto.');
  end if;

  v_valor := nullif(p_dados ->> 'valor', '')::numeric;
  if v_valor is null or v_valor <= 0 then
    return jsonb_build_object('ok', false, 'erro', 'Informe um valor maior que zero.');
  end if;
  if v_valor <> round(v_valor, 2) then
    return jsonb_build_object('ok', false, 'erro', 'Valor com mais de dois decimais.');
  end if;

  -- O sentido de sangria e reforço é do próprio tipo. Só o ajuste precisa
  -- ser dito, porque ajuste pode ir para os dois lados.
  v_sentido := case v_tipo
    when 'supply' then 'in'
    when 'withdrawal' then 'out'
    else nullif(p_dados ->> 'sentido', '') end;

  if v_sentido not in ('in', 'out') then
    return jsonb_build_object('ok', false, 'erro', 'Informe se o ajuste entra ou sai do caixa.');
  end if;

  if v_tipo in ('withdrawal', 'adjustment') and v_motivo is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo.');
  end if;

  -- Sangria maior que o dinheiro em caixa deixaria o esperado negativo, que
  -- é uma impossibilidade física, não um saldo.
  if v_sentido = 'out' and v_valor > public.esperado_em_caixa(v_sessao.id) then
    return jsonb_build_object('ok', false, 'erro',
      'O valor é maior que o dinheiro esperado em caixa.',
      'esperado', public.esperado_em_caixa(v_sessao.id));
  end if;

  insert into public.cash_movements (
    cash_session_id, movement_type, direction, amount, reason, created_by, idempotency_key)
  values (v_sessao.id, v_tipo, v_sentido, v_valor, v_motivo, v_ator, v_idem)
  returning id into v_id;

  perform public.log_audit('caixa_' || v_tipo, 'cash_movements', v_id, null,
    jsonb_build_object('valor', v_valor, 'sentido', v_sentido,
                       'sessao_id', v_sessao.id), v_motivo);

  return jsonb_build_object('ok', true, 'ja_existia', false, 'movimento_id', v_id,
    'esperado', public.esperado_em_caixa(v_sessao.id));
end;
$$;

comment on function public.movimentar_caixa is 'RN-CAIXA-008/009: sangria e reforço são movimentos FÍSICOS. Não são despesa nem receita.';

revoke all on function public.movimentar_caixa(jsonb) from public, anon;
grant execute on function public.movimentar_caixa(jsonb) to authenticated;

-- ============================================== reverter movimento de caixa
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

comment on function public.reverter_movimento_caixa is 'RN-FIN-003/004: o original permanece e ganha um compensatório vinculado.';

revoke all on function public.reverter_movimento_caixa(uuid, text) from public, anon;
grant execute on function public.reverter_movimento_caixa(uuid, text) to authenticated;

-- ============================================================== fechar
create or replace function public.fechar_caixa(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_sessao record;
  v_contado numeric;
  v_esperado numeric;
  v_diferenca numeric;
  v_justificativa text := nullif(btrim(coalesce(p_dados ->> 'justificativa', '')), '');
  v_fora numeric;
  v_corrigida boolean;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('cash.close') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para fechar o caixa.');
  end if;

  -- Trava a linha: dois fechamentos simultâneos entram em fila, e o segundo
  -- encontra a sessão já fechada (CLAUDE.md §34).
  select * into v_sessao from public.cash_sessions s
    where s.id = coalesce(nullif(p_dados ->> 'sessao_id', '')::uuid,
                          (select s2.id from public.cash_sessions s2
                            where s2.status = 'open' order by s2.opened_at desc limit 1))
    for update;

  if v_sessao.id is null then
    return jsonb_build_object('ok', false, 'sem_caixa', true, 'erro', 'Não há caixa aberto.');
  end if;
  if v_sessao.status <> 'open' then
    return jsonb_build_object('ok', false, 'ja_fechado', true,
      'erro', 'Este caixa já foi fechado.');
  end if;

  v_contado := nullif(p_dados ->> 'contado', '')::numeric;
  if v_contado is null or v_contado < 0 then
    return jsonb_build_object('ok', false, 'erro', 'Informe o valor contado na gaveta.');
  end if;
  if v_contado <> round(v_contado, 2) then
    return jsonb_build_object('ok', false, 'erro', 'Valor contado com mais de dois decimais.');
  end if;

  -- 03 §16.4: o esperado é do SERVIDOR. A pessoa informa só o que contou.
  v_esperado := public.esperado_em_caixa(v_sessao.id);
  v_diferenca := v_contado - v_esperado;

  -- RN-CAIXA-012: diferença não impede fechar, mas exige justificativa.
  if v_diferenca <> 0 and v_justificativa is null then
    return jsonb_build_object('ok', false, 'exige_justificativa', true,
      'erro', 'Há diferença no caixa. Informe a justificativa para fechar.',
      'esperado', v_esperado, 'contado', v_contado, 'diferenca', v_diferenca);
  end if;

  -- RN-CAIXA-013/014: pendência não bloqueia, mas fica registrada no próprio
  -- fechamento. Fechar sem dizer isso produziria um número falso.
  v_fora := public.dinheiro_fora_da_gaveta();

  select exists (select 1 from public.cash_session_corrections c
                  where c.cash_session_id = v_sessao.id) into v_corrigida;

  update public.cash_sessions
     set status = 'closed', closed_at = now(), closed_by = v_ator,
         expected_cash_amount = v_esperado,
         counted_cash_amount = v_contado,
         difference_amount = v_diferenca,
         difference_reason = case when v_diferenca <> 0 then v_justificativa end,
         pending_external_cash_amount = v_fora
   where id = v_sessao.id;

  -- Fechamento posterior a uma reabertura é correção, e é registrado como
  -- tal (RN-CAIXA-016) — o fechamento anterior continua no snapshot.
  if v_corrigida then
    insert into public.cash_session_corrections (
      cash_session_id, correction_type, reason, before_snapshot, after_snapshot, created_by)
    values (v_sessao.id, 'reclose',
      coalesce(v_justificativa, 'Novo fechamento após correção'),
      jsonb_build_object('status', 'open'),
      jsonb_build_object('esperado', v_esperado, 'contado', v_contado,
                         'diferenca', v_diferenca), v_ator);
  end if;

  perform public.log_audit('caixa_fechar', 'cash_sessions', v_sessao.id,
    jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'closed', 'esperado', v_esperado,
                       'contado', v_contado, 'diferenca', v_diferenca,
                       'fora_da_gaveta', v_fora),
    v_justificativa);

  return jsonb_build_object('ok', true, 'sessao_id', v_sessao.id,
    'esperado', v_esperado, 'contado', v_contado, 'diferenca', v_diferenca,
    'fora_da_gaveta', v_fora);
end;
$$;

comment on function public.fechar_caixa is 'RN-CAIXA-011/012/013: esperado calculado no servidor, diferença exige justificativa, pendência é registrada.';

revoke all on function public.fechar_caixa(jsonb) from public, anon;
grant execute on function public.fechar_caixa(jsonb) to authenticated;

-- ============================================================ reabrir
-- RN-CAIXA-015/016: atendente comum não reabre. E reabrir NÃO apaga o
-- fechamento: ele é fotografado antes, em `before_snapshot`.
create or replace function public.reabrir_caixa(p_sessao uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_sessao record;
  v_antes jsonb;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('cash.reopen') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para reabrir o caixa.');
  end if;
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da reabertura.');
  end if;

  select * into v_sessao from public.cash_sessions s where s.id = p_sessao for update;
  if v_sessao.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não encontrada.');
  end if;
  if v_sessao.status <> 'closed' then
    return jsonb_build_object('ok', false, 'erro', 'Esta sessão não está fechada.');
  end if;

  if exists (select 1 from public.cash_sessions s
              where s.cash_register_id = v_sessao.cash_register_id and s.status = 'open') then
    return jsonb_build_object('ok', false, 'ja_aberto', true,
      'erro', 'Há um caixa aberto agora. Feche-o antes de reabrir uma sessão anterior.');
  end if;

  v_antes := jsonb_build_object(
    'closed_at', v_sessao.closed_at, 'closed_by', v_sessao.closed_by,
    'esperado', v_sessao.expected_cash_amount,
    'contado', v_sessao.counted_cash_amount,
    'diferenca', v_sessao.difference_amount,
    'justificativa', v_sessao.difference_reason,
    'fora_da_gaveta', v_sessao.pending_external_cash_amount);

  insert into public.cash_session_corrections (
    cash_session_id, correction_type, reason, before_snapshot, created_by)
  values (p_sessao, 'reopen', v_motivo, v_antes, v_ator);

  update public.cash_sessions
     set status = 'open', closed_at = null, closed_by = null,
         expected_cash_amount = null, counted_cash_amount = null,
         difference_amount = null, difference_reason = null
   where id = p_sessao;

  perform public.log_audit('caixa_reabrir', 'cash_sessions', p_sessao,
    v_antes, jsonb_build_object('status', 'open'), v_motivo);

  return jsonb_build_object('ok', true, 'sessao_id', p_sessao, 'fechamento_anterior', v_antes);
end;
$$;

comment on function public.reabrir_caixa is 'RN-CAIXA-016: reabertura excepcional. O fechamento original fica em before_snapshot.';

revoke all on function public.reabrir_caixa(uuid, text) from public, anon;
grant execute on function public.reabrir_caixa(uuid, text) to authenticated;
