-- 0100 — O rodapé de totais mostrava o nome do campo, não o rótulo
-- 04-REGRAS-NEGOCIO.md RN-PGTO-003, RN-CAIXA-014 · CLAUDE.md §11
--
-- ENCONTRADO na validação visual com massa povoada: o relatório de formas de
-- pagamento terminava com
--
--     ainda_fora_da_gaveta: 0faturamento_recebido: 558,95
--
-- Duas coisas erradas na mesma linha. O rodapé procura o rótulo pela COLUNA
-- de mesma chave; como esses dois totais não eram colunas, sobrava o nome do
-- campo do JSON — na tela e dentro do CSV, do Excel e do PDF.
--
-- A correção tem duas partes, e a segunda é de produto:
--
--   · o total passa a usar a chave `valor`, que É a coluna de valor, e então
--     aparece como "Valor: R$ 558,95";
--   · "ainda fora da gaveta" DEIXA de ser total e vira RESSALVA em texto.
--     Ele nunca foi um total daquela tabela: não é uma forma de pagamento, é
--     um recorte do mesmo dinheiro. Como número solto no rodapé, convidava a
--     somar duas vezes (RN-CAIXA-014).
--
-- Migration nova em vez de edição da 0095, que já foi aplicada.

create or replace function public.relatorio_tabular(
  p_tipo text,
  p_chave text default '30d',
  p_de date default null,
  p_ate date default null,
  p_filtros jsonb default '{}'::jsonb,
  p_exportar boolean default false)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_periodo jsonb;
  v_ini timestamptz;
  v_fim timestamptz;
  v_colunas jsonb;
  v_linhas jsonb;
  v_totais jsonb := '{}'::jsonb;
  v_ressalvas jsonb := '[]'::jsonb;
  v_titulo text;
  -- Exportação carrega mais linhas que a tela; ainda assim tem teto, porque
  -- relatório sem teto vira varredura (CLAUDE.md §39).
  v_limite integer := case when p_exportar then 5000 else 500 end;
  v_dominio text;
  v_recebido jsonb;
