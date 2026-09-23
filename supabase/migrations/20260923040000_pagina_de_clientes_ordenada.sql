-- 0096 — Duas correções na leitura de clientes
-- 04-REGRAS-NEGOCIO.md RN-CRM-002/004, RN-RMKT-005 · CLAUDE.md §11
--
-- Migration nova em vez de edição da 0093: aquele arquivo já foi aplicado, e
-- arquivo aplicado é imutável (supabase/README.md). Correção de migration
-- aplicada se faz assim, à vista.
--
-- ===========================================================================
-- 1. A PÁGINA ERA CORTADA ANTES DE SER ORDENADA
-- ===========================================================================
-- Em `clientes_analiticos`, o `limit` caía sobre `filtrados`, que não tinha
-- ordem alguma; a ordenação escolhida pela pessoa era aplicada DEPOIS, só
-- dentro do `jsonb_agg`. O efeito: pedir "os 50 mais ausentes" devolvia 50
-- clientes quaisquer, ordenados por ausência entre si. O número no topo
-- ficava certo e a lista ficava errada — o pior tipo de erro.
--
-- Agora a ordem é aplicada ANTES do corte, e a mesma ordem se repete na
-- montagem do JSON.
--
-- ===========================================================================
-- 2. "COMPROU DEPOIS" NA FICHA VINHA DA COLUNA, NÃO DO FATO
-- ===========================================================================
-- `cliente_detalhe` lia `returned_after_contact`, que só é preenchida quando
-- alguém roda a sincronização. Quem abrisse a ficha antes disso veria "não
-- comprou depois" de um cliente que comprou. A ficha passa a calcular o
-- fato a partir de `orders`, como o relatório já faz — continuando temporal
-- e nunca causal (RN-RMKT-005).

