-- 0068 — Projeções de caixa e financeiro para a operação
-- 04-REGRAS-NEGOCIO.md RN-CAIXA-007/011/013/014, RN-FIN-005 · 03 §17.3
-- CLAUDE.md §12, §28, §39
--
-- SECURITY INVOKER de propósito. Estas funções leem tabelas internas, e quem
-- decide o que cada pessoa enxerga é a RLS da 0061/0062 — não um `if` aqui
-- dentro. Sem `cash.view`, a sessão simplesmente não aparece e a projeção
-- responde "sem caixa": falha fechada, sem vazar a existência do dado.
--
-- CARTÃO E PIX NÃO SÃO DINHEIRO NA GAVETA. O fechamento mostra os dois, mas
-- em blocos diferentes: `recebimentos_por_metodo` é o que entrou por cada
-- meio, e `esperado_em_dinheiro` é só o físico (RN-CAIXA-014, §13).

-- ------------------------------------------------------------ caixa atual
create or replace function public.caixa_atual()
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_s record;
  v_tz text;
  v_hoje date;
begin
  select * into v_s from public.cash_sessions s
    where s.status = 'open' order by s.opened_at desc limit 1;

  if v_s.id is null then
    return jsonb_build_object(
      'aberto', false,
      -- Mesmo fechado, a operação precisa ver o que ficou pendente.
      'dinheiro_fora_da_gaveta', public.dinheiro_fora_da_gaveta(),
      'ultima', (
        select jsonb_build_object(
                 'sessao_id', s2.id, 'fechada_em', s2.closed_at,
                 'esperado', s2.expected_cash_amount,
                 'contado', s2.counted_cash_amount,
                 'diferenca', s2.difference_amount)
          from public.cash_sessions s2
         where s2.status = 'closed'
         order by s2.closed_at desc limit 1));
  end if;

  select st.timezone into v_tz from public.store_settings st limit 1;
  v_hoje := (now() at time zone coalesce(v_tz, 'America/Sao_Paulo'))::date;

  return jsonb_build_object(
    'aberto', true,
    'sessao_id', v_s.id,
    'data_operacional', v_s.operational_date,
    'aberta_em', v_s.opened_at,
    'aberta_por', (select e.full_name from public.app_users u
                     join public.employees e on e.id = u.employee_id
                    where u.id = v_s.opened_by),
    'fundo', v_s.opening_amount,
    'esperado_em_dinheiro', public.esperado_em_caixa(v_s.id),

    -- RN-CAIXA-007: caixa esquecido aberto não fecha sozinho — ele avisa. O
    -- critério é o que já existe no domínio: a sessão nasceu numa data
    -- operacional anterior à de hoje. Nenhum número inventado.
    'alerta_caixa_antigo', v_s.operational_date < v_hoje,
    'dinheiro_fora_da_gaveta', public.dinheiro_fora_da_gaveta(),

    'recebimentos_por_metodo', coalesce((
      select jsonb_agg(x order by x ->> 'metodo')
        from (select jsonb_build_object(
                       'metodo', p.payment_method_name_snapshot,
                       'familia', p.payment_method_family_snapshot,
                       'total', sum(p.amount),
                       'na_gaveta', p.payment_method_family_snapshot = 'cash') as x
                from public.payments p
               where p.cash_session_id = v_s.id and p.status = 'confirmed'
               group by p.payment_method_name_snapshot,
                        p.payment_method_family_snapshot) t), '[]'::jsonb),

    'movimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'tipo', m.movement_type, 'sentido', m.direction,
               'valor', m.amount, 'motivo', m.reason, 'em', m.created_at,
               'por', (select e.full_name from public.app_users u
                         join public.employees e on e.id = u.employee_id
                        where u.id = m.created_by),
               'estornado', m.reversed_at is not null,
               'e_estorno', m.reverses_movement_id is not null,
               'pedido_id', m.order_id)
             order by m.created_at desc)
        from public.cash_movements m where m.cash_session_id = v_s.id), '[]'::jsonb));
end;
$$;

comment on function public.caixa_atual is 'Estado operacional do caixa. Invoker: sem cash.view a sessão não aparece e a resposta é "sem caixa".';

revoke all on function public.caixa_atual() from public, anon;
grant execute on function public.caixa_atual() to authenticated;

-- ------------------------------------------------------- resumo do fechamento
-- §13 da autorização: o fechamento tem de ser compreensível. Cada bloco é
-- uma pergunta da pessoa que está contando a gaveta.
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

comment on function public.resumo_do_fechamento is 'RN-CAIXA-011/013/014: esperado do servidor, por método separado do físico, pendência destacada.';

revoke all on function public.resumo_do_fechamento(uuid) from public, anon;
grant execute on function public.resumo_do_fechamento(uuid) to authenticated;

