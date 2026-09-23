-- 0094 — Remarketing assistido: candidatos, contato preparado e desfecho
-- 04-REGRAS-NEGOCIO.md RN-RMKT-001..008, RN-CRM-002/004, RN-CLI-008
-- 01-DOCUMENTO-MESTRE.md §79.22 · 03 §12 · CLAUDE.md §31
--
-- O QUE ESTE MÓDULO FAZ: ajuda a ESCOLHER com quem falar e prepara a
-- mensagem. Quem fala é a pessoa, pelo WhatsApp dela.
--
-- O QUE ELE NÃO FAZ, por regra e não por falta de tempo (CLAUDE.md §31):
--   · não dispara mensagem;
--   · não usa a API do WhatsApp Business;
--   · não gera texto sozinho — o template é escrito por gente, e o
--     funcionário pode editar antes de abrir a conversa;
--   · não afirma que o contato causou a compra (RN-RMKT-005).

-- ===========================================================================
-- CANDIDATOS
-- ===========================================================================
-- RN-RMKT-006: contato PROMOCIONAL respeita consentimento. Por isso o filtro
-- de consentimento é `true` por padrão aqui — quem não quer promoção não
-- entra na lista sem que alguém peça explicitamente o contrário, e mesmo
-- assim a linha sai marcada.
--
-- RN-RMKT-008 continua valendo do outro lado: falar com o cliente sobre um
-- pedido EM ANDAMENTO é outra coisa, acontece na tela do pedido, e não passa
-- por aqui nem depende de consentimento.
--
-- Cliente BLOQUEADO nunca entra: ele não pode nem fazer pedido novo
-- (RN-CLI-008); convidá-lo a voltar seria incoerente.
create or replace function public.candidatos_de_remarketing(p_filtros jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ausencia integer := nullif(p_filtros ->> 'ausencia_minima', '')::integer;
  v_classificacao text := nullif(p_filtros ->> 'classificacao', '');
  v_min_pedidos integer := coalesce(nullif(p_filtros ->> 'pedidos_minimos', '')::integer, 0);
  v_ticket_minimo numeric := nullif(p_filtros ->> 'ticket_minimo', '')::numeric;
  v_categoria uuid := nullif(p_filtros ->> 'categoria_id', '')::uuid;
  v_produto uuid := nullif(p_filtros ->> 'produto_id', '')::uuid;
  -- Só quem consente, salvo pedido explícito de ver os demais.
  v_com_consentimento boolean := coalesce((p_filtros ->> 'somente_com_consentimento')::boolean, true);
  -- Evitar reabordar quem foi contatado há pouco. Sem número mágico: quem
  -- decide os dias é quem está operando, e o padrão é não filtrar.
  v_desde_ultimo_contato integer := nullif(p_filtros ->> 'dias_desde_ultimo_contato', '')::integer;
  v_limite integer := greatest(least(coalesce(nullif(p_filtros ->> 'limite', '')::integer, 50), 200), 1);
  v_linhas jsonb;
  v_total integer;
begin
  if not public.has_permission('remarketing.view') then
    return jsonb_build_object('ok', false, 'sem_permissao', true,
      'erro', 'Você não tem permissão para ver remarketing.');
  end if;

  -- Uma instrução só: o total filtrado e as linhas exibidas saem da mesma
  -- varredura, e o total NÃO é o tamanho da página.
  with base as (
    select
      c.id, c.name as nome, c.whatsapp_display as whatsapp,
      c.marketing_consent as aceita_promocao,
      p.pedidos, p.ultima_compra, p.ticket_medio, p.faturamento,
      p.intervalo_tipico, p.dias_sem_comprar,
      public.classificar_cliente(p.pedidos, p.intervalo_tipico, p.dias_sem_comprar) as classificacao,
      (select max(r.contacted_at) from public.remarketing_contacts r
        where r.customer_id = c.id) as ultimo_contato
    from public.customers c
    join public.padrao_de_compra() p on p.customer_id = c.id
    where not c.is_blocked
  ),
  filtrados as (
    select * from base b
     where (v_ausencia is null or b.dias_sem_comprar >= v_ausencia)
       and (v_classificacao is null or b.classificacao = v_classificacao)
       and b.pedidos >= v_min_pedidos
       and (v_ticket_minimo is null or b.ticket_medio >= v_ticket_minimo)
       and (not v_com_consentimento or b.aceita_promocao)
       and (v_desde_ultimo_contato is null
            or b.ultimo_contato is null
            or b.ultimo_contato < now() - make_interval(days => v_desde_ultimo_contato))
       -- Segmentação por produto/categoria comprados: usa o vínculo do item
       -- com o produto, não o texto do snapshot (nome muda, id não).
       and (v_produto is null or exists (
             select 1 from public.order_items i
               join public.orders o on o.id = i.order_id
              where o.customer_id = b.id and o.status = 'completed'
                and (i.product_id = v_produto
                     or exists (select 1 from public.order_item_flavors f
                                 where f.order_item_id = i.id
                                   and f.flavor_product_id = v_produto))))
       and (v_categoria is null or exists (
             select 1 from public.order_items i
               join public.orders o on o.id = i.order_id
               join public.products pr on pr.id = i.product_id
              where o.customer_id = b.id and o.status = 'completed'
                and pr.category_id = v_categoria))
  ),
  pagina as (
    select * from filtrados
     order by dias_sem_comprar desc, nome
     limit v_limite
  )
  select
    (select count(*)::integer from filtrados),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'cliente_id', f.id,
               'nome', f.nome,
               'whatsapp', f.whatsapp,
               'aceita_promocao', f.aceita_promocao,
               'pedidos', f.pedidos,
               'ultima_compra', f.ultima_compra,
               'dias_sem_comprar', f.dias_sem_comprar,
               'intervalo_tipico', f.intervalo_tipico,
               'ticket_medio', f.ticket_medio,
               'faturamento', f.faturamento,
               'classificacao', f.classificacao,
               'ultimo_contato', f.ultimo_contato)
             order by f.dias_sem_comprar desc, f.nome)
        from pagina f), '[]'::jsonb)
    into v_total, v_linhas;

  return jsonb_build_object(
    'ok', true,
    'candidatos', v_linhas,
    'total_filtrado', v_total,
    'limite', v_limite,
    'somente_com_consentimento', v_com_consentimento);
