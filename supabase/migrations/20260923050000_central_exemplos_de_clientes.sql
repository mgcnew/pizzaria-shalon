-- 0097 — Correção: a central de atenção estourava ao montar os exemplos
-- 04-REGRAS-NEGOCIO.md RN-DASH-001, RN-CRM-003 · CLAUDE.md §11
--
-- O DEFEITO, encontrado pelo teste da Fase 9 antes de qualquer tela existir:
-- o bloco `clientes` da `central_de_atencao` montava os exemplos assim —
--
--   select jsonb_agg(... order by e.dias_sem_comprar desc)
--     from (...) e
--    where ...
--    order by e.dias_sem_comprar desc
--    limit 5
--
-- O `jsonb_agg` torna a consulta agregada; o `order by` e o `limit` que
-- vinham DEPOIS dele se aplicam ao resultado da agregação, e aí
-- `e.dias_sem_comprar` não está agrupado. Postgres recusa com 42803, e a
-- central inteira falhava para quem tivesse `customers.view` — não só o
-- bloco de clientes.
--
-- A correção: ordenar e cortar DENTRO da subconsulta, antes de agregar. O
-- filtro de classificação também desce para lá, para que o `limit 5` conte 5
-- clientes em atenção, e não 5 clientes quaisquer dos quais alguns servem.
--
-- Migration nova em vez de edição da 0092: aplicada é imutável
-- (supabase/README.md).

create or replace function public.central_de_atencao()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pedidos boolean := public.has_permission('orders.view');
  v_caixa boolean := public.has_permission('cash.view');
  v_entregas boolean := public.has_permission('deliveries.view');
  v_clientes boolean := public.has_permission('customers.view');
  v_agora timestamptz := now();
  -- Escalares, nunca RECORD: um record não atribuído estoura em plpgsql só
  -- por ser referenciado num ramo que nem seria escolhido (lição das
  -- migrations 0084 e 0086). Escalar simplesmente fica nulo.
  v_sessao_id uuid;
  v_sessao_data date;
