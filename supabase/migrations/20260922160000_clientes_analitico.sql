-- 0091 — Clientes: cadência individual, ausência e classificação explicável
-- 04-REGRAS-NEGOCIO.md RN-CRM-001/002/003, RN-CLI-003/005/008, RN-RMKT-006
-- 01-DOCUMENTO-MESTRE.md §79.21 e §79.22 · 03 §12 · CLAUDE.md §29, §39
--
-- A PERGUNTA QUE ESTE MÓDULO RESPONDE: quem está sumindo do PRÓPRIO padrão?
--
-- Não é "quem está há 30 dias sem comprar". RN-CRM-001 pede comportamento
-- INDIVIDUAL: quem compra toda semana e sumiu há 25 dias merece atenção;
-- quem compra uma vez por mês, no dia 25, está em casa.
--
-- ===========================================================================
-- COMO A CADÊNCIA É CALCULADA — e por que assim
-- ===========================================================================
--
-- `intervalo_tipico` é a MEDIANA dos intervalos entre compras concluídas
-- consecutivas, não a média. Um cliente semanal que passou um mês viajando
-- tem uma média puxada pela viagem; a mediana continua dizendo "semanal",
-- que é o padrão dele.
--
-- RN-CRM-003 — cliente com pouco histórico NÃO recebe inferência:
--   · 1 pedido            → `dados_insuficientes`. Não existe intervalo, e
--                           inventar um seria fabricar precisão;
--   · 2 pedidos           → existe UM intervalo. Ele é usado, e a linha sai
--                           com `base_fraca`, para a tela dizer isso;
--   · 3 ou mais pedidos   → mediana de dois ou mais intervalos.
--
-- A CLASSIFICAÇÃO é a razão entre "dias sem comprar" e o intervalo típico
-- DELE. Os cortes são explícitos, e a tela mostra a conta:
--
--   razão ≤ 1   → dentro do padrão   (ainda não passou do intervalo dele)
--   1 < razão ≤ 2 → atenção          (passou do intervalo, dentro do dobro)
--   razão > 2   → afastado           (mais que o dobro do próprio intervalo)
--
-- `recorrente` é quem tem 3 ou mais compras E está dentro do padrão — é o
-- cliente fiel em dia, e a tela o separa de quem tem só duas compras.
--
-- Nada aqui é score opaco: a resposta carrega `intervalo_tipico`,
-- `dias_sem_comprar` e a razão, para a interface poder explicar POR QUE a
-- pessoa foi sinalizada (§13 da autorização).
--
-- ===========================================================================
-- PRIVACIDADE
-- ===========================================================================
-- §28: a tela analítica não replica o cadastro. Estas funções devolvem nome
-- e o WhatsApp, porque é com ele que se fala com a pessoa — e mais nada:
-- endereço, coordenadas e histórico de pedidos ficam onde já estavam, atrás
-- das permissões deles. Quem chama precisa de `customers.view`.

-- ===========================================================================
-- O PADRÃO DE COMPRA DE CADA CLIENTE
-- ===========================================================================
-- Uma passada só sobre pedidos concluídos, agregando por cliente. O `lag()`
-- dá o intervalo entre compras consecutivas sem N+1 (CLAUDE.md §39).
create or replace function public.padrao_de_compra()
returns table (
  customer_id uuid,
  pedidos integer,
  primeira_compra timestamptz,
  ultima_compra timestamptz,
  faturamento numeric,
  ticket_medio numeric,
  intervalo_tipico numeric,
  dias_sem_comprar integer
) language sql stable security definer set search_path = ''
as $$
  with compras as (
    select o.customer_id, o.completed_at, o.total,
           o.completed_at
             - lag(o.completed_at) over (partition by o.customer_id order by o.completed_at)
             as desde_a_anterior
      from public.orders o
     where o.status = 'completed' and o.customer_id is not null
  )
  select
    c.customer_id,
    count(*)::integer,
    min(c.completed_at),
    max(c.completed_at),
    coalesce(sum(c.total), 0)::numeric(12,2),
    round(avg(c.total), 2)::numeric(12,2),
    -- Mediana dos intervalos, em dias. Robusta ao mês atípico.
    round(percentile_cont(0.5) within group (
      order by extract(epoch from c.desde_a_anterior) / 86400.0)::numeric, 1),
    (public.dia_da_loja(now()) - public.dia_da_loja(max(c.completed_at)))::integer
  from compras c
  group by c.customer_id;
$$;

comment on function public.padrao_de_compra is
  'RN-CRM-001: cadência individual. Intervalo típico é a MEDIANA entre compras concluídas, não a média.';

revoke all on function public.padrao_de_compra() from public, anon, authenticated;