end;
$$;

comment on function public.candidatos_de_remarketing is
  'RN-RMKT-006: público promocional respeita consentimento por padrão. Cliente bloqueado nunca entra.';

revoke all on function public.candidatos_de_remarketing(jsonb) from public, anon;
grant execute on function public.candidatos_de_remarketing(jsonb) to authenticated;

-- ===========================================================================
-- TEMPLATES
-- ===========================================================================
create or replace function public.salvar_template_de_remarketing(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_id uuid := nullif(p_dados ->> 'id', '')::uuid;
  v_nome text := nullif(btrim(coalesce(p_dados ->> 'nome', '')), '');
  v_mensagem text := nullif(btrim(coalesce(p_dados ->> 'mensagem', '')), '');
  v_ativo boolean := coalesce((p_dados ->> 'ativo')::boolean, true);
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('remarketing.contact') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para gerenciar templates.');
  end if;
  if v_nome is null or length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'erro', 'Informe o nome do template.');
  end if;
  if v_mensagem is null or length(v_mensagem) < 5 then
    return jsonb_build_object('ok', false, 'erro', 'Escreva a mensagem.');
  end if;
  if length(v_mensagem) > 700 then
    return jsonb_build_object('ok', false, 'erro', 'Mensagem longa demais (máximo 700 caracteres).');
  end if;

  begin
    if v_id is null then
      insert into public.remarketing_templates (name, message, is_active, sort_order, created_by)
      values (v_nome, v_mensagem, v_ativo,
              coalesce((p_dados ->> 'ordem')::integer, 0), v_ator)
      returning id into v_id;
    else
      update public.remarketing_templates
         set name = v_nome, message = v_mensagem, is_active = v_ativo,
             sort_order = coalesce((p_dados ->> 'ordem')::integer, sort_order)
       where id = v_id;
      if not found then
        return jsonb_build_object('ok', false, 'erro', 'Template não encontrado.');
      end if;
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'erro', 'Já existe um template com esse nome.');
  end;

  return jsonb_build_object('ok', true, 'template_id', v_id);
end;
$$;

revoke all on function public.salvar_template_de_remarketing(jsonb) from public, anon;
grant execute on function public.salvar_template_de_remarketing(jsonb) to authenticated;

