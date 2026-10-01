-- 0144 — a diferença do acerto do motoboy: no caixa e na decisão da dona
-- 04 RN-RUN-004/005/006 · RN-CAIXA-011 · D-2026-10-01-112
--
-- DOIS ACHADOS, uma regra só ("diferença fica registrada, e virar desconto é
-- decisão à parte"):
--
-- 1. O CAIXA FICAVA ERRADO. O acerto recolhe para a gaveta cada recebimento
--    registrado — o que o CLIENTE pagou. Se o motoboy trouxe R$ 50 de R$ 54,
--    a gaveta passava a esperar R$ 54 e o fechamento acusava −R$ 4 de novo,
--    pedindo outra justificativa para o que já tinha motivo no acerto.
--    Agora o acerto lança, junto, um movimento próprio (`driver_difference`)
--    de saída (falta) ou entrada (sobra), ligado ao acerto e com o motivo.
--    A gaveta espera exatamente o que entrou. A venda continua sendo o que o
--    cliente pagou.
--
-- 2. A DONA NÃO TINHA ONDE DECIDIR. A diferença ficava só na corrida. Agora:
--      `diferencas_de_acerto(funcionario)`  lista, com a situação de cada uma;
--      lançar no funcionário                 é o `lancar_no_funcionario` de
--                                            sempre, tipo `discrepancy`, com a
--                                            corrida — e agora conferido;
--      `dispensar_diferenca_do_acerto`       "não lançar", com motivo.
--    Nada disso é automático (RN-RUN-005).

-- ------------------------------------------------------------ 1. o movimento
alter table public.cash_movements drop constraint cash_movements_tipo;
alter table public.cash_movements add constraint cash_movements_tipo check (
  movement_type in ('opening', 'sale_receipt', 'supply', 'withdrawal',
                    'expense', 'refund', 'adjustment', 'other',
                    'employee_advance', 'driver_difference'));

alter table public.cash_movements drop constraint cash_movements_sentido_do_tipo;
alter table public.cash_movements add constraint cash_movements_sentido_do_tipo check (
  (movement_type = 'opening'          and direction = 'in')
  or (movement_type = 'sale_receipt'     and direction = 'in')
  or (movement_type = 'supply'           and direction = 'in')
  or (movement_type = 'withdrawal'       and direction = 'out')
  or (movement_type = 'expense'          and direction = 'out')
  or (movement_type = 'employee_advance' and direction = 'out')
  -- Falta sai, sobra entra: os dois sentidos são legítimos.
  or (movement_type in ('refund', 'adjustment', 'other', 'driver_difference'))
);

alter table public.cash_movements drop constraint cash_movements_motivo_quando_exigido;
alter table public.cash_movements add constraint cash_movements_motivo_quando_exigido check (
  movement_type not in ('withdrawal', 'adjustment', 'other', 'employee_advance', 'driver_difference')
  or (reason is not null and length(btrim(reason)) >= 3)
);

alter table public.cash_movements
  add column driver_run_settlement_id uuid
    references public.driver_run_settlements (id) on delete restrict;

alter table public.cash_movements add constraint cash_movements_diferenca_com_acerto check (
  (movement_type = 'driver_difference') = (driver_run_settlement_id is not null)
);

comment on column public.cash_movements.driver_run_settlement_id is
  'Acerto de motoboy cuja diferença este movimento acerta na gaveta (0144). Só em driver_difference.';

-- O acerto lança a diferença na gaveta. Patch por âncora, como a 0143.
do $patch$
declare
  v_src  text;
  v_anc  text := E'    v_ator, v_sessao)\n  returning id into v_id;\n';
  v_novo text := v_anc
    || E'\n'
    || E'  -- A gaveta espera o que ENTROU (0144): a falta sai, a sobra entra, ligadas\n'
    || E'  -- a este acerto e com o motivo. Sem isto o fechamento cobraria de novo.\n'
    || E'  if v_diferenca <> 0 then\n'
    || E'    insert into public.cash_movements (\n'
    || E'      cash_session_id, movement_type, direction, amount, reason, created_by,\n'
    || E'      driver_run_settlement_id)\n'
    || E'    values (v_sessao, ''driver_difference'',\n'
    || E'      case when v_diferenca > 0 then ''in'' else ''out'' end, abs(v_diferenca),\n'
    || E'      ''Diferença no acerto do motoboy: '' || v_motivo, v_ator, v_id);\n'
    || E'  end if;\n';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'conciliar_corrida';
  if v_src is null then
    raise exception 'conciliar_corrida não existe';
  end if;
  if position('A gaveta espera o que ENTROU (0144)' in v_src) > 0 then
    raise notice 'conciliar_corrida já lança a diferença; nada a fazer';
    return;
  end if;
  if (length(v_src) - length(replace(v_src, v_anc, ''))) / length(v_anc) <> 1 then
    raise exception 'Âncora não encontrada exatamente uma vez em conciliar_corrida — migration abortada';
  end if;
  execute replace(v_src, v_anc, v_novo);
end $patch$;

-- O fechamento mostra a linha própria. Recriada inteira: só ganha um campo.
create or replace function public.resumo_do_fechamento(p_sessao uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_s record;
begin
  select * into v_s from public.cash_sessions s
    where s.id = coalesce(p_sessao, (select s2.id from public.cash_sessions s2
                                      where s2.status = 'open'
                                      order by s2.opened_at desc limit 1));
  if v_s.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não encontrada.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'sessao_id', v_s.id,
    'status', v_s.status,
    'data_operacional', v_s.operational_date,
    'aberta_em', v_s.opened_at,
    'fechada_em', v_s.closed_at,

    'fundo_inicial', v_s.opening_amount,

    -- O que entrou por cada meio. Cartão e Pix aparecem aqui e NÃO entram
    -- no esperado em dinheiro.
    'recebimentos_por_metodo', coalesce((
      select jsonb_agg(jsonb_build_object(
               'metodo', t.metodo, 'familia', t.familia, 'total', t.total)
             order by t.metodo)
        from (select p.payment_method_name_snapshot as metodo,
                     p.payment_method_family_snapshot as familia,
                     sum(p.amount) as total
                from public.payments p
               where p.cash_session_id = v_s.id and p.status = 'confirmed'
               group by 1, 2) t), '[]'::jsonb),

    'recebido_em_dinheiro', coalesce((
      select sum(m.amount) from public.cash_movements m
       where m.cash_session_id = v_s.id and m.movement_type = 'sale_receipt'), 0),

    'reforcos', coalesce((select sum(m.amount) from public.cash_movements m
                           where m.cash_session_id = v_s.id and m.movement_type = 'supply'), 0),
    'sangrias', coalesce((select sum(m.amount) from public.cash_movements m
                           where m.cash_session_id = v_s.id and m.movement_type = 'withdrawal'), 0),
    'despesas_pelo_caixa', coalesce((select sum(m.amount) from public.cash_movements m
                           where m.cash_session_id = v_s.id and m.movement_type = 'expense'), 0),
    'entradas_pelo_caixa', coalesce((select sum(m.amount) from public.cash_movements m
                           where m.cash_session_id = v_s.id and m.movement_type = 'other'
                             and m.direction = 'in'), 0),
    'estornos', coalesce((select sum(m.amount) from public.cash_movements m
                           where m.cash_session_id = v_s.id
                             and m.movement_type in ('refund', 'adjustment')), 0),
    -- 0144: sobra menos falta dos acertos de motoboy desta sessão.
    'diferencas_de_motoboy', coalesce((select sum(case when m.direction = 'in' then m.amount
                                                      else -m.amount end)
                           from public.cash_movements m
                           where m.cash_session_id = v_s.id
                             and m.movement_type = 'driver_difference'), 0),

    -- RN-CAIXA-011: o esperado é do servidor.
    'esperado_em_dinheiro', case when v_s.status = 'open'
                                 then public.esperado_em_caixa(v_s.id)
                                 else v_s.expected_cash_amount end,
    'contado', v_s.counted_cash_amount,
    'diferenca', v_s.difference_amount,
    'justificativa', v_s.difference_reason,

    -- RN-CAIXA-013/014: destaque obrigatório. Não entra no esperado.
    'dinheiro_fora_da_gaveta', case when v_s.status = 'open'
                                    then public.dinheiro_fora_da_gaveta()
                                    else v_s.pending_external_cash_amount end,

    'correcoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tipo', c.correction_type, 'motivo', c.reason,
               'em', c.created_at, 'antes', c.before_snapshot)
             order by c.created_at)
        from public.cash_session_corrections c
       where c.cash_session_id = v_s.id), '[]'::jsonb));
