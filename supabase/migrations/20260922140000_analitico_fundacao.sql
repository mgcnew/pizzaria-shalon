-- 0089 — Fundação analítica: período, fuso e a verdade de cada número
-- 04-REGRAS-NEGOCIO.md RN-REL-001/002/003, RN-PGTO-002/003, RN-CLASS-001,
--                      RN-CAIXA-008/010/014 · 01-DOCUMENTO-MESTRE.md §79.24
-- 02-MODELO-DADOS-SUPABASE.md §21 · CLAUDE.md §28, §39
--
-- ===========================================================================
-- A VERDADE ANALÍTICA — o que cada número é, e o que ele NÃO é
-- ===========================================================================
--
-- O sistema já separa, de propósito, coisas que outros sistemas misturam.
-- Somar tudo num indicador só desfaria o trabalho das fases 5 a 8. Então:
--
-- VENDA REGISTRADA — `orders` com status `completed`. É o ato comercial
--   concluído: a pizza saiu e o pedido terminou. Data de competência:
--   `completed_at`, no fuso da loja. NÃO inclui pedido em andamento,
--   cancelado ou rejeitado.
--
-- FATURAMENTO RECEBIDO — `payments` com status `confirmed`. É o dinheiro que
--   efetivamente entrou, por qualquer meio (RN-PGTO-003: relatório
--   financeiro usa o REALIZADO). Data de competência: `received_at`.
--   Pagamento estornado sai da conta.
--
-- OS DOIS NÃO SÃO O MESMO NÚMERO, e a diferença é informação, não erro:
--   entrega concluída cujo dinheiro ainda está com o motoboy é venda
--   registrada e ainda não é faturamento recebido (RN-PGTO-014). Por isso
--   existe `nao_recebido`, que expõe a diferença em vez de escondê-la.
--
-- O QUE NUNCA ENTRA EM RECEITA:
--   · cortesia, consumo de funcionário, consumo do proprietário e perda —
--     são `internal_product_movements`, e RN-CLASS-001 diz que não são venda.
--     O `reference_unit_price` deles é de REFERÊNCIA, não faturamento;
--   · sangria e reforço — dinheiro mudando de lugar (RN-CAIXA-008/009);
--   · movimento de caixa em geral — `cash_movements` é o livro FÍSICO da
--     gaveta, não o livro de vendas (03 §17.1);
--   · entrada/despesa operacional — `financial_entries` é outro livro, e
--     aparece em relatório próprio, nunca somado a venda.
--
-- E O QUE NÃO EXISTE: lucro, margem e CMV. Sem ficha técnica e sem estoque
-- quantitativo, qualquer número com esse nome seria inventado (CLAUDE.md
-- §28). A terminologia é "faturamento registrado" e "saldo operacional".

-- ===========================================================================
-- FUSO E PERÍODO
-- ===========================================================================
-- RN-REL-001 e §26 da autorização: "dia" é dia da LOJA. Agrupar por UTC cru
-- jogaria o pedido das 21h de sábado (00h UTC de domingo) para o dia
-- seguinte, e o relatório de sábado perderia a noite inteira de movimento.
create or replace function public.fuso_da_loja()
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.timezone from public.store_settings s limit 1),
                  'America/Sao_Paulo');
$$;

comment on function public.fuso_da_loja is
  'Fuso configurado da loja. Toda data de negócio é calculada nele, nunca em UTC cru.';

revoke all on function public.fuso_da_loja() from public, anon;
grant execute on function public.fuso_da_loja() to authenticated;

-- Converte um instante para a DATA local da loja.
create or replace function public.dia_da_loja(p_em timestamptz)
returns date language sql stable security definer set search_path = ''
as $$
  select (p_em at time zone public.fuso_da_loja())::date;
$$;

revoke all on function public.dia_da_loja(timestamptz) from public, anon;
grant execute on function public.dia_da_loja(timestamptz) to authenticated;