-- Aplica as variáveis do template aos dados do cliente.
--
-- Só três variáveis, e todas seguras: nome, dias sem comprar e a data da
-- última compra. Nada de endereço, valor gasto ou histórico — mensagem
-- promocional não precisa disso, e §28 pede o mínimo.
create or replace function public.montar_mensagem_de_remarketing(
  p_mensagem text, p_cliente uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare
  v_nome text;
  v_dias integer;
  v_ultima date;
begin
  select c.name, p.dias_sem_comprar, public.dia_da_loja(p.ultima_compra)
    into v_nome, v_dias, v_ultima
    from public.customers c
    left join public.padrao_de_compra() p on p.customer_id = c.id
   where c.id = p_cliente;

  if v_nome is null then
    return p_mensagem;
  end if;

  return replace(replace(replace(p_mensagem,
    '{{nome}}', split_part(v_nome, ' ', 1)),
    '{{dias_sem_comprar}}', coalesce(v_dias::text, '—')),
    '{{ultima_compra}}', coalesce(to_char(v_ultima, 'DD/MM/YYYY'), '—'));
end;
$$;

comment on function public.montar_mensagem_de_remarketing is
  'Aplica {{nome}}, {{dias_sem_comprar}} e {{ultima_compra}}. Nenhum dado pessoal além disso entra na mensagem.';

revoke all on function public.montar_mensagem_de_remarketing(text, uuid) from public, anon;
grant execute on function public.montar_mensagem_de_remarketing(text, uuid) to authenticated;

-- ===========================================================================
-- PREPARAR O CONTATO
-- ===========================================================================
-- RN-RMKT-002/003. Isto registra que a conversa foi PREPARADA e devolve o
-- que a aplicação precisa para abrir o WhatsApp. O desfecho fica nulo — e é
-- exatamente essa a diferença entre "abri o link" e "falei com a pessoa"
-- (§18 da autorização).
create or replace function public.preparar_contato_de_remarketing(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_cliente uuid := nullif(p_dados ->> 'cliente_id', '')::uuid;
  v_template uuid := nullif(p_dados ->> 'template_id', '')::uuid;
  v_texto text := nullif(btrim(coalesce(p_dados ->> 'mensagem', '')), '');
  v_segmento text := nullif(btrim(coalesce(p_dados ->> 'segmento', '')), '');
  v_promocional boolean := coalesce((p_dados ->> 'promocional')::boolean, true);
  v_cliente_rec record;
  v_modelo text;
  v_id uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('remarketing.contact') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para registrar contato de remarketing.');
  end if;

  select c.id, c.name, c.whatsapp_normalized, c.whatsapp_display,
         c.marketing_consent, c.is_blocked
    into v_cliente_rec
    from public.customers c where c.id = v_cliente;
  if v_cliente_rec.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Cliente não encontrado.');
  end if;

  -- RN-CLI-008: bloqueado não recebe convite para voltar.
  if v_cliente_rec.is_blocked then
    return jsonb_build_object('ok', false, 'bloqueado', true,
      'erro', 'Este cliente está bloqueado para novos pedidos.');
  end if;

  -- RN-RMKT-006/007: a trava que faz o consentimento valer. Sem ela, o
  -- "não quero promoções" seria decorativo.
  if v_promocional and not v_cliente_rec.marketing_consent then
    return jsonb_build_object('ok', false, 'sem_consentimento', true,
      'erro', 'Este cliente pediu para não receber contato promocional.');
  end if;

  -- O texto vem do template escolhido, do texto editado, ou dos dois: o
  -- funcionário pode ter ajustado antes de mandar, e é o que ele realmente
  -- preparou que fica guardado.
  if v_texto is null and v_template is not null then
    select t.message into v_modelo from public.remarketing_templates t
     where t.id = v_template and t.is_active;
    if v_modelo is null then
      return jsonb_build_object('ok', false, 'erro', 'Template não encontrado ou inativo.');
    end if;
    v_texto := public.montar_mensagem_de_remarketing(v_modelo, v_cliente);
  end if;

  if v_texto is null or length(v_texto) < 5 then
    return jsonb_build_object('ok', false, 'erro', 'Escreva a mensagem antes de abrir a conversa.');
  end if;

  insert into public.remarketing_contacts (
    customer_id, template_id, channel, segment, message_snapshot, prepared_by)
  values (v_cliente, v_template,
          coalesce(nullif(p_dados ->> 'canal', ''), 'whatsapp'),
          v_segmento, v_texto, v_ator)
  returning id into v_id;

  perform public.log_audit('remarketing_preparar_contato', 'customers', v_cliente,
    null,
    jsonb_build_object('contato_id', v_id, 'segmento', v_segmento,
                       'template_id', v_template, 'promocional', v_promocional),
    null);

  return jsonb_build_object(
    'ok', true,
    'contato_id', v_id,
    -- A aplicação monta o link com isto. O banco não conhece URL de
    -- WhatsApp, e não precisa conhecer.
    'whatsapp', v_cliente_rec.whatsapp_normalized,
    'whatsapp_exibicao', v_cliente_rec.whatsapp_display,
    'mensagem', v_texto,
    -- Dito com todas as letras para a interface não se enganar sozinha.
    'estado', 'preparado',
    'aviso', 'Abrir a conversa não registra envio. Informe o resultado depois de falar com a pessoa.');
end;
$$;

comment on function public.preparar_contato_de_remarketing is
  'RN-RMKT-002/003: registra a tentativa PREPARADA e devolve telefone e texto. Não envia nada.';

revoke all on function public.preparar_contato_de_remarketing(jsonb) from public, anon;
grant execute on function public.preparar_contato_de_remarketing(jsonb) to authenticated;

-- ===========================================================================
-- INFORMAR O DESFECHO
-- ===========================================================================
-- RN-RMKT-004. E RN-RMKT-007: "não quer receber" não é só um rótulo no
-- histórico — atualiza o consentimento na MESMA transação, senão o cliente
-- continuaria aparecendo na próxima lista.
create or replace function public.registrar_resultado_do_contato(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_contato uuid := nullif(p_dados ->> 'contato_id', '')::uuid;
  v_resultado text := nullif(p_dados ->> 'resultado', '');
  v_cliente uuid;
  v_ja text;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('remarketing.contact') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para registrar resultado de contato.');
  end if;
  if v_resultado not in ('contacted', 'no_response', 'interested', 'opted_out', 'other') then
    return jsonb_build_object('ok', false, 'erro', 'Resultado inválido.');
  end if;

  select r.customer_id, r.result into v_cliente, v_ja
    from public.remarketing_contacts r where r.id = v_contato for update;
  if v_cliente is null then
    return jsonb_build_object('ok', false, 'erro', 'Contato não encontrado.');
  end if;
  if v_ja is not null then
    return jsonb_build_object('ok', false, 'ja_informado', true,
      'erro', 'Este contato já teve o resultado informado.', 'resultado', v_ja);
  end if;

  update public.remarketing_contacts
     set result = v_resultado, result_at = now(), result_by = v_ator,
         notes = nullif(btrim(coalesce(p_dados ->> 'observacao', '')), '')
   where id = v_contato;

  -- RN-RMKT-007: o pedido do cliente vale mais que a campanha.
  if v_resultado = 'opted_out' then
    perform public.registrar_consentimento(jsonb_build_object(
      'cliente_id', v_cliente, 'aceita', false, 'origem', 'remarketing',
      'observacao', 'Pedido durante contato de remarketing.'));
  end if;

  return jsonb_build_object('ok', true, 'resultado', v_resultado,
    'consentimento_retirado', v_resultado = 'opted_out');
end;
$$;

comment on function public.registrar_resultado_do_contato is
  'RN-RMKT-004/007: desfecho informado por quem falou. "Não quer receber" retira o consentimento na mesma transação.';

revoke all on function public.registrar_resultado_do_contato(jsonb) from public, anon;
grant execute on function public.registrar_resultado_do_contato(jsonb) to authenticated;

-- ===========================================================================
-- COMPRA POSTERIOR — temporal, nunca causal
-- ===========================================================================
-- RN-RMKT-005 e §20 da autorização. A pergunta que o sistema responde é
-- "houve compra depois do contato?". A pergunta que ele NÃO responde é "o
-- contato trouxe a compra?" — e a diferença aparece no nome de cada campo,
-- na frase de ressalva e na ausência de qualquer campo de "conversão".
--
-- O vínculo é calculado na leitura, a partir de `orders`: é a fonte que não
-- envelhece. A coluna persistida existe para quem consulta a tabela direto,
-- e é preenchida pela rotina abaixo, com exatamente a mesma regra.
create or replace function public.relatorio_de_remarketing(
  p_chave text default '30d', p_de date default null, p_ate date default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_periodo jsonb;
begin
  if not public.has_permission('remarketing.view') then
    return jsonb_build_object('ok', false, 'sem_permissao', true,
      'erro', 'Você não tem permissão para ver remarketing.');
  end if;

  v_periodo := public.periodo_analitico(p_chave, p_de, p_ate);
  if not (v_periodo ->> 'ok')::boolean then
    return v_periodo;
  end if;

  return jsonb_build_object(
    'ok', true,
    'periodo', v_periodo,
    'ressalva',
      'Compra posterior é um fato temporal: houve compra depois do contato. O sistema não afirma que o contato causou a compra.',

    'contatos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'contato_id', t.id,
               'cliente_id', t.customer_id,
               'cliente', t.nome,
               'em', t.contacted_at,
               'canal', t.channel,
               'segmento', t.segment,
               'template', t.template_nome,
               'resultado', t.result,
               'resultado_em', t.result_at,
               'observacao', t.notes,
               -- O fato temporal, calculado agora a partir dos pedidos.
               'comprou_depois', t.pedido_posterior is not null,
               'pedido_posterior', t.pedido_posterior,
               'compra_em', t.compra_em,
               'dias_ate_a_compra', t.dias_ate_a_compra)
             order by t.contacted_at desc)
        from (
          select r.id, r.customer_id, c.name as nome, r.contacted_at, r.channel,
                 r.segment, r.result, r.result_at, r.notes,
                 tp.name as template_nome,
                 o.order_number as pedido_posterior,
                 o.completed_at as compra_em,
                 case when o.completed_at is not null
                      then (public.dia_da_loja(o.completed_at)
                            - public.dia_da_loja(r.contacted_at))::integer end
                   as dias_ate_a_compra
            from public.remarketing_contacts r
            join public.customers c on c.id = r.customer_id
            left join public.remarketing_templates tp on tp.id = r.template_id
            left join lateral (
              select o2.order_number, o2.completed_at
                from public.orders o2
               where o2.customer_id = r.customer_id
                 and o2.status = 'completed'
                 and o2.completed_at > r.contacted_at
               order by o2.completed_at
               limit 1) o on true
           where r.contacted_at >= (v_periodo ->> 'inicio')::timestamptz
             and r.contacted_at <  (v_periodo ->> 'fim')::timestamptz
           order by r.contacted_at desc
           limit 200) t), '[]'::jsonb),

    'resumo', (
      select jsonb_build_object(
        'contatos_preparados', count(*)::integer,
        'sem_resultado_informado', count(*) filter (where r.result is null)::integer,
        'contatados', count(*) filter (where r.result = 'contacted')::integer,
        'sem_resposta', count(*) filter (where r.result = 'no_response')::integer,
        'interessados', count(*) filter (where r.result = 'interested')::integer,
        'pediram_para_nao_receber', count(*) filter (where r.result = 'opted_out')::integer,
        'com_compra_posterior', count(*) filter (where exists (
            select 1 from public.orders o
             where o.customer_id = r.customer_id and o.status = 'completed'
               and o.completed_at > r.contacted_at))::integer)
        from public.remarketing_contacts r
       where r.contacted_at >= (v_periodo ->> 'inicio')::timestamptz
         and r.contacted_at <  (v_periodo ->> 'fim')::timestamptz));