create or replace function public.clientes_analiticos(p_filtros jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_classificacao text := nullif(p_filtros ->> 'classificacao', '');
  v_ausencia integer := nullif(p_filtros ->> 'ausencia_minima', '')::integer;
  v_consentimento text := nullif(p_filtros ->> 'consentimento', '');
  v_min_pedidos integer := coalesce(nullif(p_filtros ->> 'pedidos_minimos', '')::integer, 0);
  v_busca text := nullif(btrim(coalesce(p_filtros ->> 'busca', '')), '');
  v_limite integer := greatest(least(coalesce(nullif(p_filtros ->> 'limite', '')::integer, 50), 200), 1);
  v_ordem text := coalesce(nullif(p_filtros ->> 'ordem', ''), 'ausencia');
  v_linhas jsonb;
  v_total integer;
  v_resumo jsonb;
begin
  if not public.has_permission('customers.view') then
    return jsonb_build_object('ok', false, 'sem_permissao', true,
      'erro', 'Você não tem permissão para ver clientes.');
  end if;

  with base as (
    select
      c.id,
      c.name as nome,
      c.whatsapp_display as whatsapp,
      c.whatsapp_normalized as whatsapp_numeros,
      c.marketing_consent as aceita_promocao,
      c.is_blocked as bloqueado,
      coalesce(p.pedidos, 0) as pedidos,
      p.primeira_compra,
      p.ultima_compra,
      coalesce(p.faturamento, 0)::numeric(12,2) as faturamento,
      p.ticket_medio,
      p.intervalo_tipico,
      p.dias_sem_comprar,
      public.classificar_cliente(p.pedidos, p.intervalo_tipico, p.dias_sem_comprar) as classificacao
    from public.customers c
    left join public.padrao_de_compra() p on p.customer_id = c.id
  ),
  filtrados as (
    select * from base b
     where (v_classificacao is null or b.classificacao = v_classificacao)
       -- Ausência é fato sobre quem JÁ comprou. Quem nunca comprou não está
       -- ausente: está sem histórico, e tem classificação própria.
       and (v_ausencia is null
            or (b.dias_sem_comprar is not null and b.dias_sem_comprar >= v_ausencia))
       and (v_consentimento is null
            or (v_consentimento = 'sim' and b.aceita_promocao)
            or (v_consentimento = 'nao' and not b.aceita_promocao))
       and b.pedidos >= v_min_pedidos
       and (v_busca is null
            or public.sem_acento(b.nome) like '%' || public.sem_acento(v_busca) || '%'
            or b.whatsapp_numeros like '%' || public.normalizar_whatsapp(v_busca) || '%')
  ),
  -- A ordem escolhida decide QUEM entra na página, não só como ela é
  -- exibida. É esta linha que a correção acrescenta.
  pagina as (
    select * from filtrados f
     order by
       case when v_ordem = 'faturamento' then f.faturamento end desc nulls last,
       case when v_ordem = 'pedidos' then f.pedidos end desc nulls last,
       case when v_ordem = 'recente' then f.ultima_compra end desc nulls last,
       case when v_ordem = 'ausencia' then f.dias_sem_comprar end desc nulls last,
       f.nome
     limit v_limite
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'cliente_id', f.id,
               'nome', f.nome,
               'whatsapp', f.whatsapp,
               'aceita_promocao', f.aceita_promocao,
               'bloqueado', f.bloqueado,
               'pedidos', f.pedidos,
               'primeira_compra', f.primeira_compra,
               'ultima_compra', f.ultima_compra,
               'faturamento', f.faturamento,
               'ticket_medio', f.ticket_medio,
               -- Com duas compras isto é o intervalo OBSERVADO, não a cadência
               -- típica. O nome do campo continua o mesmo; a classificação é que
               -- diz como lê-lo.
               'intervalo_tipico', f.intervalo_tipico,
               'dias_sem_comprar', f.dias_sem_comprar,
               'classificacao', f.classificacao,
               'base_fraca', f.classificacao = 'base_fraca',
               -- A explicação em uma frase, com os mesmos números da régua.
               'porque', case f.classificacao
                 when 'dados_insuficientes' then
                   case when f.pedidos = 0 then 'Ainda não concluiu nenhum pedido.'
                        else 'Só uma compra: ainda não há intervalo para comparar.' end
                 when 'base_fraca' then
                   format('Duas compras, com %s dias entre elas, e %s dias desde a última. Ainda não dá para dizer qual é o hábito dele.',
                          f.intervalo_tipico, f.dias_sem_comprar)
                 else format('Compra a cada ~%s dias e está há %s dias sem comprar.',
                             f.intervalo_tipico, f.dias_sem_comprar)
               end)
             order by
               case when v_ordem = 'faturamento' then f.faturamento end desc nulls last,
               case when v_ordem = 'pedidos' then f.pedidos end desc nulls last,
               case when v_ordem = 'recente' then f.ultima_compra end desc nulls last,
               case when v_ordem = 'ausencia' then f.dias_sem_comprar end desc nulls last,
               f.nome)
        from pagina f), '[]'::jsonb),
    (select count(*)::integer from filtrados),
    jsonb_build_object(
      'recorrentes', (select count(*)::integer from base where classificacao = 'recorrente'),
      'atencao', (select count(*)::integer from base where classificacao = 'atencao'),
      'afastados', (select count(*)::integer from base where classificacao = 'afastado'),
      'base_fraca', (select count(*)::integer from base where classificacao = 'base_fraca'),
      'dados_insuficientes', (select count(*)::integer from base where classificacao = 'dados_insuficientes'),
      'sem_consentimento', (select count(*)::integer from base where not aceita_promocao))
    into v_linhas, v_total, v_resumo;

  return jsonb_build_object(
    'ok', true,
    'clientes', v_linhas,
    'total_filtrado', v_total,
    'limite', v_limite,
    'resumo', v_resumo);
end;
$$;

comment on function public.clientes_analiticos is
  'RN-CRM-002/004: classificação a partir de 3 compras. A ordem escolhida decide quem entra na página, não apenas a exibição.';

revoke all on function public.clientes_analiticos(jsonb) from public, anon;
grant execute on function public.clientes_analiticos(jsonb) to authenticated;