-- O período pedido e o período ANTERIOR EQUIVALENTE, em instantes absolutos.
--
-- §3 da autorização: comparação usa duração igual. "Últimos 7 dias" compara
-- com os 7 dias imediatamente anteriores — nunca com um mês, nunca com um
-- pedaço. `dias` sai na resposta para a interface poder dizer o que comparou.
--
-- Chaves: hoje · ontem · 7d · 30d · mes_atual · personalizado.
create or replace function public.periodo_analitico(
  p_chave text default '30d',
  p_de date default null,
  p_ate date default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz text := public.fuso_da_loja();
  v_hoje date := (now() at time zone v_tz)::date;
  v_de date;
  v_ate date;   -- inclusivo, em data local
  v_dias integer;
  v_rotulo text;
begin
  case coalesce(p_chave, '30d')
    when 'hoje' then
      v_de := v_hoje; v_ate := v_hoje; v_rotulo := 'Hoje';
    when 'ontem' then
      v_de := v_hoje - 1; v_ate := v_hoje - 1; v_rotulo := 'Ontem';
    when '7d' then
      v_de := v_hoje - 6; v_ate := v_hoje; v_rotulo := 'Últimos 7 dias';
    when '30d' then
      v_de := v_hoje - 29; v_ate := v_hoje; v_rotulo := 'Últimos 30 dias';
    when 'mes_atual' then
      v_de := date_trunc('month', v_hoje)::date; v_ate := v_hoje;
      v_rotulo := 'Mês atual';
    when 'personalizado' then
      if p_de is null or p_ate is null then
        return jsonb_build_object('ok', false, 'erro', 'Informe as duas datas do período.');
      end if;
      if p_ate < p_de then
        return jsonb_build_object('ok', false, 'erro', 'A data final é anterior à inicial.');
      end if;
      -- Limite de sanidade: 2 anos. Acima disso a consulta deixa de ser
      -- relatório e vira varredura (CLAUDE.md §39).
      if p_ate - p_de > 731 then
        return jsonb_build_object('ok', false, 'erro', 'Período longo demais (máximo 2 anos).');
      end if;
      v_de := p_de; v_ate := p_ate;
      v_rotulo := to_char(v_de, 'DD/MM/YYYY') || ' a ' || to_char(v_ate, 'DD/MM/YYYY');
    else
      return jsonb_build_object('ok', false, 'erro', 'Período inválido.');
  end case;

  v_dias := (v_ate - v_de) + 1;

  return jsonb_build_object(
    'ok', true,
    'chave', coalesce(p_chave, '30d'),
    'rotulo', v_rotulo,
    'de', v_de,
    'ate', v_ate,
    'dias', v_dias,
    -- Instantes absolutos: início do primeiro dia local, início do dia
    -- SEGUINTE ao último. Fronteira [inicio, fim) — sem perder o pedido das
    -- 23h59 nem contar duas vezes a virada.
    'inicio', (v_de::timestamp at time zone v_tz),
    'fim', ((v_ate + 1)::timestamp at time zone v_tz),
    -- Período anterior de MESMA duração, imediatamente antes.
    'inicio_anterior', ((v_de - v_dias)::timestamp at time zone v_tz),
    'fim_anterior', (v_de::timestamp at time zone v_tz),
    'de_anterior', v_de - v_dias,
    'ate_anterior', v_de - 1,
    'fuso', v_tz);
end;
$$;

comment on function public.periodo_analitico is
  'RN-REL-001: período no fuso da loja e o anterior EQUIVALENTE, de mesma duração.';

revoke all on function public.periodo_analitico(text, date, date) from public, anon;
grant execute on function public.periodo_analitico(text, date, date) to authenticated;

-- Variação entre dois números, de forma explicável.
--
-- Quando a base é zero ou nula, NÃO existe percentual: "subiu 100%" a partir
-- do nada é uma afirmação sem conteúdo. Nesse caso o percentual sai nulo e
-- `comparavel` sai falso, e a interface diz "sem base de comparação" em vez
-- de exibir um número bonito e vazio.
create or replace function public.variacao_percentual(p_de numeric, p_para numeric)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'de', p_de,
    'para', p_para,
    'diferenca', coalesce(p_para, 0) - coalesce(p_de, 0),
    'comparavel', p_de is not null and p_de <> 0 and p_para is not null,
    'percentual', case when p_de is not null and p_de <> 0 and p_para is not null
                       then round(((p_para - p_de) / abs(p_de)) * 100, 1) end);
$$;

comment on function public.variacao_percentual is
  'Variação explicável. Base zero não vira percentual — vira "sem base de comparação".';

revoke all on function public.variacao_percentual(numeric, numeric) from public, anon;
grant execute on function public.variacao_percentual(numeric, numeric) to authenticated;