end;
$$;

-- ------------------------------------------------------- 2. a decisão da dona
alter table public.driver_run_settlements
  add column difference_waived_at timestamptz,
  add column difference_waived_by uuid references public.app_users (id) on delete restrict,
  add column difference_waived_reason text;

alter table public.driver_run_settlements add constraint driver_run_settlements_dispensa_coerente check (
  (difference_waived_at is null and difference_waived_by is null and difference_waived_reason is null)
  or (difference_waived_at is not null and difference_waived_by is not null
      and length(btrim(coalesce(difference_waived_reason, ''))) >= 3 and difference <> 0)
);

comment on column public.driver_run_settlements.difference_waived_at is
  'RN-RUN-006: a dona decidiu NÃO lançar a diferença no funcionário. Fica o registro, com quem e por quê (0144).';

-- Lançar no funcionário a partir de uma corrida passa a ser conferido: o
-- lançamento é de QUEM fez a corrida, uma vez só, e não depois de dispensado.
do $patch$
declare
  v_src  text;
  v_anc  text := E'      ''A corrida informada não existe ou ainda não foi acertada.'');\n  end if;\n';
  v_novo text := v_anc
    || E'\n'
    || E'  -- A diferença de uma corrida é de quem a fez, e decide-se uma vez (0144).\n'
    || E'  if v_corrida is not null then\n'
    || E'    if not exists (select 1 from public.driver_runs r\n'
    || E'                    where r.id = v_corrida and r.driver_employee_id = v_funcionario) then\n'
    || E'      return jsonb_build_object(''ok'', false, ''erro'',\n'
    || E'        ''A corrida informada não é deste funcionário.'');\n'
    || E'    end if;\n'
    || E'    if exists (select 1 from public.driver_run_settlements s\n'
    || E'                where s.driver_run_id = v_corrida and s.difference_waived_at is not null) then\n'
    || E'      return jsonb_build_object(''ok'', false, ''ja_decidida'', true, ''erro'',\n'
    || E'        ''A diferença desta corrida já foi dispensada.'');\n'
    || E'    end if;\n'
    || E'    if exists (select 1 from public.employee_ledger_entries l\n'
    || E'                where l.related_driver_run_id = v_corrida and l.entry_type = ''discrepancy''\n'
    || E'                  and l.status = ''confirmed'' and l.reverses_entry_id is null) then\n'
    || E'      return jsonb_build_object(''ok'', false, ''ja_decidida'', true, ''erro'',\n'
    || E'        ''A diferença desta corrida já foi lançada no funcionário.'');\n'
    || E'    end if;\n'
    || E'  end if;\n';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'lancar_no_funcionario';
  if v_src is null then
    raise exception 'lancar_no_funcionario não existe';
  end if;
  if position('A diferença de uma corrida é de quem a fez' in v_src) > 0 then
    raise notice 'lancar_no_funcionario já confere a corrida; nada a fazer';
    return;
  end if;
  if (length(v_src) - length(replace(v_src, v_anc, ''))) / length(v_anc) <> 1 then
    raise exception 'Âncora não encontrada exatamente uma vez em lancar_no_funcionario — migration abortada';
  end if;
  execute replace(v_src, v_anc, v_novo);
