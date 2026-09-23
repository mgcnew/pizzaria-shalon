-- 0090 — Produtos: o que vende, o que não vende e por quê
-- 04-REGRAS-NEGOCIO.md RN-POP-001..004, RN-PIZZA-006, RN-COMBO-002,
--                      RN-REL-002/003 · 01-DOCUMENTO-MESTRE.md §79.24
-- CLAUDE.md §17, §28, §39
--
-- A REGRA DE CONTAGEM É A MESMA DE "MAIS PEDIDOS" (0051/0052), e isso é
-- deliberado: duas contagens diferentes para a mesma pergunta produziriam
-- dois rankings que se contradizem na mesma tela.
--
--   · pizza meio a meio → cada sabor recebe a FRAÇÃO dele (RN-PIZZA-006).
--     Meia calabresa + meia mussarela é 0,5 de cada, nunca 1 de cada;
--   · combo → conta como COMBO. Os componentes não viram venda pública
--     independente (RN-COMBO-002), senão o mesmo refrigerante apareceria
--     como vendido duas vezes;
--   · o resto → a linha inteira, no produto da linha.
--
-- A DIFERENÇA para `mais_pedidos` é o recorte: lá é a vitrine pública, com
-- janela fixa de 30 dias e só produto disponível. Aqui é gestão — período
-- escolhido, produto indisponível incluído e sinalizado, e o faturamento
-- junto da quantidade.
--
-- ===========================================================================
-- O QUE ESTE MÓDULO NÃO CONSEGUE DIZER, e diz que não consegue
-- ===========================================================================
-- "Produto ficou indisponível 20 dos 30 dias" é a informação que tornaria a
-- baixa venda interpretável — e ela NÃO EXISTE no banco: `products` e
-- `product_variants` guardam a disponibilidade de AGORA
-- (`is_temporarily_available`), sem histórico de quando mudou.
--
-- Em vez de estimar, cada linha carrega os fatos que existem — dias no
-- catálogo dentro do período, disponibilidade atual, quantidade e a
-- comparação com o período anterior — e um motivo explícito quando o produto
-- NÃO é candidato honesto a "vende pouco". Lacuna registrada em
-- `00-DECISOES.md` como A-22.

-- ===========================================================================
-- VENDAS POR PRODUTO
-- ===========================================================================
create or replace function public.vendas_por_produto(p_periodo jsonb)
returns table (
  produto_id uuid,
  nome text,
  categoria text,
  tipo text,
  quantidade numeric,
  pedidos integer,
  valor numeric
) language sql stable security definer set search_path = ''
as $$
  with vendidos as (
    -- Pizza: a fração de cada sabor, multiplicada pela quantidade da linha.
    select f.flavor_product_id as product_id,
           i.order_id,
           f.portion * i.quantity as qtd,
           -- O valor da linha rateado pela mesma fração, para que meio a
           -- meio não dobre o faturamento do item.
           i.line_total * f.portion as valor
      from public.order_items i
      join public.orders o on o.id = i.order_id
      join public.order_item_flavors f on f.order_item_id = i.id
     where o.status = 'completed'
       and o.completed_at >= (p_periodo ->> 'inicio')::timestamptz
       and o.completed_at <  (p_periodo ->> 'fim')::timestamptz

    union all

    -- Demais itens, combo incluído: a linha inteira, no produto da linha.
    select i.product_id, i.order_id, i.quantity::numeric, i.line_total
      from public.order_items i
      join public.orders o on o.id = i.order_id
     where o.status = 'completed'
       and o.completed_at >= (p_periodo ->> 'inicio')::timestamptz
       and o.completed_at <  (p_periodo ->> 'fim')::timestamptz
       and not exists (select 1 from public.order_item_flavors f
                        where f.order_item_id = i.id)
  )
  select p.id, p.name, c.name, p.product_type,
         round(sum(v.qtd), 2)::numeric,
         count(distinct v.order_id)::integer,
         round(sum(v.valor), 2)::numeric(12,2)
    from vendidos v
    join public.products p on p.id = v.product_id
    join public.categories c on c.id = p.category_id
   group by p.id, p.name, c.name, p.product_type
   order by sum(v.qtd) desc, p.name;
$$;

comment on function public.vendas_por_produto is
  'RN-PIZZA-006 e RN-COMBO-002: meio a meio por fração, combo como combo. Mesma régua de `mais_pedidos`.';

revoke all on function public.vendas_por_produto(jsonb) from public, anon, authenticated;

-- ===========================================================================
-- VENDAS POR CATEGORIA
-- ===========================================================================
create or replace function public.vendas_por_categoria(p_periodo jsonb)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'categoria', t.categoria, 'quantidade', t.quantidade,
           'valor', t.valor, 'produtos', t.produtos)
         order by t.valor desc, t.categoria), '[]'::jsonb)
    from (select v.categoria,
                 round(sum(v.quantidade), 2) as quantidade,
                 round(sum(v.valor), 2)::numeric(12,2) as valor,
                 count(*)::integer as produtos
            from public.vendas_por_produto(p_periodo) v
           group by v.categoria) t;