-- ===========================================================================
-- ÍNDICES DA COMPETÊNCIA ANALÍTICA
-- ===========================================================================
-- Os índices existentes cobrem `created_at`, que é quando o pedido CHEGOU.
-- A analítica agrupa por quando ele foi CONCLUÍDO e por quando o dinheiro
-- ENTROU — outras colunas, outras consultas (CLAUDE.md §39).
create index orders_concluidos_em on public.orders (completed_at desc)
  where status = 'completed';
create index payments_recebidos_em on public.payments (received_at desc)
  where status = 'confirmed';
create index order_status_history_destino
  on public.order_status_history (to_status, created_at desc);

-- ===========================================================================
-- VENDAS REGISTRADAS
-- ===========================================================================
-- SECURITY DEFINER com checagem explícita de `reports.view`, e não INVOKER.
--
-- POR QUÊ: a agregação cruza `orders`, `payments` e `order_status_history`,
-- que têm RLS diferentes entre si — `payments` exige `finance.view`. Como
-- INVOKER, quem tivesse `orders.view` e não `finance.view` receberia
-- "faturamento R$ 0,00" em vez de "você não pode ver isto": um número
-- silenciosamente errado, que é pior que um erro. Com a checagem explícita,
-- ou a pessoa vê o indicador inteiro, ou vê a recusa.
--
-- O que sai daqui é AGREGADO: nenhum nome, telefone ou endereço.
create or replace function public.vendas_no_periodo(p_periodo jsonb)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_inicio timestamptz := (p_periodo ->> 'inicio')::timestamptz;
  v_fim timestamptz := (p_periodo ->> 'fim')::timestamptz;
  v_pedidos integer;
  v_vendas numeric;
  v_itens numeric;
  v_taxas numeric;
begin
  select count(*)::integer,
         coalesce(sum(o.total), 0)::numeric(12,2),
         coalesce(sum(o.subtotal), 0)::numeric(12,2),
         coalesce(sum(o.delivery_fee), 0)::numeric(12,2)
    into v_pedidos, v_vendas, v_itens, v_taxas
    from public.orders o
   where o.status = 'completed'
     and o.completed_at >= v_inicio and o.completed_at < v_fim;

  return jsonb_build_object(
    'pedidos', v_pedidos,
    'vendas_registradas', v_vendas,
    'em_produtos', v_itens,
    'em_taxa_de_entrega', v_taxas,
    -- Ticket médio é venda por PEDIDO concluído. Sem pedido, é nulo — e não
    -- zero: zero diria "o ticket foi R$ 0,00", que é outra afirmação.
    'ticket_medio', case when v_pedidos > 0
                         then round(v_vendas / v_pedidos, 2) end,

    'por_origem', coalesce((
      select jsonb_agg(jsonb_build_object(
               'origem', t.source, 'pedidos', t.qtd, 'valor', t.valor)
             order by t.valor desc, t.source)
        from (select o.source, count(*)::integer as qtd,
                     coalesce(sum(o.total), 0)::numeric(12,2) as valor
                from public.orders o
               where o.status = 'completed'
                 and o.completed_at >= v_inicio and o.completed_at < v_fim
               group by o.source) t), '[]'::jsonb),

    'por_modalidade', coalesce((
      select jsonb_agg(jsonb_build_object(
               'modalidade', t.fulfillment_type, 'pedidos', t.qtd, 'valor', t.valor)
             order by t.valor desc)
        from (select o.fulfillment_type, count(*)::integer as qtd,
                     coalesce(sum(o.total), 0)::numeric(12,2) as valor
                from public.orders o
               where o.status = 'completed'
                 and o.completed_at >= v_inicio and o.completed_at < v_fim
               group by o.fulfillment_type) t), '[]'::jsonb));
end;
$$;

comment on function public.vendas_no_periodo is
  'Venda registrada = pedido `completed`, por `completed_at` no fuso da loja. Não é dinheiro recebido.';

revoke all on function public.vendas_no_periodo(jsonb) from public, anon, authenticated;

