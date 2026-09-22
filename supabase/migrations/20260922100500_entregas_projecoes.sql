-- 0077 — Projeções da Fase 8: central de entregas, corrida, internos, livro
-- 03-RLS-RBAC-SEGURANCA.md §17 · CLAUDE.md §15, §26, §27
--
-- TODAS SECURITY INVOKER. Quem decide o que cada pessoa enxerga é a RLS,
-- não um `if` dentro da função. É isso que faz o livro do funcionário sumir
-- para quem não tem `employees.finance.view` sem precisar de um segundo
-- mecanismo de defesa que pudesse discordar do primeiro.

-- Corrige a referência do comentário da 0075: a RPC que transforma a
-- diferença em lançamento é a genérica `lancar_no_funcionario`, com
-- `corrida_id` fazendo o vínculo rastreável que RN-RUN-006 exige.
comment on function public.conciliar_corrida is
  'RN-PGTO-014: único lugar onde o dinheiro da rua entra na gaveta. Diferença não desconta salário — virar lançamento é ato separado, via `lancar_no_funcionario`.';

-- ==================================================== central de entregas
create or replace function public.central_de_entregas()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    -- Pedidos prontos, de entrega, ainda sem motoboy. Retirada NUNCA entra
    -- aqui (RN-RUN-001): não há rua, não há acerto, não há dinheiro fora.
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

    -- Corridas vivas: montando, na rua, ou esperando acerto.
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
                                  and o.delivery_status <> 'reassigned'),
                   'pendentes', (select count(*) from public.driver_run_orders o
                                  where o.driver_run_id = r.id
                                    and o.delivery_status = 'pending'),
                   -- RN-CAIXA-014: isto é dinheiro NA RUA. Não é caixa.
                   'dinheiro_na_rua', coalesce((
                       select sum(p.amount) from public.payments p
                         join public.driver_run_orders o on o.order_id = p.order_id
                        where o.driver_run_id = r.id
                          and o.delivery_status = 'delivered'
                          and p.status = 'confirmed'
                          and p.payment_method_family_snapshot = 'cash'
                          and p.cash_session_id is null), 0)::numeric(12,2)
                 ) as linha
            from public.driver_runs r
            join public.employees e on e.id = r.driver_employee_id
           where r.status <> 'settled'
        ) t
    ), '[]'::jsonb),

    -- Quem pode receber corrida. Motoboy é funcionário ativo marcado como
    -- tal; login não entra na conta (RN-MOTO-001).
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
  'Fila de entrega, corridas vivas e motoboys. `dinheiro_na_rua` não é caixa (RN-CAIXA-014).';

revoke all on function public.central_de_entregas() from public, anon;
grant execute on function public.central_de_entregas() to authenticated;

-- =========================================================== uma corrida
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

    -- POR PEDIDO, nunca só o total: §18 é explícito em não perder
    -- rastreabilidade por pedido dentro da corrida.
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
               -- PAGAMENTO REALIZADO, que é outra coisa (RN-PGTO-001).
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
                      and p.cash_session_id is not null))
             order by o.assigned_at)
        from public.driver_run_orders o
        join public.orders d on d.id = o.order_id
        left join public.order_payment_intents pi on pi.order_id = d.id
       where o.driver_run_id = r.id
    ), '[]'::jsonb),

    -- O esperado do acerto é DERIVADO, e o painel mostra o mesmo número que
    -- `conciliar_corrida` vai recalcular na hora de gravar.
    'esperado_em_dinheiro', coalesce((
      select sum(p.amount) from public.payments p
        join public.driver_run_orders o on o.order_id = p.order_id
       where o.driver_run_id = r.id
         and o.delivery_status = 'delivered'
         and p.status = 'confirmed'
         and p.payment_method_family_snapshot = 'cash'
         and p.cash_session_id is null), 0)::numeric(12,2),

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
               -- RN-RUN-006: a diferença virou lançamento do funcionário?
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