$$;

revoke all on function public.vendas_por_categoria(jsonb) from public, anon, authenticated;

-- ===========================================================================
-- RANKING COM CONTEXTO — o que vende muito, o que vende pouco
-- ===========================================================================
-- §8 da autorização: "vende pouco" NÃO é simplesmente "menor quantidade".
-- Produto que passou o período indisponível, ou que nasceu no meio dele, não
-- pode ser condenado como encalhado.
--
-- Por isso a elegibilidade é explícita e factual — sem número mágico
-- inventado:
--
--   · `novo_no_periodo`     — entrou no catálogo depois do início do período;
--   · `indisponivel_agora`  — hoje não é vendável (RN-DISP);
--   · `elegivel`            — esteve no catálogo o período inteiro E está
--                             disponível agora. Só esses entram no fundo do
--                             ranking como "vende pouco".
--
-- Quem não é elegível aparece com o MOTIVO, e não com um veredicto.
create or replace function public.ranking_de_produtos(
  p_chave text default '30d', p_de date default null, p_ate date default null,
  p_limite integer default 10)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_periodo jsonb;
  v_anterior jsonb;
  v_limite integer := greatest(least(coalesce(p_limite, 10), 50), 1);
  v_linhas jsonb;
begin
  if not public.has_permission('reports.view') then
    return jsonb_build_object('ok', false, 'sem_permissao', true,
      'erro', 'Você não tem permissão para ver indicadores.');
  end if;

  v_periodo := public.periodo_analitico(p_chave, p_de, p_ate);
  if not (v_periodo ->> 'ok')::boolean then
    return v_periodo;
  end if;

  v_anterior := v_periodo
    || jsonb_build_object('inicio', v_periodo -> 'inicio_anterior',
                          'fim', v_periodo -> 'fim_anterior');

  -- Uma passada só: produtos do catálogo à esquerda, vendas do período e do
  -- período anterior à direita. Produto sem venda continua na lista com
  -- zero — é exatamente ele que interessa em "vende pouco" (CLAUDE.md §39).
  with atual as (select * from public.vendas_por_produto(v_periodo)),
  passado as (select * from public.vendas_por_produto(v_anterior)),
  base as (
    select
      p.id,
      p.name as nome,
      c.name as categoria,
      p.product_type as tipo,
      p.is_active as ativo,
      coalesce(public.produto_disponivel(p.id), false) as disponivel_agora,
      public.dia_da_loja(p.created_at) as entrou_em,
      -- Fato, não estimativa: o produto existia desde antes do período?
      (public.dia_da_loja(p.created_at) > (v_periodo ->> 'de')::date) as novo_no_periodo,
      coalesce(a.quantidade, 0) as quantidade,
      coalesce(a.pedidos, 0) as pedidos,
      coalesce(a.valor, 0)::numeric(12,2) as valor,
      coalesce(x.quantidade, 0) as quantidade_anterior
    from public.products p
    join public.categories c on c.id = p.category_id
    left join atual a on a.produto_id = p.id
    left join passado x on x.produto_id = p.id
    where p.is_active
  )
  select jsonb_agg(jsonb_build_object(
           'produto_id', b.id,
           'nome', b.nome,
           'categoria', b.categoria,
           'tipo', b.tipo,
           'quantidade', b.quantidade,
           'pedidos', b.pedidos,
           'valor', b.valor,
           'quantidade_anterior', b.quantidade_anterior,
           'entrou_em', b.entrou_em,
           'novo_no_periodo', b.novo_no_periodo,
           'disponivel_agora', b.disponivel_agora,
           -- Só entra no fundo do ranking quem teve chance de vender o
           -- período inteiro e continua vendável hoje.
           'elegivel_para_baixa_venda', (not b.novo_no_periodo) and b.disponivel_agora,
           'motivo_da_inelegibilidade', case
             when b.novo_no_periodo then 'entrou no catálogo durante o período'
             when not b.disponivel_agora then 'indisponível no momento'
           end,
           -- §9: tendência determinística. Sem base anterior, não há
           -- percentual — e a resposta diz isso em vez de inventar.
           'tendencia', public.variacao_percentual(b.quantidade_anterior, b.quantidade))
         order by b.quantidade desc, b.nome)
    into v_linhas
    from base b;

  return jsonb_build_object(
    'ok', true,
    'periodo', v_periodo,
    'limite', v_limite,
    'produtos', coalesce(v_linhas, '[]'::jsonb),
    'por_categoria', public.vendas_por_categoria(v_periodo),
    -- A ressalva que impede leitura errada: não há histórico de
    -- disponibilidade, então "ficou indisponível metade do período" é uma
    -- pergunta que o banco ainda não sabe responder (A-22).
    'ressalva_de_disponibilidade',
      'A disponibilidade é a de agora: o sistema não guarda histórico de quando um produto foi pausado.');