end $patch$;

create or replace function public.diferencas_de_acerto(p_funcionario uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Diferença de motoboy é histórico financeiro do funcionário (CLAUDE.md §15).
  if not public.has_permission('employees.finance.view') then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'acerto_id', s.id,
             'corrida_id', r.id,
             'funcionario_id', r.driver_employee_id,
             'funcionario', e.full_name,
             'acertado_em', s.settled_at,
             'esperado', s.expected_cash,
             'devolvido', s.returned_cash,
             'diferenca', s.difference,
             'motivo', s.difference_reason,
             'situacao', case
                when l.id is not null then 'lancada'
                when s.difference_waived_at is not null then 'dispensada'
                else 'pendente' end,
             'lancamento_id', l.id,
             'dispensada_em', s.difference_waived_at,
             'motivo_da_dispensa', s.difference_waived_reason)
           order by (l.id is null and s.difference_waived_at is null) desc, s.settled_at desc)
      from public.driver_run_settlements s
      join public.driver_runs r on r.id = s.driver_run_id
      join public.employees e on e.id = r.driver_employee_id
      left join lateral (
        select l.id from public.employee_ledger_entries l
         where l.related_driver_run_id = r.id and l.entry_type = 'discrepancy'
           and l.status = 'confirmed' and l.reverses_entry_id is null
         limit 1) l on true
     where s.difference <> 0
       and (p_funcionario is null or r.driver_employee_id = p_funcionario)), '[]'::jsonb);
