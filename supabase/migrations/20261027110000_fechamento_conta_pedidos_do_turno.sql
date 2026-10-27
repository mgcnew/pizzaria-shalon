-- 0176 — O fechamento conta os pedidos do turno e avisa quem ficou sem recebimento
-- D-2026-10-27-169 · 04 RN-CAIXA-011, RN-PGTO-012, RN-RUN-003 · CLAUDE.md §26
--
-- O PROBLEMA. A contagem de pizzas, fogazzas e bebidas (0173) só olhava pedidos
-- com pagamento confirmado NESTA sessão. A dona contou mais pizzas do que o
-- fechamento mostrava. Nos dados de 17 a 25/10, 23 pedidos concluídos ficaram
-- de fora — quase todos ENTREGAS:
--  * entrega concluída sem nenhum recebimento registrado (o recebimento de
--    entrega acontece no acerto do motoboy, e esses pedidos não saíram em
--    nenhuma "Saída de entrega");
--  * entrega paga em dinheiro com "Este dinheiro entrou na gaveta agora"
--    desmarcado — o pagamento fica sem sessão de caixa.
-- O dinheiro desses pedidos também não aparece em nenhum fechamento.
--
-- A REGRA (aprovada em 27/10/2026):
--  1. os pedidos de um caixa (`pedidos_do_caixa`) são
--     a) os que têm pagamento confirmado na sessão (como antes), e
--     b) os criados entre a abertura e o fechamento da sessão que não têm
--        pagamento confirmado em NENHUMA sessão — já aceitos, não cancelados
--        nem recusados.
--     Um pedido não aparece em duas sessões: se (b) for recebido depois, em
--     outra sessão, passa a contar só nela.
--  2. a contagem de itens usa esse conjunto;
--  3. o resumo ganha `sem_recebimento`: os pedidos de (b), com número,
--     cliente, modalidade, estado, total e se o pagamento entrou fora do
--     caixa ou é fiado. A tela avisa antes de fechar.
-- Os valores em dinheiro NÃO mudam: recebido por forma, esperado e diferença
-- continuam sendo só o que entrou na sessão (RN-CAIXA-011).

create or replace function public.pedidos_do_caixa(p_sessao uuid)
returns table (order_id uuid, recebido_no_caixa boolean)
language sql stable set search_path = ''
as $$
  with s as (
    select cs.id, cs.opened_at, coalesce(cs.closed_at, now()) as fim
      from public.cash_sessions cs where cs.id = p_sessao
  )
  select o.id, true
    from public.orders o
   where o.status not in ('cancelled', 'rejected')
     and exists (select 1 from public.payments p
                  where p.order_id = o.id and p.cash_session_id = p_sessao
                    and p.status = 'confirmed')
  union all
  select o.id, false
    from public.orders o, s
   where o.created_at >= s.opened_at and o.created_at < s.fim
     and o.status not in ('cancelled', 'rejected', 'waiting_pix_confirmation',
                          'waiting_delivery_approval', 'waiting_store_confirmation',
                          'change_requested_waiting_customer')
     and not exists (select 1 from public.payments p
                      where p.order_id = o.id and p.cash_session_id is not null
                        and p.status = 'confirmed');
$$;

comment on function public.pedidos_do_caixa is
  'D-2026-10-27-169: pedidos de uma sessão de caixa — pagos nela, ou criados nela e ainda sem recebimento em caixa nenhum.';

revoke all on function public.pedidos_do_caixa(uuid) from public, anon;
grant execute on function public.pedidos_do_caixa(uuid) to authenticated;

do $$
declare
  v_def text := pg_get_functiondef('public.resumo_do_fechamento(uuid)'::regprocedure);
  v_novo text := v_def;
  v_antigo text := E'             and oi.order_id in (select o.id from public.orders o\n                                  where o.status not in (''cancelled'', ''rejected'')\n                                    and exists (select 1 from public.payments p\n                                                 where p.order_id = o.id\n                                                   and p.cash_session_id = v_s.id\n                                                   and p.status = ''confirmed''))';
begin
  if v_def like '%0176: pedidos do turno%' then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_antigo, ''))) / length(v_antigo) <> 2 then
    raise exception 'resumo_do_fechamento mudou: patch da contagem dos pedidos do turno';
  end if;

  -- A contagem de itens passa a usar os pedidos do turno.
  v_novo := replace(v_novo, v_antigo,
    E'             and oi.order_id in (select pc.order_id from public.pedidos_do_caixa(v_s.id) pc)');

  -- Os pedidos do turno sem recebimento no caixa, para a tela avisar.
  v_novo := replace(v_novo,
    E'    -- 0173: itens vendidos (pizzas, fogazzas e bebidas).\n',
    E'    -- 0176: pedidos do turno sem recebimento no caixa.\n    ''sem_recebimento'', coalesce((\n      select jsonb_agg(jsonb_build_object(\n               ''pedido_id'', o.id, ''numero'', o.order_number,\n               ''cliente'', o.customer_name_snapshot, ''modalidade'', o.fulfillment_type,\n               ''status'', o.status, ''total'', o.total,\n               ''pago_fora_do_caixa'', exists (select 1 from public.payments p\n                                              where p.order_id = o.id and p.status = ''confirmed''),\n               ''fiado'', o.deferred_at is not null)\n             order by o.order_number)\n        from public.pedidos_do_caixa(v_s.id) pc\n        join public.orders o on o.id = pc.order_id\n       where not pc.recebido_no_caixa), ''[]''::jsonb),\n\n    -- 0173: itens vendidos (pizzas, fogazzas e bebidas).\n');

  if v_novo not like '%0176: pedidos do turno%' then
    raise exception 'resumo_do_fechamento mudou: patch do aviso de sem recebimento';
  end if;

  execute v_novo;
end;
$$;