end;
$$;

comment on function public.ranking_de_produtos is
  'Mais e menos vendidos com contexto. "Vende pouco" exige ter estado no catálogo o período inteiro e estar disponível (§8).';

revoke all on function public.ranking_de_produtos(text, date, date, integer) from public, anon;
grant execute on function public.ranking_de_produtos(text, date, date, integer) to authenticated;

-- ===========================================================================
-- MOVIMENTO POR DIA E POR FAIXA DE HORÁRIO
-- ===========================================================================
-- RN-REL-003: "dias de maior/menor movimento" é movimento COMERCIAL. Nada
-- aqui fala de clima, e o nome não sugere isso.
--
-- Dois recortes que respondem perguntas diferentes:
--   · `por_dia`          — a série do período, no fuso da loja;
--   · `por_dia_da_semana`— o padrão: terça costuma ser fraca?
--   · `por_faixa`        — a hora do movimento, para escala de equipe.
--
-- Amostra pequena não vira veredicto: `dias_com_amostra` acompanha cada
-- linha do padrão semanal, e a interface mostra isso junto do número.
create or replace function public.movimento_no_periodo(
  p_chave text default '30d', p_de date default null, p_ate date default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_periodo jsonb;
  v_tz text := public.fuso_da_loja();
begin
  if not public.has_permission('reports.view') then
    return jsonb_build_object('ok', false, 'sem_permissao', true,
      'erro', 'Você não tem permissão para ver indicadores.');
  end if;

  v_periodo := public.periodo_analitico(p_chave, p_de, p_ate);
  if not (v_periodo ->> 'ok')::boolean then
    return v_periodo;
  end if;

  return jsonb_build_object(
    'ok', true,
    'periodo', v_periodo,

    -- Série diária COMPLETA: dia sem venda aparece com zero, senão o gráfico
    -- mentiria por omissão, pulando o dia fraco.
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dia', d.dia,
               'pedidos', coalesce(v.pedidos, 0),
               'valor', coalesce(v.valor, 0)::numeric(12,2))
             order by d.dia)
        from generate_series((v_periodo ->> 'de')::date,
                             (v_periodo ->> 'ate')::date, interval '1 day') as d(dia)
        left join (
          select (o.completed_at at time zone v_tz)::date as dia,
                 count(*)::integer as pedidos,
                 sum(o.total) as valor
            from public.orders o
           where o.status = 'completed'
             and o.completed_at >= (v_periodo ->> 'inicio')::timestamptz
             and o.completed_at <  (v_periodo ->> 'fim')::timestamptz
           group by 1) v on v.dia = d.dia::date), '[]'::jsonb),

    'por_dia_da_semana', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dia_semana', t.dow,
               'pedidos', t.pedidos,
               'valor', t.valor,
               -- Quantos dias daquele dia da semana o período cobriu. Sem
               -- isso, "domingo vende mais" pode ser um domingo só.
               'dias_com_amostra', t.dias,
               'media_de_pedidos', case when t.dias > 0
                                        then round(t.pedidos::numeric / t.dias, 1) end)
             order by t.dow)
        from (
          select extract(dow from d.dia)::integer as dow,
                 count(distinct d.dia)::integer as dias,
                 coalesce(sum(v.pedidos), 0)::integer as pedidos,
                 coalesce(sum(v.valor), 0)::numeric(12,2) as valor
            from generate_series((v_periodo ->> 'de')::date,
                                 (v_periodo ->> 'ate')::date, interval '1 day') as d(dia)
            left join (
              select (o.completed_at at time zone v_tz)::date as dia,
                     count(*)::integer as pedidos,
                     sum(o.total) as valor
                from public.orders o
               where o.status = 'completed'
                 and o.completed_at >= (v_periodo ->> 'inicio')::timestamptz
                 and o.completed_at <  (v_periodo ->> 'fim')::timestamptz
               group by 1) v on v.dia = d.dia::date
           group by 1) t), '[]'::jsonb),

    'por_faixa_de_horario', coalesce((
      select jsonb_agg(jsonb_build_object(
               'hora', t.hora, 'pedidos', t.pedidos, 'valor', t.valor)
             order by t.hora)
        from (select extract(hour from (o.completed_at at time zone v_tz))::integer as hora,
                     count(*)::integer as pedidos,
                     coalesce(sum(o.total), 0)::numeric(12,2) as valor
                from public.orders o
               where o.status = 'completed'
                 and o.completed_at >= (v_periodo ->> 'inicio')::timestamptz
                 and o.completed_at <  (v_periodo ->> 'fim')::timestamptz
               group by 1) t), '[]'::jsonb));
end;
$$;

comment on function public.movimento_no_periodo is
  'RN-REL-003: movimento COMERCIAL por dia, por dia da semana e por hora, no fuso da loja. Dia sem venda aparece com zero.';

revoke all on function public.movimento_no_periodo(text, date, date) from public, anon;
grant execute on function public.movimento_no_periodo(text, date, date) to authenticated;