begin
  if not public.has_permission('reports.view') then
    return jsonb_build_object('ok', false, 'sem_permissao', true,
      'erro', 'Você não tem permissão para ver relatórios.');
  end if;

  if p_exportar and not public.has_permission('reports.export') then
    return jsonb_build_object('ok', false, 'sem_permissao', true,
      'erro', 'Você não tem permissão para exportar relatórios.');
  end if;

  -- A permissão do domínio de cada relatório.
  v_dominio := case p_tipo
    when 'vendas_por_dia'      then 'orders.view'
    when 'vendas_por_produto'  then 'orders.view'
    when 'vendas_por_categoria' then 'orders.view'
    when 'pedidos'             then 'orders.view'
    when 'formas_de_pagamento' then 'finance.view'
    when 'clientes'            then 'customers.view'
    when 'movimentos_internos' then 'internal.view'
    when 'caixa'               then 'cash.view'
    when 'entregas'            then 'deliveries.view'
    when 'remarketing'         then 'remarketing.view'
    else null end;

  if v_dominio is null then
    return jsonb_build_object('ok', false, 'erro', 'Relatório desconhecido.');
  end if;

  if not public.has_permission(v_dominio) then
    return jsonb_build_object('ok', false, 'sem_permissao', true,
      'erro', 'Você não tem permissão para ver os dados deste relatório.');
  end if;

  v_periodo := public.periodo_analitico(p_chave, p_de, p_ate);
  if not (v_periodo ->> 'ok')::boolean then
    return v_periodo;
  end if;
  v_ini := (v_periodo ->> 'inicio')::timestamptz;
  v_fim := (v_periodo ->> 'fim')::timestamptz;

  -- =========================================================== vendas por dia
  if p_tipo = 'vendas_por_dia' then
    v_titulo := 'Vendas por dia';
    v_colunas := jsonb_build_array(
      jsonb_build_object('chave','data','rotulo','Data','tipo','data'),
      jsonb_build_object('chave','pedidos','rotulo','Pedidos','tipo','numero'),
      jsonb_build_object('chave','vendas_registradas','rotulo','Venda registrada','tipo','dinheiro'),
      jsonb_build_object('chave','ticket_medio','rotulo','Ticket médio','tipo','dinheiro'),
      jsonb_build_object('chave','faturamento_recebido','rotulo','Faturamento recebido','tipo','dinheiro'));
    -- Venda e recebimento são competências DIFERENTES, e aparecem em colunas
    -- diferentes. A linha não "concilia" nada: mostra os dois fatos.
    v_ressalvas := jsonb_build_array(
      'Venda registrada é pedido concluído no dia. Faturamento recebido é pagamento confirmado no dia. Os dois números não precisam coincidir.');

    with dias as (
      select generate_series((v_periodo ->> 'de')::date,
                             (v_periodo ->> 'ate')::date, interval '1 day')::date as dia
    ),
    vendas as (
      select public.dia_da_loja(o.completed_at) as dia,
             count(*)::integer as pedidos,
             coalesce(sum(o.total), 0)::numeric(12,2) as valor
        from public.orders o
       where o.status = 'completed'
         and o.completed_at >= v_ini and o.completed_at < v_fim
       group by 1
    ),
    recebidos as (
      select public.dia_da_loja(p.received_at) as dia,
             coalesce(sum(p.amount), 0)::numeric(12,2) as valor
        from public.payments p
       where p.status = 'confirmed'
         and p.received_at >= v_ini and p.received_at < v_fim
       group by 1
    )
    select jsonb_agg(jsonb_build_object(
             'data', d.dia,
             'pedidos', coalesce(v.pedidos, 0),
             'vendas_registradas', coalesce(v.valor, 0)::numeric(12,2),
             'ticket_medio', case when coalesce(v.pedidos, 0) > 0
                                  then round(v.valor / v.pedidos, 2) end,
             'faturamento_recebido', coalesce(r.valor, 0)::numeric(12,2))
           order by d.dia)
      into v_linhas
      from dias d
      left join vendas v on v.dia = d.dia
      left join recebidos r on r.dia = d.dia;

    v_totais := jsonb_build_object(
      'pedidos', (select coalesce(sum((l ->> 'pedidos')::integer), 0)
                    from jsonb_array_elements(coalesce(v_linhas,'[]'::jsonb)) l),
      'vendas_registradas', (select coalesce(sum((l ->> 'vendas_registradas')::numeric), 0)::numeric(12,2)
                    from jsonb_array_elements(coalesce(v_linhas,'[]'::jsonb)) l),
      'faturamento_recebido', (select coalesce(sum((l ->> 'faturamento_recebido')::numeric), 0)::numeric(12,2)
                    from jsonb_array_elements(coalesce(v_linhas,'[]'::jsonb)) l));

  -- ======================================================= vendas por produto
  elsif p_tipo = 'vendas_por_produto' then
    v_titulo := 'Vendas por produto';
    v_colunas := jsonb_build_array(
      jsonb_build_object('chave','produto','rotulo','Produto','tipo','texto'),
      jsonb_build_object('chave','categoria','rotulo','Categoria','tipo','texto'),
      jsonb_build_object('chave','quantidade','rotulo','Quantidade','tipo','numero'),
      jsonb_build_object('chave','pedidos','rotulo','Pedidos','tipo','numero'),
      jsonb_build_object('chave','valor','rotulo','Valor','tipo','dinheiro'));
    v_ressalvas := jsonb_build_array(
      'Pizza meio a meio conta como meia unidade para cada sabor, e o valor é rateado na mesma proporção.',
      'Combo é contado como combo, não como a soma dos componentes.');

    select jsonb_agg(jsonb_build_object(
             'produto', t.nome, 'categoria', t.categoria,
             'quantidade', t.quantidade, 'pedidos', t.pedidos, 'valor', t.valor)
           order by t.valor desc, t.nome)
      into v_linhas
      from (select * from public.vendas_por_produto(v_periodo)
             order by valor desc limit v_limite) t;

  -- ===================================================== vendas por categoria
  elsif p_tipo = 'vendas_por_categoria' then
    v_titulo := 'Vendas por categoria';
    v_colunas := jsonb_build_array(
      jsonb_build_object('chave','categoria','rotulo','Categoria','tipo','texto'),
      jsonb_build_object('chave','produtos','rotulo','Produtos','tipo','numero'),
      jsonb_build_object('chave','quantidade','rotulo','Quantidade','tipo','numero'),
      jsonb_build_object('chave','valor','rotulo','Valor','tipo','dinheiro'));
    v_linhas := public.vendas_por_categoria(v_periodo);

  -- ================================================================= pedidos
  elsif p_tipo = 'pedidos' then
    v_titulo := 'Pedidos concluídos';
    v_colunas := jsonb_build_array(
      jsonb_build_object('chave','numero','rotulo','Pedido','tipo','texto'),
      jsonb_build_object('chave','concluido_em','rotulo','Concluído em','tipo','datahora'),
      jsonb_build_object('chave','cliente','rotulo','Cliente','tipo','texto'),
      jsonb_build_object('chave','modalidade','rotulo','Modalidade','tipo','texto'),
      jsonb_build_object('chave','origem','rotulo','Origem','tipo','texto'),
      jsonb_build_object('chave','produtos','rotulo','Produtos','tipo','dinheiro'),
      jsonb_build_object('chave','taxa','rotulo','Taxa de entrega','tipo','dinheiro'),
      jsonb_build_object('chave','total','rotulo','Total','tipo','dinheiro'),
      jsonb_build_object('chave','recebido','rotulo','Recebido','tipo','dinheiro'));
    -- §28: o nome do cliente sai porque o relatório operacional precisa
    -- dele. WhatsApp e endereço NÃO saem: exportação não é pretexto para
    -- extrair a base de contatos.
    v_ressalvas := jsonb_build_array(
      'A coluna Recebido soma os pagamentos confirmados do pedido, que podem ter ocorrido em outro dia.');

    select jsonb_agg(jsonb_build_object(
             'numero', t.order_number,
             'concluido_em', t.completed_at,
             'cliente', t.customer_name_snapshot,
             'modalidade', t.fulfillment_type,
             'origem', t.source,
             'produtos', t.subtotal,
             'taxa', t.delivery_fee,
             'total', t.total,
             'recebido', t.recebido)
           order by t.completed_at)
      into v_linhas
      from (select o.order_number, o.completed_at, o.customer_name_snapshot,
                   o.fulfillment_type, o.source, o.subtotal, o.delivery_fee, o.total,
                   coalesce((select sum(p.amount) from public.payments p
                              where p.order_id = o.id and p.status = 'confirmed'), 0)::numeric(12,2)
                     as recebido
              from public.orders o
             where o.status = 'completed'
               and o.completed_at >= v_ini and o.completed_at < v_fim
             order by o.completed_at limit v_limite) t;

    v_totais := jsonb_build_object(
      'total', (select coalesce(sum((l ->> 'total')::numeric), 0)::numeric(12,2)
                  from jsonb_array_elements(coalesce(v_linhas,'[]'::jsonb)) l),
      'recebido', (select coalesce(sum((l ->> 'recebido')::numeric), 0)::numeric(12,2)
                  from jsonb_array_elements(coalesce(v_linhas,'[]'::jsonb)) l));

  -- ==================================================== formas de pagamento
  elsif p_tipo = 'formas_de_pagamento' then
    v_titulo := 'Faturamento recebido por forma de pagamento';
    v_colunas := jsonb_build_array(
      jsonb_build_object('chave','forma','rotulo','Forma','tipo','texto'),
      jsonb_build_object('chave','familia','rotulo','Família','tipo','texto'),
      jsonb_build_object('chave','pagamentos','rotulo','Pagamentos','tipo','numero'),
      jsonb_build_object('chave','valor','rotulo','Valor','tipo','dinheiro'));
    v_ressalvas := jsonb_build_array(
      'Aqui está o pagamento REALIZADO, não o método que o cliente escolheu no pedido (RN-PGTO-003).',
      'Estornos não entram nesta soma.');
    v_recebido := public.recebido_no_periodo(v_periodo);
    v_linhas := v_recebido -> 'por_forma';
    -- A chave do total tem de ser a de uma COLUNA: o rodapé usa o rótulo da
    -- coluna, e sem correspondência ele acabava imprimindo o nome do campo
    -- do JSON na tela e dentro do arquivo exportado.
    v_totais := jsonb_build_object('valor', v_recebido -> 'faturamento_recebido');
    -- RN-CAIXA-014 vira frase, não coluna: "fora da gaveta" não é uma forma
    -- de pagamento, e somá-lo na tabela seria contar o mesmo dinheiro duas
    -- vezes.
    if (v_recebido ->> 'ainda_fora_da_gaveta')::numeric > 0 then
      v_ressalvas := v_ressalvas || to_jsonb(format(
        'Deste total, R$ %s ainda não entrou em gaveta nenhuma: é dinheiro com o motoboy ou recebido sem caixa aberto.',
        replace(to_char((v_recebido ->> 'ainda_fora_da_gaveta')::numeric,
                        'FM999999990.00'), '.', ',')));
    end if;

  -- ================================================================ clientes
  elsif p_tipo = 'clientes' then
    v_titulo := 'Clientes';
    v_colunas := jsonb_build_array(
      jsonb_build_object('chave','cliente','rotulo','Cliente','tipo','texto'),
      jsonb_build_object('chave','pedidos','rotulo','Pedidos','tipo','numero'),
      jsonb_build_object('chave','faturamento','rotulo','Total comprado','tipo','dinheiro'),
      jsonb_build_object('chave','ticket_medio','rotulo','Ticket médio','tipo','dinheiro'),
      jsonb_build_object('chave','ultima_compra','rotulo','Última compra','tipo','data'),
      jsonb_build_object('chave','dias_sem_comprar','rotulo','Dias sem comprar','tipo','numero'),
      jsonb_build_object('chave','intervalo_tipico','rotulo','Intervalo típico (dias)','tipo','numero'),
      jsonb_build_object('chave','classificacao','rotulo','Cadência','tipo','texto'),
      jsonb_build_object('chave','aceita_promocao','rotulo','Aceita promoção','tipo','texto'));
    -- RN-CRM-004: a coluna "Cadência" repete a régua da tela, inclusive os
    -- casos em que ela NÃO classifica. Planilha não pode ser mais categórica
    -- que a interface.
    v_ressalvas := jsonb_build_array(
      'Cadência exige histórico: 1 compra fica como dados insuficientes e 2 compras como base fraca (RN-CRM-004).',
      'O intervalo típico é a mediana entre compras concluídas, não a média.');

    select jsonb_agg(jsonb_build_object(
             'cliente', t.nome,
             'pedidos', t.pedidos,
             'faturamento', t.faturamento,
             'ticket_medio', t.ticket_medio,
             'ultima_compra', public.dia_da_loja(t.ultima_compra),
             'dias_sem_comprar', t.dias_sem_comprar,
             'intervalo_tipico', t.intervalo_tipico,
             'classificacao', t.classificacao,
             'aceita_promocao', case when t.aceita then 'sim' else 'não' end)
           order by t.faturamento desc, t.nome)
      into v_linhas
      from (select c.name as nome, c.marketing_consent as aceita,
                   p.pedidos, p.faturamento, p.ticket_medio, p.ultima_compra,
                   p.dias_sem_comprar, p.intervalo_tipico,
                   public.classificar_cliente(p.pedidos, p.intervalo_tipico,
                                              p.dias_sem_comprar) as classificacao
              from public.padrao_de_compra() p
              join public.customers c on c.id = p.customer_id
             order by p.faturamento desc limit v_limite) t;

  -- ===================================================== movimentos internos
  elsif p_tipo = 'movimentos_internos' then
    v_titulo := 'Cortesias, consumo interno e perdas';
    v_colunas := jsonb_build_array(
      jsonb_build_object('chave','ocorrido_em','rotulo','Data','tipo','datahora'),
      jsonb_build_object('chave','tipo','rotulo','Tipo','tipo','texto'),
      jsonb_build_object('chave','responsavel','rotulo','Responsável','tipo','texto'),
      jsonb_build_object('chave','motivo','rotulo','Motivo','tipo','texto'),
      jsonb_build_object('chave','itens','rotulo','Itens','tipo','numero'),
      jsonb_build_object('chave','valor_referencia','rotulo','Valor de referência','tipo','dinheiro'));
    -- RN-CLASS-001, dito no próprio relatório para que ninguém some esta
    -- coluna ao faturamento depois de exportar.
    v_ressalvas := jsonb_build_array(
      'Nada aqui é receita. O valor é de REFERÊNCIA, serve para dimensionar o movimento e não é cobrado de ninguém.');

    select jsonb_agg(jsonb_build_object(
             'ocorrido_em', t.occurred_at,
             'tipo', t.movement_type,
             'responsavel', t.responsavel,
             'motivo', t.reason,
             'itens', t.itens,
             'valor_referencia', t.valor)
           order by t.occurred_at desc)
      into v_linhas
      from (select m.occurred_at, m.movement_type, m.reason,
                   e.full_name as responsavel,
                   count(i.id)::integer as itens,
                   coalesce(sum(i.quantity * i.reference_unit_price), 0)::numeric(12,2) as valor
              from public.internal_product_movements m
              left join public.employees e on e.id = m.employee_id
              left join public.internal_product_movement_items i on i.movement_id = m.id
             where m.status = 'confirmed'
               and m.occurred_at >= v_ini and m.occurred_at < v_fim
             group by m.id, m.occurred_at, m.movement_type, m.reason, e.full_name
             order by m.occurred_at desc limit v_limite) t;

  -- =================================================================== caixa
  elsif p_tipo = 'caixa' then
    v_titulo := 'Sessões de caixa';
    v_colunas := jsonb_build_array(
      jsonb_build_object('chave','data_operacional','rotulo','Data operacional','tipo','data'),
      jsonb_build_object('chave','aberta_em','rotulo','Abertura','tipo','datahora'),
      jsonb_build_object('chave','fechada_em','rotulo','Fechamento','tipo','datahora'),
      jsonb_build_object('chave','fundo','rotulo','Fundo inicial','tipo','dinheiro'),
      jsonb_build_object('chave','esperado','rotulo','Esperado em dinheiro','tipo','dinheiro'),
      jsonb_build_object('chave','contado','rotulo','Contado','tipo','dinheiro'),
      jsonb_build_object('chave','diferenca','rotulo','Diferença','tipo','dinheiro'),
      jsonb_build_object('chave','justificativa','rotulo','Justificativa','tipo','texto'),
      jsonb_build_object('chave','situacao','rotulo','Situação','tipo','texto'));
    -- RN-CAIXA-014: o que estava com o motoboy é faturamento e não é gaveta.
    v_ressalvas := jsonb_build_array(
      'A sessão é operacional e pode atravessar a meia-noite: ela é datada pela data operacional, não pelo relógio.',
      'Dinheiro ainda com o motoboy não entra no esperado em gaveta.');

    select jsonb_agg(jsonb_build_object(
             'data_operacional', s.operational_date,
             'aberta_em', s.opened_at,
             'fechada_em', s.closed_at,
             'fundo', s.opening_amount,
             'esperado', s.expected_cash_amount,
             'contado', s.counted_cash_amount,
             'diferenca', s.difference_amount,
             'justificativa', s.difference_reason,
             'situacao', s.status)
           order by s.operational_date desc, s.opened_at desc)
      into v_linhas
      from (select * from public.cash_sessions s
             where s.operational_date >= (v_periodo ->> 'de')::date
               and s.operational_date <= (v_periodo ->> 'ate')::date
             order by s.operational_date desc limit v_limite) s;

  -- ================================================================ entregas
  elsif p_tipo = 'entregas' then
    v_titulo := 'Entregas por motoboy';
    v_colunas := jsonb_build_array(
      jsonb_build_object('chave','motoboy','rotulo','Motoboy','tipo','texto'),
      jsonb_build_object('chave','corridas','rotulo','Saídas','tipo','numero'),
      jsonb_build_object('chave','entregas','rotulo','Entregas','tipo','numero'),
      jsonb_build_object('chave','falhas','rotulo','Falhas','tipo','numero'),
      jsonb_build_object('chave','valor_entregue','rotulo','Valor entregue','tipo','dinheiro'),
      jsonb_build_object('chave','pendentes_de_acerto','rotulo','Saídas sem acerto','tipo','numero'));
    -- CLAUDE.md §15 e §26, ditos no relatório: isto mede OPERAÇÃO, não
    -- pagamento de ninguém, e diferença de acerto não vira desconto.
    v_ressalvas := jsonb_build_array(
      'Este relatório é operacional. Não contém salário, adiantamento nem qualquer valor devido ao motoboy.',
      'Diferença de acerto não gera desconto automático (RN-RUN-005).');

    select jsonb_agg(jsonb_build_object(
             'motoboy', t.motoboy,
             'corridas', t.corridas,
             'entregas', t.entregas,
             'falhas', t.falhas,
             'valor_entregue', t.valor,
             'pendentes_de_acerto', t.pendentes)
           order by t.entregas desc, t.motoboy)
      into v_linhas
      from (select e.full_name as motoboy,
                   count(distinct r.id)::integer as corridas,
                   count(*) filter (where ro.delivery_status = 'delivered')::integer as entregas,
                   count(*) filter (where ro.delivery_status = 'failed')::integer as falhas,
                   coalesce(sum(o.total) filter (where ro.delivery_status = 'delivered'), 0)::numeric(12,2) as valor,
                   count(distinct r.id) filter (where r.status <> 'settled')::integer as pendentes
              from public.driver_runs r
              join public.employees e on e.id = r.driver_employee_id
              left join public.driver_run_orders ro on ro.driver_run_id = r.id
              left join public.orders o on o.id = ro.order_id
             where r.departed_at >= v_ini and r.departed_at < v_fim
             group by e.full_name) t;

  -- ============================================================ remarketing
  elsif p_tipo = 'remarketing' then
    v_titulo := 'Contatos de remarketing';
    v_colunas := jsonb_build_array(
      jsonb_build_object('chave','em','rotulo','Preparado em','tipo','datahora'),
      jsonb_build_object('chave','cliente','rotulo','Cliente','tipo','texto'),
      jsonb_build_object('chave','segmento','rotulo','Segmento','tipo','texto'),
      jsonb_build_object('chave','template','rotulo','Template','tipo','texto'),
      jsonb_build_object('chave','resultado','rotulo','Resultado informado','tipo','texto'),
      jsonb_build_object('chave','comprou_depois','rotulo','Comprou depois','tipo','texto'),
      jsonb_build_object('chave','dias_ate_a_compra','rotulo','Dias até a compra','tipo','numero'));
    v_ressalvas := jsonb_build_array(
      'Compra posterior é fato temporal: houve compra depois do contato. O sistema não afirma que o contato a causou (RN-RMKT-005).',
      'Resultado em branco significa contato preparado sem desfecho informado — não significa "não respondeu".');

    select jsonb_agg(jsonb_build_object(
             'em', l ->> 'em',
             'cliente', l ->> 'cliente',
             'segmento', l ->> 'segmento',
             'template', l ->> 'template',
             'resultado', l ->> 'resultado',
             'comprou_depois', case when (l ->> 'comprou_depois')::boolean then 'sim' else 'não' end,
             'dias_ate_a_compra', l -> 'dias_ate_a_compra'))
      into v_linhas
      from jsonb_array_elements(
             public.relatorio_de_remarketing(p_chave, p_de, p_ate) -> 'contatos') l;
  end if;

  return jsonb_build_object(
    'ok', true,
    'tipo', p_tipo,
    'titulo', v_titulo,
    'periodo', v_periodo,
    'colunas', v_colunas,
    'linhas', coalesce(v_linhas, '[]'::jsonb),
    'totais', v_totais,
    'ressalvas', v_ressalvas,
    'linhas_retornadas', jsonb_array_length(coalesce(v_linhas, '[]'::jsonb)),
    -- Quando a lista bate no teto, a tela precisa DIZER isso, em vez de
    -- deixar a pessoa exportar um pedaço achando que é o todo.
    'limite', v_limite,
    'truncado', jsonb_array_length(coalesce(v_linhas, '[]'::jsonb)) >= v_limite,
    'exportacao', p_exportar);
end;
$$;

comment on function public.relatorio_tabular is
  'Porta única dos relatórios. Exportar exige `reports.export` ALÉM da permissão do domínio. Sem salário, sem lucro, sem margem.';

revoke all on function public.relatorio_tabular(text, text, date, date, jsonb, boolean) from public, anon;
grant execute on function public.relatorio_tabular(text, text, date, date, jsonb, boolean) to authenticated;