-- ===================================================== corridas acertadas
create or replace function public.corridas(p_limite integer default 20)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(t.linha order by t.settled_at desc), '[]'::jsonb)
    from (
      select r.settled_at,
             jsonb_build_object(
               'corrida_id', r.id,
               'motoboy', e.full_name,
               'saiu_em', r.departed_at,
               'acertada_em', r.settled_at,
               'pedidos', (select count(*) from public.driver_run_orders o
                            where o.driver_run_id = r.id
                              and o.delivery_status = 'delivered'),
               'falhas', (select count(*) from public.driver_run_orders o
                           where o.driver_run_id = r.id
                             and o.delivery_status = 'failed'),
               'esperado', s.expected_cash::numeric(12,2),
               'devolvido', s.returned_cash::numeric(12,2),
               'diferenca', s.difference::numeric(12,2),
               'motivo', s.difference_reason) as linha
        from public.driver_runs r
        join public.employees e on e.id = r.driver_employee_id
        left join public.driver_run_settlements s on s.driver_run_id = r.id
       where r.status = 'settled'
       order by r.settled_at desc
       limit greatest(coalesce(p_limite, 20), 1)
    ) t;
$$;

revoke all on function public.corridas(integer) from public, anon;
grant execute on function public.corridas(integer) to authenticated;

-- ====================================================== movimentos internos
create or replace function public.movimentos_internos(p_filtros jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(t.linha order by t.occurred_at desc), '[]'::jsonb)
    from (
      select m.occurred_at,
             jsonb_build_object(
               'movimento_id', m.id,
               'tipo', m.movement_type,
               'status', m.status,
               'funcionario_id', m.employee_id,
               'funcionario', e.full_name,
               'motivo', m.reason,
               'observacao', m.notes,
               'quando', m.occurred_at,
               'autorizado_por', m.authorized_by,
               'estornado_em', m.reversed_at,
               'motivo_do_estorno', m.reversal_reason,
               'itens', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'nome', i.product_name_snapshot,
                            'tamanho', i.size_name_snapshot,
                            'quantidade', i.quantity,
                            'preco_referencia', i.reference_unit_price::numeric(12,2),
                            'observacao', i.observation)
                          order by i.product_name_snapshot)
                     from public.internal_product_movement_items i
                    where i.movement_id = m.id), '[]'::jsonb),
               -- Valor DE REFERÊNCIA. Não é receita, não é dívida, não
               -- entra em faturamento (RN-CLASS-001).
               'valor_referencia', coalesce((
                   select sum(i.quantity * i.reference_unit_price)
                     from public.internal_product_movement_items i
                    where i.movement_id = m.id), 0)::numeric(12,2),
               -- Virou lançamento no livro de alguém? Quem não tem
               -- permissão financeira recebe `false` porque a RLS do ledger
               -- não devolve a linha — e isso está certo.
               'tem_lancamento', exists (
                   select 1 from public.employee_ledger_entries l
                    where l.related_internal_movement_id = m.id
                      and l.status = 'confirmed')) as linha
        from public.internal_product_movements m
        left join public.employees e on e.id = m.employee_id
       where (nullif(p_filtros ->> 'tipo', '') is null
              or m.movement_type = p_filtros ->> 'tipo')
         and (nullif(p_filtros ->> 'funcionario_id', '') is null
              or m.employee_id = (p_filtros ->> 'funcionario_id')::uuid)
         and (nullif(p_filtros ->> 'de', '') is null
              or m.occurred_at >= (p_filtros ->> 'de')::timestamptz)
         and (nullif(p_filtros ->> 'ate', '') is null
              or m.occurred_at < ((p_filtros ->> 'ate')::date + 1)::timestamptz)
       order by m.occurred_at desc
       limit greatest(coalesce((p_filtros ->> 'limite')::integer, 100), 1)
    ) t;
$$;

comment on function public.movimentos_internos is
  'RN-CLASS-001: saídas que não são venda. `valor_referencia` não é receita nem dívida.';

revoke all on function public.movimentos_internos(jsonb) from public, anon;
grant execute on function public.movimentos_internos(jsonb) to authenticated;

-- ================================================= livro do funcionário
-- §15 e RN-EMPFIN-001: esta função NÃO devolve salário, nem lê
-- `employee_financial_profiles`. Quem quiser salário passa pela tela e pela
-- permissão do salário, que são outras. Aqui é consumo, adiantamento e
-- diferença — e mesmo isso só aparece com `employees.finance.view`, porque a
-- RLS da tabela é quem responde.
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
                   'corrida_id', l.related_driver_run_id,
                   'movimento_id', l.related_internal_movement_id,
                   'anexo_id', l.attachment_asset_id,
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
  'RN-EMPFIN-001/003: consumo, adiantamento e diferença. Nunca salário. Nunca desconto automático.';

revoke all on function public.historico_do_funcionario(uuid, integer) from public, anon;
grant execute on function public.historico_do_funcionario(uuid, integer) to authenticated;
