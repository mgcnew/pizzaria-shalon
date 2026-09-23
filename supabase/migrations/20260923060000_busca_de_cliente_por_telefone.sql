-- 0098 — Correção: a busca de cliente por nome virava busca por telefone
-- 04-REGRAS-NEGOCIO.md RN-CRM-002 · CLAUDE.md §11, §36
--
-- O DEFEITO, encontrado pelo teste da Fase 9:
--
--   busca = 'Duas F9'  →  normalizar_whatsapp('Duas F9') = '9'
--                      →  whatsapp_numeros like '%9%'
--                      →  casa com praticamente TODA a base.
--
-- A busca por nome e a busca por telefone estavam em OR, e a de telefone
-- reduzia o texto a "só os dígitos". Um nome com um algarismo dentro — um
-- apelido, um "F9", um "Maria 2" — virava um fragmento de telefone de um
-- dígito, e a tela devolvia a base inteira ordenada por ausência, com cara
-- de resultado de busca. Pior que não achar: achar tudo e parecer certo.
--
-- A correção: o ramo de telefone só entra quando o texto TEM CARA DE
-- TELEFONE — pelo menos quatro dígitos. Abaixo disso, a busca é de nome, e
-- ponto.
--
-- Migration nova em vez de edição da 0091/0093/0096: aplicada é imutável
-- (supabase/README.md).

create or replace function public.clientes_analiticos(p_filtros jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_classificacao text := nullif(p_filtros ->> 'classificacao', '');
  v_ausencia integer := nullif(p_filtros ->> 'ausencia_minima', '')::integer;
  v_consentimento text := nullif(p_filtros ->> 'consentimento', '');
  v_min_pedidos integer := coalesce(nullif(p_filtros ->> 'pedidos_minimos', '')::integer, 0);
  v_busca text := nullif(btrim(coalesce(p_filtros ->> 'busca', '')), '');
  -- Os dígitos do que foi digitado. Quatro ou mais: é procura por telefone.
  -- Menos que isso: é um nome que por acaso tem número.
  v_digitos text;
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

  v_digitos := nullif(regexp_replace(coalesce(v_busca, ''), '[^0-9]', '', 'g'), '');
  if v_digitos is not null and length(v_digitos) < 4 then
    v_digitos := null;
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
            -- Telefone só quando há fragmento de telefone de verdade.
            or (v_digitos is not null
                and b.whatsapp_numeros like '%' || v_digitos || '%'))
  ),
  -- A ordem escolhida decide QUEM entra na página, não só como ela é
  -- exibida (correção da 0096).
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
               -- A explicação em uma frase, com os mesmos números da linha.
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
  'RN-CRM-002/004. Busca por telefone só com 4+ dígitos: nome com número não vira fragmento de telefone.';

revoke all on function public.clientes_analiticos(jsonb) from public, anon;
grant execute on function public.clientes_analiticos(jsonb) to authenticated;