-- ===========================================================================
-- CLASSIFICAÇÃO
-- ===========================================================================
-- Determinística e explicável: recebe os números e devolve o rótulo. Existe
-- como função própria para que a listagem, o remarketing e os testes usem
-- exatamente a mesma régua (CLAUDE.md §17).
create or replace function public.classificar_cliente(
  p_pedidos integer, p_intervalo numeric, p_dias_sem_comprar integer)
returns text language sql immutable set search_path = ''
as $$
  select case
    -- RN-CRM-003: uma compra não é padrão de compra.
    when coalesce(p_pedidos, 0) < 2 or p_intervalo is null or p_intervalo <= 0
      then 'dados_insuficientes'
    when p_dias_sem_comprar > p_intervalo * 2 then 'afastado'
    when p_dias_sem_comprar > p_intervalo     then 'atencao'
    when p_pedidos >= 3                       then 'recorrente'
    else 'dentro_do_padrao'
  end;
$$;

comment on function public.classificar_cliente is
  'Razão entre dias sem comprar e o intervalo típico DO CLIENTE. Cortes em 1x e 2x, explícitos na interface.';

revoke all on function public.classificar_cliente(integer, numeric, integer) from public, anon;
grant execute on function public.classificar_cliente(integer, numeric, integer) to authenticated;

-- ===========================================================================
-- LISTAGEM DE CLIENTES
-- ===========================================================================
-- A tela de CRM e a de remarketing consultam daqui. Os filtros são os de
-- RN-CRM-002 (15/30/60/90) MAIS a classificação individual — as duas coisas
-- convivem, porque o dono precisa poder procurar "quem sumiu há 60 dias"
-- mesmo que a régua individual não tenha sinalizado ninguém.
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
      public.classificar_cliente(p.pedidos, p.intervalo_tipico, p.dias_sem_comprar) as classificacao,
      -- Dois pedidos dão UM intervalo: usável, e honestamente frágil.
      (coalesce(p.pedidos, 0) = 2) as base_fraca
    from public.customers c
    left join public.padrao_de_compra() p on p.customer_id = c.id
  ),
  filtrados as (
    select * from base b
     where (v_classificacao is null or b.classificacao = v_classificacao)
       and (v_ausencia is null or coalesce(b.dias_sem_comprar, 99999) >= v_ausencia)
       and (v_consentimento is null
            or (v_consentimento = 'sim' and b.aceita_promocao)
            or (v_consentimento = 'nao' and not b.aceita_promocao))
       and b.pedidos >= v_min_pedidos
       and (v_busca is null
            or public.sem_acento(b.nome) like '%' || public.sem_acento(v_busca) || '%'
            or b.whatsapp_numeros like '%' || public.normalizar_whatsapp(v_busca) || '%')
  )
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
           'intervalo_tipico', f.intervalo_tipico,
           'dias_sem_comprar', f.dias_sem_comprar,
           'classificacao', f.classificacao,
           'base_fraca', f.base_fraca,
           -- A explicação em uma frase, montada com os mesmos números que a
           -- classificação usou. É isto que a tela mostra ao lado do rótulo.
           'porque', case f.classificacao
             when 'dados_insuficientes' then
               case when f.pedidos = 0 then 'Ainda não concluiu nenhum pedido.'
                    else 'Só uma compra: ainda não há intervalo para comparar.' end
             else format('Compra a cada ~%s dias e está há %s dias sem comprar.',
                         f.intervalo_tipico, f.dias_sem_comprar)
           end)
         order by
           case when v_ordem = 'faturamento' then f.faturamento end desc nulls last,
           case when v_ordem = 'pedidos' then f.pedidos end desc nulls last,
           case when v_ordem = 'recente' then f.ultima_compra end desc nulls last,
           case when v_ordem = 'ausencia' then f.dias_sem_comprar end desc nulls last,
           f.nome)
    into v_linhas
    from (select * from filtrados limit v_limite) f;

  return jsonb_build_object(
    'ok', true,
    'clientes', coalesce(v_linhas, '[]'::jsonb),
    'total_filtrado', (select count(*)::integer from filtrados),
    'limite', v_limite,
    'resumo', jsonb_build_object(
      'recorrentes', (select count(*)::integer from base where classificacao = 'recorrente'),
      'dentro_do_padrao', (select count(*)::integer from base where classificacao = 'dentro_do_padrao'),
      'atencao', (select count(*)::integer from base where classificacao = 'atencao'),
      'afastados', (select count(*)::integer from base where classificacao = 'afastado'),
      'dados_insuficientes', (select count(*)::integer from base where classificacao = 'dados_insuficientes'),
      'sem_consentimento', (select count(*)::integer from base where not aceita_promocao)));
end;
$$;

comment on function public.clientes_analiticos is
  'RN-CRM-001/002: classificação individual E filtros 15/30/60/90. Cada linha carrega o porquê.';