-- ===========================================================================
-- FATURAMENTO RECEBIDO
-- ===========================================================================
-- RN-PGTO-003. O realizado, por meio de pagamento, e a parte que ainda não
-- entrou em gaveta nenhuma (RN-CAIXA-014) — que é a ponte honesta entre
-- "vendi" e "recebi".
create or replace function public.recebido_no_periodo(p_periodo jsonb)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_inicio timestamptz := (p_periodo ->> 'inicio')::timestamptz;
  v_fim timestamptz := (p_periodo ->> 'fim')::timestamptz;
  v_total numeric;
  v_fora numeric;
  v_estornado numeric;
begin
  select coalesce(sum(p.amount), 0)::numeric(12,2)
    into v_total
    from public.payments p
   where p.status = 'confirmed'
     and p.received_at >= v_inicio and p.received_at < v_fim;

  -- Recebido que ainda não entrou na gaveta: dinheiro com o motoboy, ou
  -- exceção autorizada de caixa fechado. Continua sendo faturamento; o que
  -- ele ainda não é, é caixa físico.
  select coalesce(sum(p.amount), 0)::numeric(12,2)
    into v_fora
    from public.payments p
   where p.status = 'confirmed'
     and p.payment_method_family_snapshot = 'cash'
     and p.cash_session_id is null
     and p.received_at >= v_inicio and p.received_at < v_fim;

  select coalesce(sum(p.amount), 0)::numeric(12,2)
    into v_estornado
    from public.payments p
   where p.status = 'reversed'
     and p.received_at >= v_inicio and p.received_at < v_fim;

  return jsonb_build_object(
    'faturamento_recebido', v_total,
    'ainda_fora_da_gaveta', v_fora,
    'estornado_no_periodo', v_estornado,
    'por_forma', coalesce((
      select jsonb_agg(jsonb_build_object(
               'forma', t.forma, 'familia', t.familia,
               'pagamentos', t.qtd, 'valor', t.valor)
             order by t.valor desc, t.forma)
        from (select p.payment_method_name_snapshot as forma,
                     p.payment_method_family_snapshot as familia,
                     count(*)::integer as qtd,
                     coalesce(sum(p.amount), 0)::numeric(12,2) as valor
                from public.payments p
               where p.status = 'confirmed'
                 and p.received_at >= v_inicio and p.received_at < v_fim
               group by 1, 2) t), '[]'::jsonb));
end;
$$;

comment on function public.recebido_no_periodo is
  'RN-PGTO-003: faturamento RECEBIDO, de `payments` confirmados. Estorno sai da conta.';

revoke all on function public.recebido_no_periodo(jsonb) from public, anon, authenticated;

-- ===========================================================================
-- PEDIDOS QUE NÃO VIRARAM VENDA
-- ===========================================================================
-- Cancelamento e rejeição têm data própria no HISTÓRICO, não em `orders`:
-- `cancelled_at` existe, mas rejeição não tem coluna de horário. Usar o
-- histórico dá a mesma régua para os dois (RN-STATE-009/010).
create or replace function public.nao_vendas_no_periodo(p_periodo jsonb)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'cancelados', (
      select count(*)::integer from public.order_status_history h
       where h.to_status = 'cancelled'
         and h.created_at >= (p_periodo ->> 'inicio')::timestamptz
         and h.created_at <  (p_periodo ->> 'fim')::timestamptz),
    'rejeitados', (
      select count(*)::integer from public.order_status_history h
       where h.to_status = 'rejected'
         and h.created_at >= (p_periodo ->> 'inicio')::timestamptz
         and h.created_at <  (p_periodo ->> 'fim')::timestamptz),
    'falhas_de_entrega', (
      select count(*)::integer from public.order_status_history h
       where h.to_status = 'delivery_failed'
         and h.created_at >= (p_periodo ->> 'inicio')::timestamptz
         and h.created_at <  (p_periodo ->> 'fim')::timestamptz),
    'valor_cancelado', coalesce((
      select sum(o.total) from public.orders o
       where o.status = 'cancelled' and o.cancelled_at >= (p_periodo ->> 'inicio')::timestamptz
         and o.cancelled_at < (p_periodo ->> 'fim')::timestamptz), 0)::numeric(12,2));
$$;

comment on function public.nao_vendas_no_periodo is
  'Cancelamento e rejeição datados pelo histórico de status — rejeição não tem coluna de horário.';

revoke all on function public.nao_vendas_no_periodo(jsonb) from public, anon, authenticated;

