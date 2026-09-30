-- 0137 — fogazza por sabor, entrega 3: relatórios e "Mais pedidos"
-- 04 RN-FOG-008, RN-POP-001 · D-2026-09-30-101
--
-- ATÉ AQUI, a fogazza vendida somava no sabor: uma fogazza de Calabresa
-- entrava nos relatórios e no "Mais pedidos" como se fosse a pizza
-- Calabresa, porque o item é o sabor de pizza vendido num tamanho de
-- fogazza (RN-FOG-002). O tamanho é o que separa uma coisa da outra.
--
-- DECISÃO DA SHALON (D-2026-09-30-101):
--
--   relatórios do painel  uma linha por sabor: "Calabresa · Fogazza",
--                         separada da pizza "Calabresa", na categoria do
--                         card de entrada (ex.: Fogazza). Vendas por
--                         categoria passam a separar fogazza de pizza;
--
--   "Mais pedidos"        as fogazzas vendidas somam no CARD ("Fogazza
--                         salgada"), que é o que o cliente consegue abrir no
--                         cardápio. A pizza do sabor conta só pizza.
--
-- O QUE MUDA:
--
--   vendas_por_produto    ganha a coluna `tamanho_id`: nula nas linhas de
--                         sempre, o tamanho de fogazza na linha de fogazza.
--                         Troca de assinatura: `drop` + recriação, e as
--                         concessões voltam exatamente como estavam (só
--                         `service_role`; as demais funções a chamam como
--                         DEFINER). Quem a consome (`vendas_por_categoria`,
--                         `relatorio_tabular`, `ranking_de_produtos`) lê por
--                         nome de coluna e continua funcionando.
--
--   ranking_de_produtos   a linha de fogazza vira item próprio, com `chave`
--                         única (`<produto>:<tamanho>`), disponibilidade da
--                         fogazza e "entrou no catálogo" pela data do preço de
--                         fogazza. O card de entrada sai do ranking: ele não é
--                         vendido, e ficaria para sempre no fundo da lista.
--                         "Disponível agora" da pizza passa a ser o do
--                         cardápio (RN-FOG-006).
--
--   mais_pedidos          fogazza soma no card do tamanho e da categoria do
--                         sabor; a vitrine filtra pela disponibilidade do
--                         cardápio, a mesma que o cliente vê.
--
-- O "tamanho de fogazza" é lido do cadastro atual (`pizza_sizes.sold_as`), e
-- o card também: o pedido não guarda a qual card pertencia. Um tamanho de
-- fogazza não deixa de ser fogazza enquanto um card o usa (0134).

-- ------------------------------------------------------- vendas por produto
drop function public.vendas_por_produto(jsonb);

create function public.vendas_por_produto(p_periodo jsonb)
returns table (
  produto_id uuid, nome text, categoria text, tipo text,
  quantidade numeric, pedidos integer, valor numeric,
  tamanho_id uuid
)
language sql stable security definer set search_path = ''
as $$
  with vendidos as (
    -- Pizza: a fração de cada sabor, multiplicada pela quantidade da linha.
    -- A fogazza entra por aqui também (é um sabor num tamanho), marcada pelo
    -- tamanho para virar linha própria.
    select f.flavor_product_id as product_id,
           i.order_id,
           f.portion * i.quantity as qtd,
           -- O valor da linha rateado pela mesma fração, para que meio a
           -- meio não dobre o faturamento do item.
           i.line_total * f.portion as valor,
           case when s.sold_as = 'fogazza' then i.size_id end as fogazza_id
      from public.order_items i
      join public.orders o on o.id = i.order_id
      join public.order_item_flavors f on f.order_item_id = i.id
      left join public.pizza_sizes s on s.id = i.size_id
     where o.status = 'completed'
       and o.completed_at >= (p_periodo ->> 'inicio')::timestamptz
       and o.completed_at <  (p_periodo ->> 'fim')::timestamptz

    union all

    -- Demais itens, combo incluído: a linha inteira, no produto da linha.
    select i.product_id, i.order_id, i.quantity::numeric, i.line_total, null::uuid
      from public.order_items i
      join public.orders o on o.id = i.order_id
     where o.status = 'completed'
       and o.completed_at >= (p_periodo ->> 'inicio')::timestamptz
       and o.completed_at <  (p_periodo ->> 'fim')::timestamptz
       and not exists (select 1 from public.order_item_flavors f
                        where f.order_item_id = i.id)
  )
  select p.id,
         case when v.fogazza_id is null then p.name else p.name || ' · ' || s.name end,
         case when v.fogazza_id is null then c.name else coalesce(cf.nome, s.name) end,
         case when v.fogazza_id is null then p.product_type else 'fogazza' end,
         round(sum(v.qtd), 2)::numeric,
         count(distinct v.order_id)::integer,
         round(sum(v.valor), 2)::numeric(12,2),
         v.fogazza_id
    from vendidos v
    join public.products p on p.id = v.product_id
    join public.categories c on c.id = p.category_id
    left join public.pizza_sizes s on s.id = v.fogazza_id
    -- A categoria da linha de fogazza é a do card que a vende.
    left join lateral (
      select cc.name as nome
        from public.products card
        join public.categories cc on cc.id = card.category_id
       where v.fogazza_id is not null
         and card.flavor_size_id = v.fogazza_id
         and card.flavor_category_id = p.category_id
       order by card.is_active desc, card.sort_order, card.name
       limit 1
    ) cf on true
   group by p.id, p.name, c.name, p.product_type, v.fogazza_id, s.name, cf.nome
   order by sum(v.qtd) desc, 2;
$$;

comment on function public.vendas_por_produto(jsonb) is
  'Vendas concluídas por produto no período. A fogazza de um sabor é linha própria, marcada por tamanho_id (RN-FOG-008).';

revoke all on function public.vendas_por_produto(jsonb) from public, anon, authenticated;
grant execute on function public.vendas_por_produto(jsonb) to service_role;

-- ---------------------------------------------------------------- ranking
create or replace function public.ranking_de_produtos(
  p_chave text default '30d'::text, p_de date default null::date,
  p_ate date default null::date, p_limite integer default 10)
returns jsonb
language plpgsql stable security definer set search_path = ''
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
      null::uuid as tamanho_id,
      p.id::text as chave,
      p.name as nome,
      c.name as categoria,
      p.product_type as tipo,
      p.is_active as ativo,
      -- A disponibilidade que o cardápio mostra: a pizza de um sabor com
      -- os tamanhos de pizza pausados não está "disponível agora" só porque
      -- a fogazza dela está (RN-FOG-006).
      coalesce(public.produto_disponivel_no_cardapio(p.id), false) as disponivel_agora,
      public.dia_da_loja(p.created_at) as entrou_em,
      -- Fato, não estimativa: o produto existia desde antes do período?
      (public.dia_da_loja(p.created_at) > (v_periodo ->> 'de')::date) as novo_no_periodo,
      coalesce(a.quantidade, 0) as quantidade,
      coalesce(a.pedidos, 0) as pedidos,
      coalesce(a.valor, 0)::numeric(12,2) as valor,
      coalesce(x.quantidade, 0) as quantidade_anterior
    from public.products p
    join public.categories c on c.id = p.category_id
    left join atual a on a.produto_id = p.id and a.tamanho_id is null
    left join passado x on x.produto_id = p.id and x.tamanho_id is null
    where p.is_active
      -- O card de entrada de fogazza não é vendido: quem vende são os sabores.
      and p.flavor_category_id is null

    union all

    -- A fogazza de cada sabor, como item próprio (RN-FOG-008).
    select
      p.id,
      pv.size_id,
      p.id::text || ':' || pv.size_id::text,
      p.name || ' · ' || s.name,
      coalesce((select cc.name
                  from public.products card
                  join public.categories cc on cc.id = card.category_id
                 where card.flavor_size_id = pv.size_id
                   and card.flavor_category_id = p.category_id
                 order by card.is_active desc, card.sort_order, card.name
                 limit 1), s.name),
      'fogazza',
      p.is_active,
      coalesce(public.variante_disponivel(pv.id), false),
      -- A fogazza "entrou no catálogo" quando o sabor ganhou o preço dela.
      public.dia_da_loja(pv.created_at),
      (public.dia_da_loja(pv.created_at) > (v_periodo ->> 'de')::date),
      coalesce(a.quantidade, 0),
      coalesce(a.pedidos, 0),
      coalesce(a.valor, 0)::numeric(12,2),
      coalesce(x.quantidade, 0)
    from public.product_variants pv
    join public.pizza_sizes s on s.id = pv.size_id and s.sold_as = 'fogazza'
    join public.products p on p.id = pv.product_id
    left join atual a on a.produto_id = p.id and a.tamanho_id = pv.size_id
    left join passado x on x.produto_id = p.id and x.tamanho_id = pv.size_id
    where p.is_active and pv.is_active
  )
  select jsonb_agg(jsonb_build_object(
           'produto_id', b.id,
           'chave', b.chave,
           'tamanho_id', b.tamanho_id,
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

-- ------------------------------------------------------------ mais pedidos
create or replace function public.mais_pedidos(p_limite integer default 6)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'produto_id', r.produto_id, 'quantidade', r.quantidade)
         order by r.quantidade desc, r.nome), '[]'::jsonb)
  from (
    select p.id as produto_id, p.name as nome, sum(x.qtd) as quantidade
    from (
      -- Sabores. A fogazza soma no CARD que a vende, e não na pizza do
      -- sabor (D-2026-09-30-101): é o card que o cliente abre no cardápio.
      select case when s.sold_as = 'fogazza' then card.id
                  else f.flavor_product_id end as product_id,
             f.portion * i.quantity as qtd
      from public.order_items i
      join public.orders o on o.id = i.order_id
      join public.order_item_flavors f on f.order_item_id = i.id
      left join public.pizza_sizes s on s.id = i.size_id
      left join public.products fp on fp.id = f.flavor_product_id
      left join lateral (
        select c.id
          from public.products c
         where s.sold_as = 'fogazza'
           and c.flavor_size_id = i.size_id
           and c.flavor_category_id = fp.category_id
         order by c.is_active desc, c.sort_order, c.name
         limit 1
      ) card on true
      where o.status = 'completed'
        and o.completed_at >= now() - interval '30 days'

      union all

      select i.product_id, i.quantity::numeric
      from public.order_items i
      join public.orders o on o.id = i.order_id
      where o.status = 'completed'
        and o.completed_at >= now() - interval '30 days'
        and not exists (select 1 from public.order_item_flavors f
                         where f.order_item_id = i.id)
    ) x
    join public.products p on p.id = x.product_id
    -- A disponibilidade que o cliente vê no cardápio.
    where coalesce(public.produto_disponivel_no_cardapio(p.id), false)
    group by p.id, p.name
    having sum(x.qtd) > 0
    order by sum(x.qtd) desc, p.name
    limit greatest(coalesce(p_limite, 6), 0)
  ) r;
$$;