end;
$$;

comment on function public.diferencas_de_acerto(uuid) is
  'RN-RUN-006: diferenças de acerto de motoboy e o que a dona decidiu (pendente, lançada, dispensada). employees.finance.view (0144).';
revoke all on function public.diferencas_de_acerto(uuid) from public, anon;
grant execute on function public.diferencas_de_acerto(uuid) to authenticated;

create or replace function public.dispensar_diferenca_do_acerto(p_acerto_id uuid, p_motivo text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_s record;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('employees.finance.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para decidir diferença de funcionário.');
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo de não lançar.');
  end if;

  select * into v_s from public.driver_run_settlements s where s.id = p_acerto_id for update;
  if v_s.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Acerto não encontrado.');
  end if;
  if v_s.difference = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Este acerto não tem diferença.');
  end if;
  if v_s.difference_waived_at is not null or exists (
      select 1 from public.employee_ledger_entries l
       where l.related_driver_run_id = v_s.driver_run_id and l.entry_type = 'discrepancy'
         and l.status = 'confirmed' and l.reverses_entry_id is null) then
    return jsonb_build_object('ok', false, 'ja_decidida', true,
      'erro', 'A diferença deste acerto já foi decidida.');
  end if;

  update public.driver_run_settlements
     set difference_waived_at = now(), difference_waived_by = v_ator,
         difference_waived_reason = v_motivo
   where id = p_acerto_id;

  perform public.log_audit('acerto_dispensar_diferenca', 'driver_run_settlements', p_acerto_id,
    jsonb_build_object('diferenca', v_s.difference),
    jsonb_build_object('situacao', 'dispensada'), v_motivo);

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.dispensar_diferenca_do_acerto(uuid, text) is
  'RN-RUN-006: "não lançar" a diferença do acerto no funcionário, com motivo e auditoria. employees.finance.manage (0144).';
revoke all on function public.dispensar_diferenca_do_acerto(uuid, text) from public, anon;
grant execute on function public.dispensar_diferenca_do_acerto(uuid, text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'conciliar_corrida'
                    and pg_get_functiondef(p.oid) like '%driver_difference%')
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'lancar_no_funcionario'
                    and pg_get_functiondef(p.oid) like '%ja_decidida%') then
    raise exception '0144 não ficou como esperado';
  end if;
end $$;