-- ------------------------------------------------------------- histórico
create or replace function public.sessoes_de_caixa(p_limite integer default 30)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'sessao_id', t.id, 'status', t.status,
           'data_operacional', t.operational_date,
           'aberta_em', t.opened_at, 'fechada_em', t.closed_at,
           'fundo', t.opening_amount,
           'esperado', t.expected_cash_amount,
           'contado', t.counted_cash_amount,
           'diferenca', t.difference_amount,
           'justificativa', t.difference_reason,
           'fora_da_gaveta', t.pending_external_cash_amount,
           'corrigida', exists (select 1 from public.cash_session_corrections c
                                 where c.cash_session_id = t.id))
         order by t.opened_at desc), '[]'::jsonb)
    from (select * from public.cash_sessions
          order by opened_at desc
          limit greatest(1, least(coalesce(p_limite, 30), 200))) t;
$$;

revoke all on function public.sessoes_de_caixa(integer) from public, anon;
grant execute on function public.sessoes_de_caixa(integer) to authenticated;

-- ------------------------------------------------------------ financeiro
create or replace function public.categorias_financeiras()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'nome', c.name, 'tipo', c.kind,
           'ativa', c.is_active, 'ordem', c.sort_order,
           'em_uso', exists (select 1 from public.financial_entries e where e.category_id = c.id))
         order by c.is_active desc, c.sort_order, c.name), '[]'::jsonb)
    from public.financial_categories c;
$$;

revoke all on function public.categorias_financeiras() from public, anon;
grant execute on function public.categorias_financeiras() to authenticated;

create or replace function public.lancamentos_financeiros(p_filtros jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'tipo', t.entry_type, 'valor', t.amount,
           'quando', t.occurred_at, 'descricao', t.description,
           'categoria', (select c.name from public.financial_categories c where c.id = t.category_id),
           'forma', t.payment_method_name_snapshot,
           'pelo_caixa', t.cash_session_id is not null,
           'status', t.status,
           'motivo_estorno', t.reversal_reason,
           'corrige', t.reverses_entry_id,
           'por', (select e.full_name from public.app_users u
                     join public.employees e on e.id = u.employee_id
                    where u.id = t.created_by))
         order by t.occurred_at desc), '[]'::jsonb)
    from (select * from public.financial_entries fe
           where (nullif(p_filtros ->> 'tipo', '') is null
                  or fe.entry_type = p_filtros ->> 'tipo')
             and (nullif(p_filtros ->> 'categoria_id', '') is null
                  or fe.category_id = (p_filtros ->> 'categoria_id')::uuid)
             and (nullif(p_filtros ->> 'desde', '') is null
                  or fe.occurred_at >= (p_filtros ->> 'desde')::timestamptz)
           order by fe.occurred_at desc
           limit greatest(1, least(coalesce((p_filtros ->> 'limite')::integer, 100), 500))) t;
$$;

comment on function public.lancamentos_financeiros is 'RN-FIN-005: devolve receita registrada e despesa. Não calcula lucro, margem nem CMV.';

revoke all on function public.lancamentos_financeiros(jsonb) from public, anon;
grant execute on function public.lancamentos_financeiros(jsonb) to authenticated;

-- ------------------------------------------------ pagamento de um pedido
-- Esperado ao lado do realizado, para a tela do pedido mostrar os dois sem
-- que um substitua o outro (RN-PGTO-002).
create or replace function public.pagamento_do_pedido(p_order_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'esperado', (select jsonb_build_object(
                   'metodo', i.payment_method_name_snapshot,
                   'familia', i.payment_method_family_snapshot,
                   'bandeira', i.payment_brand_name_snapshot,
                   'valor', i.amount_expected,
                   'precisa_troco', i.needs_change,
                   'troco_para', i.change_for_amount,
                   'troco_esperado', i.expected_change_amount,
                   'pix', i.pix_confirmation_status)
                  from public.order_payment_intents i where i.order_id = p_order_id),
    'realizado', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', p.id, 'metodo', p.payment_method_name_snapshot,
                   'familia', p.payment_method_family_snapshot,
                   'bandeira', p.payment_brand_name_snapshot,
                   'valor', p.amount,
                   'recebido', p.tendered_amount, 'troco', p.change_amount,
                   'status', p.status, 'em', p.received_at,
                   'na_gaveta', p.cash_session_id is not null,
                   'motivo_estorno', p.reversal_reason)
                 order by p.created_at)
                  from public.payments p where p.order_id = p_order_id), '[]'::jsonb),
    'total_realizado', coalesce((select sum(p.amount) from public.payments p
                                  where p.order_id = p_order_id and p.status = 'confirmed'), 0),
    'total_do_pedido', (select o.total from public.orders o where o.id = p_order_id),
    'situacao', (select o.payment_status from public.orders o where o.id = p_order_id));
$$;

comment on function public.pagamento_do_pedido is 'RN-PGTO-002: esperado e realizado lado a lado. Um nunca substitui o outro.';

revoke all on function public.pagamento_do_pedido(uuid) from public, anon;
grant execute on function public.pagamento_do_pedido(uuid) to authenticated;