revoke all on function public.clientes_analiticos(jsonb) from public, anon;
grant execute on function public.clientes_analiticos(jsonb) to authenticated;

-- ===========================================================================
-- FICHA DE UM CLIENTE
-- ===========================================================================
-- 05-PLANO §13.1: histórico, pedidos, endereços, recorrência, consentimento.
-- Endereço aparece AQUI, na ficha de quem se está atendendo — e não na
-- listagem analítica, que não precisa dele (§28).
create or replace function public.cliente_detalhe(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cliente record;
  v_padrao record;
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

  return jsonb_build_object(
    'ok', true,
    'cliente_id', v_cliente.id,
    'nome', v_cliente.name,
    'whatsapp', v_cliente.whatsapp_display,
    'aceita_promocao', v_cliente.marketing_consent,
    'consentimento_em', v_cliente.marketing_consent_updated_at,
    'bloqueado', v_cliente.is_blocked,
    -- RN-CLI-008: o motivo do bloqueio é INTERNO e nunca vai ao cliente.
    -- Aqui ele aparece porque a tela é da Shalon.
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
      'classificacao', public.classificar_cliente(
        v_padrao.pedidos, v_padrao.intervalo_tipico, v_padrao.dias_sem_comprar),
      'base_fraca', coalesce(v_padrao.pedidos, 0) = 2),

    'enderecos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'rotulo', a.label, 'logradouro', a.street,
               'numero', a.number, 'complemento', a.complement,
               'bairro', a.neighborhood, 'cidade', a.city, 'uf', a.state,
               'referencia', a.reference_point, 'preferido', a.is_preferred)
             order by a.is_preferred desc, a.created_at desc)
        from public.customer_addresses a
       where a.customer_id = p_cliente and a.is_active), '[]'::jsonb),

    -- Últimos pedidos, com o que a operação precisa para reconhecer a
    -- conversa. Snapshot, nunca JOIN com o catálogo de hoje (RN-SNAP-001).
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
                 'comprou_depois', r.returned_after_contact)
               order by r.contacted_at desc)
          from public.remarketing_contacts r
         where r.customer_id = p_cliente), '[]'::jsonb)
    end);
end;
$$;

comment on function public.cliente_detalhe is
  'Ficha do cliente: padrão, endereços, pedidos e consentimento. Motivo de bloqueio é interno (RN-CLI-008).';

revoke all on function public.cliente_detalhe(uuid) from public, anon;
grant execute on function public.cliente_detalhe(uuid) to authenticated;

-- ===========================================================================
-- CONSENTIMENTO — registrar a decisão do cliente
-- ===========================================================================
-- RN-RMKT-007: "não quero promoções" atualiza o consentimento E tira a
-- pessoa das sugestões. As duas coisas na mesma transação, porque metade
-- disso deixaria o cliente recebendo o que pediu para não receber.
--
-- RN-RMKT-008: isto NÃO afeta contato operacional sobre um pedido em
-- andamento. Aquele contato não depende de consentimento promocional.
create or replace function public.registrar_consentimento(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_cliente uuid := nullif(p_dados ->> 'cliente_id', '')::uuid;
  v_aceita boolean := (p_dados ->> 'aceita')::boolean;
  v_origem text := coalesce(nullif(p_dados ->> 'origem', ''), 'admin');
  v_atual boolean;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  -- Mexer na preferência do cliente é ato sobre o cadastro dele.
  if not public.has_permission('customers.view') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para alterar a preferência do cliente.');
  end if;
  if v_aceita is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe a preferência.');
  end if;
  if v_origem not in ('checkout', 'remarketing', 'admin', 'import', 'other') then
    return jsonb_build_object('ok', false, 'erro', 'Origem inválida.');
  end if;

  select c.marketing_consent into v_atual
    from public.customers c where c.id = v_cliente for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Cliente não encontrado.');
  end if;

  if v_atual is not distinct from v_aceita then
    return jsonb_build_object('ok', true, 'sem_mudanca', true, 'aceita', v_aceita);
  end if;

  update public.customers
     set marketing_consent = v_aceita, marketing_consent_updated_at = now()
   where id = v_cliente;

  insert into public.marketing_consent_history (
    customer_id, consent, source, notes, actor_type, actor_user_id)
  values (v_cliente, v_aceita, v_origem,
          nullif(btrim(coalesce(p_dados ->> 'observacao', '')), ''),
          'user', v_ator);

  return jsonb_build_object('ok', true, 'sem_mudanca', false, 'aceita', v_aceita);
end;
$$;

comment on function public.registrar_consentimento is
  'RN-RMKT-007: atualiza a preferência e registra o histórico na mesma transação.';

revoke all on function public.registrar_consentimento(jsonb) from public, anon;
grant execute on function public.registrar_consentimento(jsonb) to authenticated;