begin
  if public.current_app_user_id() is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;

  if v_caixa then
    select s.id, s.operational_date into v_sessao_id, v_sessao_data
      from public.cash_sessions s
     where s.status = 'open' order by s.opened_at desc limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'em', v_agora,

    -- ------------------------------------------------------------ pedidos
    'pedidos', case when v_pedidos then jsonb_build_object(
      'aguardando_confirmacao', public.pendencia_de_pedidos(
        array['waiting_store_confirmation'], 'order_waiting_confirmation'),
      'aguardando_pix', public.pendencia_de_pedidos(
        array['waiting_pix_confirmation'], 'pix_waiting_confirmation'),
      'aguardando_aprovacao_de_entrega', public.pendencia_de_pedidos(
        array['waiting_delivery_approval'], 'delivery_approval_waiting'),
      'aguardando_cliente', public.pendencia_de_pedidos(
        array['change_requested_waiting_customer'], 'customer_change_waiting'),
      -- Pronto e parado: retirada esperando o cliente no balcão, entrega
      -- esperando motoboy. Não tem chave de limite própria no modelo, então
      -- aparece sem carimbo de atraso.
      'prontos_parados', public.pendencia_de_pedidos(
        array['ready_for_pickup', 'ready_for_delivery'], null),
      'entregas_com_falha', public.pendencia_de_pedidos(
        array['delivery_failed'], null))
    end,

    -- ----------------------------------------------------------- entregas
    'entregas', case when v_entregas then jsonb_build_object(
      -- RN-RUN-003: voltou e ainda não acertou. É a pendência que segura
      -- dinheiro fora da gaveta.
      'aguardando_acerto', (
        select jsonb_build_object(
                 'quantidade', count(*)::integer,
                 'mais_antiga_em', min(r.returned_at),
                 'minutos_da_mais_antiga',
                   floor(extract(epoch from (v_agora - min(r.returned_at))) / 60)::integer,
                 'limite_minutos', public.limite_de_alerta('driver_run_pending_settlement'),
                 'atrasada', case when public.limite_de_alerta('driver_run_pending_settlement') is not null
                                  then extract(epoch from (v_agora - min(r.returned_at))) / 60
                                       > public.limite_de_alerta('driver_run_pending_settlement')
                             end)
          from public.driver_runs r where r.status = 'settling'),
      'na_rua', (
        select jsonb_build_object(
                 'corridas', count(*)::integer,
                 'dinheiro_na_rua',
                   coalesce(sum(public.dinheiro_da_corrida(r.id, false)), 0)::numeric(12,2))
          from public.driver_runs r where r.status = 'out'))
    end,

    -- -------------------------------------------------------------- caixa
    'caixa', case when v_caixa then jsonb_build_object(
      'aberto', v_sessao_id is not null,
      'sessao_id', v_sessao_id,
      'data_operacional', v_sessao_data,
      -- RN-CAIXA-007: caixa esquecido aberto avisa, não fecha sozinho.
      'aberto_de_ontem', v_sessao_id is not null
                         and v_sessao_data < public.dia_da_loja(v_agora),
      'esperado_em_dinheiro', case when v_sessao_id is not null
                                   then public.esperado_em_caixa(v_sessao_id) end,
      -- RN-CAIXA-014: não é caixa físico, e por isso aparece separado.
      'dinheiro_fora_da_gaveta', public.dinheiro_fora_da_gaveta(),
      -- RN-CAIXA-012: a última sessão fechou com diferença? Fica visível sem
      -- virar alarme permanente: é uma linha, com o valor.
      'ultimo_fechamento_com_diferenca', (
        select jsonb_build_object('sessao_id', f.id, 'fechada_em', f.closed_at,
                                  'diferenca', f.difference_amount,
                                  'justificativa', f.difference_reason)
          from public.cash_sessions f
         where f.status = 'closed' and f.difference_amount is not null
           and f.difference_amount <> 0
         order by f.closed_at desc limit 1))
    end,

    -- ----------------------------------------------------------- clientes
    -- §4 da autorização: "clientes relevantes em risco de afastamento".
    -- Relevante aqui é quem tem histórico de verdade — 3 ou mais compras —,
    -- porque sinalizar quem comprou duas vezes seria ruído (RN-CRM-003/004).
    'clientes', case when v_clientes then (
      select jsonb_build_object(
        'em_atencao', count(*) filter (where cl.classificacao = 'atencao')::integer,
        'afastados', count(*) filter (where cl.classificacao = 'afastado')::integer,
        -- Ordena e corta ANTES de agregar: o `limit` escolhe os 5 mais
        -- ausentes entre os que já foram filtrados, e não 5 quaisquer.
        'exemplos', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'cliente_id', e.customer_id, 'nome', e.nome,
                   'classificacao', e.classificacao,
                   'dias_sem_comprar', e.dias_sem_comprar,
                   'intervalo_tipico', e.intervalo_tipico,
                   'aceita_promocao', e.aceita_promocao)
                 order by e.dias_sem_comprar desc)
            from (select p.customer_id, c.name as nome,
                         c.marketing_consent as aceita_promocao,
                         p.dias_sem_comprar, p.intervalo_tipico,
                         public.classificar_cliente(p.pedidos, p.intervalo_tipico,
                                                    p.dias_sem_comprar) as classificacao
                    from public.padrao_de_compra() p
                    join public.customers c on c.id = p.customer_id
                   where p.pedidos >= 3 and not c.is_blocked
                     and public.classificar_cliente(p.pedidos, p.intervalo_tipico,
                                                    p.dias_sem_comprar)
                         in ('atencao', 'afastado')
                   order by p.dias_sem_comprar desc
                   limit 5) e), '[]'::jsonb))
      from (select public.classificar_cliente(p.pedidos, p.intervalo_tipico,
                                              p.dias_sem_comprar) as classificacao
              from public.padrao_de_compra() p
              join public.customers c on c.id = p.customer_id
             where p.pedidos >= 3 and not c.is_blocked) cl)
    end);
end;
$$;

comment on function public.central_de_atencao is
  'RN-DASH-001/002: fila derivada do estado real. Cada bloco responde à permissão do domínio dele.';

revoke all on function public.central_de_atencao() from public, anon;
grant execute on function public.central_de_atencao() to authenticated;