-- ===========================================================================
-- O QUE NÃO É VENDA E MESMO ASSIM SAIU DA COZINHA
-- ===========================================================================
-- RN-CLASS-001. Aparece em relatório PRÓPRIO, nunca somado a faturamento. O
-- valor é de REFERÊNCIA: dimensiona o movimento, não cobra de ninguém.
create or replace function public.internos_no_periodo(p_periodo jsonb)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', t.tipo, 'movimentos', t.qtd, 'valor_referencia', t.valor)
         order by t.tipo), '[]'::jsonb)
    from (
      select m.movement_type as tipo,
             count(distinct m.id)::integer as qtd,
             coalesce(sum(i.quantity * i.reference_unit_price), 0)::numeric(12,2) as valor
        from public.internal_product_movements m
        left join public.internal_product_movement_items i on i.movement_id = m.id
       where m.status = 'confirmed'
         and m.occurred_at >= (p_periodo ->> 'inicio')::timestamptz
         and m.occurred_at <  (p_periodo ->> 'fim')::timestamptz
       group by m.movement_type) t;
$$;

comment on function public.internos_no_periodo is
  'RN-CLASS-001: cortesia, consumo e perda. NUNCA entram em faturamento — valor é de referência.';

revoke all on function public.internos_no_periodo(jsonb) from public, anon, authenticated;

-- ===========================================================================
-- RESUMO COM COMPARAÇÃO
-- ===========================================================================
-- A porta única da camada de aplicação para os indicadores do topo. Faz o
-- período atual, o anterior equivalente e a variação — uma consulta por
-- tela, não uma por indicador (CLAUDE.md §39).
create or replace function public.resumo_analitico(
  p_chave text default '30d', p_de date default null, p_ate date default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_periodo jsonb;
  v_anterior jsonb;
  v_atual jsonb;
  v_ant jsonb;
begin
  -- RN-RBAC-004: permissão semântica efetiva, nunca nome de cargo.
  if not public.has_permission('reports.view') then
    return jsonb_build_object('ok', false, 'sem_permissao', true,
      'erro', 'Você não tem permissão para ver indicadores.');
  end if;

  v_periodo := public.periodo_analitico(p_chave, p_de, p_ate);
  if not (v_periodo ->> 'ok')::boolean then
    return v_periodo;
  end if;

  -- O período anterior é o mesmo objeto com a janela deslocada: assim as
  -- duas metades são medidas exatamente pela mesma régua.
  v_anterior := v_periodo
    || jsonb_build_object('inicio', v_periodo -> 'inicio_anterior',
                          'fim', v_periodo -> 'fim_anterior');

  v_atual := public.vendas_no_periodo(v_periodo)
          || public.recebido_no_periodo(v_periodo)
          || public.nao_vendas_no_periodo(v_periodo);

  v_ant := public.vendas_no_periodo(v_anterior)
        || public.recebido_no_periodo(v_anterior)
        || public.nao_vendas_no_periodo(v_anterior);

  return jsonb_build_object(
    'ok', true,
    'periodo', v_periodo,
    'atual', v_atual,
    'anterior', v_ant,
    'internos', public.internos_no_periodo(v_periodo),
    -- A diferença entre vender e receber, dita em vez de escondida.
    'nao_recebido_do_periodo',
      ((v_atual ->> 'vendas_registradas')::numeric
       - (v_atual ->> 'faturamento_recebido')::numeric)::numeric(12,2),
    'variacao', jsonb_build_object(
      'vendas_registradas', public.variacao_percentual(
        (v_ant ->> 'vendas_registradas')::numeric, (v_atual ->> 'vendas_registradas')::numeric),
      'faturamento_recebido', public.variacao_percentual(
        (v_ant ->> 'faturamento_recebido')::numeric, (v_atual ->> 'faturamento_recebido')::numeric),
      'pedidos', public.variacao_percentual(
        (v_ant ->> 'pedidos')::numeric, (v_atual ->> 'pedidos')::numeric),
      'ticket_medio', public.variacao_percentual(
        (v_ant ->> 'ticket_medio')::numeric, (v_atual ->> 'ticket_medio')::numeric)));
end;
$$;

comment on function public.resumo_analitico is
  'Indicadores do período com o anterior EQUIVALENTE. Venda e recebimento são números diferentes, e a diferença é mostrada.';

revoke all on function public.resumo_analitico(text, date, date) from public, anon;
grant execute on function public.resumo_analitico(text, date, date) to authenticated;