end;
$$;

comment on function public.relatorio_de_remarketing is
  'RN-RMKT-005: "comprou depois" é temporal. Nenhum campo, nome ou número afirma causalidade.';

revoke all on function public.relatorio_de_remarketing(text, date, date) from public, anon;
grant execute on function public.relatorio_de_remarketing(text, date, date) to authenticated;

-- Mantém as colunas persistidas de 02 §15.3 em dia com a MESMA regra usada
-- na leitura. Explícita e idempotente: nenhuma rotina automática escreve no
-- histórico sem alguém pedir.
create or replace function public.marcar_compras_posteriores()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_marcados integer := 0;
begin
  if not public.has_permission('remarketing.contact') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para atualizar contatos.');
  end if;

  with pendentes as (
    select r.id, o.id as pedido
      from public.remarketing_contacts r
      cross join lateral (
        select o2.id
          from public.orders o2
         where o2.customer_id = r.customer_id
           and o2.status = 'completed'
           and o2.completed_at > r.contacted_at
         order by o2.completed_at
         limit 1) o
     where r.subsequent_order_id is null
  )
  update public.remarketing_contacts r
     set subsequent_order_id = p.pedido, returned_after_contact = true
    from pendentes p
   where r.id = p.id;
  get diagnostics v_marcados = row_count;

  return jsonb_build_object('ok', true, 'marcados', v_marcados);
end;
$$;

comment on function public.marcar_compras_posteriores is
  'Sincroniza as colunas de 02 §15.3 com a regra temporal da leitura. Não afirma causalidade.';

revoke all on function public.marcar_compras_posteriores() from public, anon;
grant execute on function public.marcar_compras_posteriores() to authenticated;
