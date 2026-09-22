-- 0079 — Dois defeitos achados pelo teste da Fase 8.
--
-- 1. `central_de_entregas().dinheiro_na_rua` só contava pedido já CONFERIDO
--    como entregue. Mas o dinheiro sai da loja quando o motoboy sai, não
--    quando alguém confere o retorno: enquanto ele está na rua — que é
--    exatamente quando a pergunta importa — o painel mostrava R$ 0,00 e
--    dizia à Shalon que não havia dinheiro fora. Passa a contar todo
--    recebimento em dinheiro dos pedidos da corrida que ainda não entrou em
--    gaveta nenhuma, conferido ou não.
--
--    O ACERTO continua olhando só o entregue, e deve mesmo: acerta-se o que
--    foi entregue. São duas perguntas diferentes — "quanto está fora" e
--    "quanto ele deve trazer" — e elas divergem no meio da corrida.
--
-- 2. `dinheiro_fora_da_gaveta()` devolvia "40.00" com valor e "0" sem. Mesma
--    inconsistência de escala que a 0070 corrigiu nas respostas das RPCs:
--    o zero passa a ser `0.00`, como qualquer outro dinheiro do sistema.

create or replace function public.dinheiro_fora_da_gaveta()
returns numeric language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(p.amount), 0)::numeric(12,2)
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
                   -- RN-CAIXA-014: isto é dinheiro NA RUA. Não é caixa, e
                   -- não espera conferência para existir: se o recebimento
                   -- em dinheiro foi registrado e não entrou em gaveta, ele
                   -- está com o motoboy. `reassigned` sai da conta porque
                   -- aquele pedido passou para outra corrida.
                   'dinheiro_na_rua', coalesce((
                       select sum(p.amount) from public.payments p
                         join public.driver_run_orders o on o.order_id = p.order_id
                        where o.driver_run_id = r.id
                          and o.delivery_status <> 'reassigned'
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
