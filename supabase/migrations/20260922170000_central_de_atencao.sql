-- 0092 — Central de atenção: o que pede ação agora
-- 04-REGRAS-NEGOCIO.md RN-DASH-001/002/003/004, RN-CAIXA-007/013/014,
--                      RN-RUN-003, RN-CRM-001 · 01-DOCUMENTO-MESTRE.md §79.23
-- 02-MODELO-DADOS-SUPABASE.md §3.4 · CLAUDE.md §39
--
-- RN-DASH-001: o topo do administrativo é CENTRAL DE ATENÇÃO, não vitrine de
-- gráficos. O critério para uma linha existir aqui é duro: só entra o que
-- tem ação possível. Informação sem ação vai para os indicadores, abaixo.
--
-- RN-DASH-002: pendência resolvida some sozinha. Nada aqui é "marcado como
-- lido" — a fila é derivada do estado real, então aceitar o pedido tira o
-- pedido da fila, e ponto.
--
-- ===========================================================================
-- OS LIMITES DE TEMPO SÃO CONFIGURÁVEIS — e podem não estar configurados
-- ===========================================================================
-- RN-DASH-003 e 02 §3.4: o tempo que torna uma espera "atrasada" vem de
-- `alert_thresholds`, com as chaves que o modelo de dados nomeia:
--
--   order_waiting_confirmation · pix_waiting_confirmation
--   delivery_approval_waiting  · customer_change_waiting
--   driver_run_pending_settlement
--
-- A tabela nasceu VAZIA de propósito na Fase 3: as chaves são conhecidas, os
-- minutos são da Shalon (seed estrutural da 0025). Enquanto um limite não
-- existir, a pendência continua aparecendo — ela é real —, mas sem carimbo
-- de atraso. Inventar "30 minutos" aqui seria decidir operação por
-- conveniência de implementação.
--
-- ===========================================================================
-- CADA BLOCO RESPONDE À PERMISSÃO DELE
-- ===========================================================================
-- A função é SECURITY DEFINER, e cada bloco é fechado pela permissão do
-- domínio: pedidos por `orders.view`, caixa por `cash.view`, entregas por
-- `deliveries.view`, clientes por `customers.view`. Quem só atende pedidos
-- vê a fila de pedidos e não descobre o caixa por um dashboard.

-- Minutos do limite, quando existir e estiver ativo.
create or replace function public.limite_de_alerta(p_chave text)
returns integer language sql stable security definer set search_path = ''
as $$
  select t.threshold_minutes
    from public.alert_thresholds t
   where t.alert_key = p_chave and t.is_active;
$$;

comment on function public.limite_de_alerta is
  'RN-DASH-003: limite configurável. Nulo = ainda não configurado, e nada é inventado no lugar.';

revoke all on function public.limite_de_alerta(text) from public, anon;
grant execute on function public.limite_de_alerta(text) to authenticated;

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
      -- RN-CAIXA-007: caixa esquecido aberto avisa, não fecha sozinho. O
      -- critério é o mesmo já usado na Fase 7 — nasceu em data operacional
      -- anterior à de hoje.
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
    -- porque sinalizar quem comprou duas vezes seria ruído (RN-CRM-003).
    'clientes', case when v_clientes then (
      select jsonb_build_object(
        'em_atencao', count(*) filter (where cl.classificacao = 'atencao')::integer,
        'afastados', count(*) filter (where cl.classificacao = 'afastado')::integer,
        'exemplos', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'cliente_id', e.customer_id, 'nome', e.nome,
                   'classificacao', e.classificacao,
                   'dias_sem_comprar', e.dias_sem_comprar,
                   'intervalo_tipico', e.intervalo_tipico,
                   'aceita_promocao', e.aceita_promocao)
                 order by e.dias_sem_comprar desc)
            from (select p.customer_id, c.name as nome, c.marketing_consent as aceita_promocao,
                         p.dias_sem_comprar, p.intervalo_tipico,
                         public.classificar_cliente(p.pedidos, p.intervalo_tipico,
                                                    p.dias_sem_comprar) as classificacao
                    from public.padrao_de_compra() p
                    join public.customers c on c.id = p.customer_id
                   where p.pedidos >= 3 and not c.is_blocked) e
           where e.classificacao in ('atencao', 'afastado')
           order by e.dias_sem_comprar desc
           limit 5), '[]'::jsonb))
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

-- Pendência de pedidos num conjunto de estados, com o limite quando houver.
--
-- Existe como função própria porque a mesma pergunta se repete seis vezes na
-- central, e repetir a consulta seis vezes seria seis lugares para divergir
-- (CLAUDE.md §17).
create or replace function public.pendencia_de_pedidos(
  p_status text[], p_chave_do_limite text default null)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'quantidade', count(*)::integer,
    'valor', coalesce(sum(o.total), 0)::numeric(12,2),
    'mais_antigo_em', min(o.created_at),
    'minutos_do_mais_antigo',
      case when count(*) > 0
           then floor(extract(epoch from (now() - min(o.created_at))) / 60)::integer end,
    'limite_minutos', case when p_chave_do_limite is not null
                           then public.limite_de_alerta(p_chave_do_limite) end,
    -- Nulo quando não há limite configurado: a pendência existe, e o atraso
    -- é que ainda não tem régua (RN-DASH-003).
    'atrasado', case
      when count(*) = 0 then false
      when p_chave_do_limite is null then null
      when public.limite_de_alerta(p_chave_do_limite) is null then null
      else extract(epoch from (now() - min(o.created_at))) / 60
           > public.limite_de_alerta(p_chave_do_limite)
    end,
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pedido_id', t.id, 'numero', t.order_number,
               'cliente', t.customer_name_snapshot, 'total', t.total,
               'modalidade', t.fulfillment_type, 'origem', t.source,
               'criado_em', t.created_at,
               'minutos', floor(extract(epoch from (now() - t.created_at)) / 60)::integer)
             order by t.created_at)
        from (select * from public.orders o2
               where o2.status = any(p_status)
               order by o2.created_at limit 10) t), '[]'::jsonb))
  from public.orders o
  where o.status = any(p_status);
$$;

comment on function public.pendencia_de_pedidos is
  'Uma régua só para as pendências da central. Sem limite configurado, a espera aparece sem carimbo de atraso.';

revoke all on function public.pendencia_de_pedidos(text[], text) from public, anon, authenticated;