-- --------------------------------------------------------------------------
create or replace function public.cliente_detalhe(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cliente record;
  v_padrao record;
  v_classificacao text;
begin
  if not public.has_permission('customers.view') then
    return jsonb_build_object('ok', false, 'sem_permissao', true,
      'erro', 'Você não tem permissão para ver clientes.');
  end if;

  select * into v_cliente from public.customers c where c.id = p_cliente;
  if v_cliente.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Cliente não encontrado.');
  end if;

  select * into v_padrao from public.padrao_de_compra() p where p.customer_id = p_cliente;

  v_classificacao := public.classificar_cliente(
    v_padrao.pedidos, v_padrao.intervalo_tipico, v_padrao.dias_sem_comprar);

  return jsonb_build_object(
    'ok', true,
    'cliente_id', v_cliente.id,
    'nome', v_cliente.name,
    'whatsapp', v_cliente.whatsapp_display,
    'aceita_promocao', v_cliente.marketing_consent,
    'consentimento_em', v_cliente.marketing_consent_updated_at,
    'bloqueado', v_cliente.is_blocked,
    'motivo_do_bloqueio', v_cliente.blocked_reason_internal,
    'bloqueado_em', v_cliente.blocked_at,
    'cadastrado_em', v_cliente.created_at,

    'padrao', jsonb_build_object(
      'pedidos', coalesce(v_padrao.pedidos, 0),
      'primeira_compra', v_padrao.primeira_compra,
      'ultima_compra', v_padrao.ultima_compra,
      'faturamento', coalesce(v_padrao.faturamento, 0)::numeric(12,2),
      'ticket_medio', v_padrao.ticket_medio,
      'intervalo_tipico', v_padrao.intervalo_tipico,
      'dias_sem_comprar', v_padrao.dias_sem_comprar,
      'classificacao', v_classificacao,
      'base_fraca', v_classificacao = 'base_fraca'),

    'enderecos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'rotulo', a.label, 'logradouro', a.street,
               'numero', a.number, 'complemento', a.complement,
               'bairro', a.neighborhood, 'cidade', a.city, 'uf', a.state,
               'referencia', a.reference_point, 'preferido', a.is_preferred)
             order by a.is_preferred desc, a.created_at desc)
        from public.customer_addresses a
       where a.customer_id = p_cliente and a.is_active), '[]'::jsonb),

    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pedido_id', o.id, 'numero', o.order_number, 'status', o.status,
               'modalidade', o.fulfillment_type, 'origem', o.source,
               'total', o.total, 'criado_em', o.created_at,
               'concluido_em', o.completed_at,
               'itens', (select string_agg(i.product_name_snapshot, ', '
                                           order by i.line_number)
                           from public.order_items i where i.order_id = o.id))
             order by o.created_at desc)
        from (select * from public.orders o2
               where o2.customer_id = p_cliente
               order by o2.created_at desc limit 20) o), '[]'::jsonb),

    'consentimento_historico', coalesce((
      select jsonb_agg(jsonb_build_object(
               'em', h.created_at, 'aceita', h.consent,
               'origem', h.source, 'ator', h.actor_type, 'observacao', h.notes)
             order by h.created_at desc)
        from public.marketing_consent_history h
       where h.customer_id = p_cliente), '[]'::jsonb),

    'contatos_de_remarketing', case
      when public.has_permission('remarketing.view') then coalesce((
        select jsonb_agg(jsonb_build_object(
                 'contato_id', r.id, 'em', r.contacted_at, 'canal', r.channel,
                 'segmento', r.segment, 'resultado', r.result,
                 -- Calculado agora, a partir dos pedidos: fato temporal que
                 -- não depende de ninguém ter rodado sincronização.
                 'comprou_depois', exists (
                   select 1 from public.orders o
                    where o.customer_id = r.customer_id
                      and o.status = 'completed'
                      and o.completed_at > r.contacted_at))
               order by r.contacted_at desc)
          from public.remarketing_contacts r
         where r.customer_id = p_cliente), '[]'::jsonb)
    end);
end;
$$;

comment on function public.cliente_detalhe is
  'Ficha do cliente. "Comprou depois" é fato temporal calculado na leitura, nunca afirmação de causa (RN-RMKT-005).';

revoke all on function public.cliente_detalhe(uuid) from public, anon;
grant execute on function public.cliente_detalhe(uuid) to authenticated;
