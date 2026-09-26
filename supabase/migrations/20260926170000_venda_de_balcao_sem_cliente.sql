-- =============================================================================
-- VENDA DE BALCÃO SEM CLIENTE IDENTIFICADO — Fase 12 (PDV), Etapa 6
--
-- 09-PDV-FRENTE-DE-CAIXA.md §1.1, §1.2, §4.1 · 04-REGRAS-NEGOCIO.md RN-MAN
-- 02-MODELO-DADOS-SUPABASE.md §5 · CLAUDE.md §16, §29, §31
-- Decisão: D-2026-09-26-81
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- A Etapa 6 monta a venda de balcão no `/admin/pdv`, e o wireframe aprovado
-- (§4.1) não tem campo de cliente: quem está na frente do balcão leva a pizza
-- e vai embora. Mas `criar_pedido` exigia nome com dois caracteres e um
-- WhatsApp casando `^[0-9]{10,15}$`, sem caminho alternativo.
--
-- A SAÍDA ERRADA seria inventar um telefone. `customers_whatsapp_unico` é
-- índice ÚNICO sobre `whatsapp_normalized` — é a identidade do cliente:
--
--   * número fixo  → TODA venda de balcão vira o mesmo cliente. Histórico,
--                    `padrao_de_compra` e remarketing (§31) passam a descrever
--                    um "super cliente" que não existe;
--   * número por venda → `customers` vira depósito de lixo, e um dos números
--                    sintéticos um dia colide com o de um cliente real.
--
-- A OUTRA SAÍDA ERRADA seria uma RPC `venda_de_balcao` ao lado desta. Seria
-- uma segunda autoridade sobre preço e criação de pedido — exatamente o que o
-- §16 proíbe. A mudança é feita AQUI, na autoridade que já existe.
--
-- `orders.customer_id` JÁ É NULÁVEL: o modelo sempre admitiu pedido sem
-- cliente cadastrado. Esta migration só abre essa porta, e só do lado de
-- dentro. As quatro condições estão comentadas no corpo.
--
-- O QUE MUDA: uma declaração e o bloco 4 (CLIENTE), que passa a ter o ramo
-- anônimo. O restante do corpo é byte a byte o corpo vivo
-- (md5 8eae98fd69dbf2d6217018b04a9e392c, 22.581 caracteres), como manda a
-- disciplina da 0101: recriação não é oportunidade de refatorar.
--
-- O QUE NÃO MUDA, e é o essencial:
--
--   * o checkout PÚBLICO continua exigindo nome e WhatsApp. `v_interno is not
--     null` é a primeira das quatro condições;
--   * WhatsApp e telefone continuam exigindo cliente: só `counter` escapa;
--   * entrega continua exigindo cliente, porque `customer_addresses.customer_id`
--     é NOT NULL e entregar para ninguém não é caso de uso;
--   * preencher só um dos dois campos continua sendo ERRO. Telefone digitado
--     errado falha alto, em vez de virar uma venda anônima em silêncio;
--   * `payment_status` nasce 'pending' como sempre, e nenhum pagamento é
--     criado — receber é a Etapa 7;
--   * nada aqui olha `cash_sessions`: o balcão monta e salva venda com o caixa
--     fechado, e isso não é contorno nenhum — `criar_pedido` nunca dependeu
--     de caixa.
--
-- `create or replace` PRESERVA as concessões, então não há grant nem revoke.
-- =============================================================================

create or replace function public.criar_pedido(p_pedido jsonb, p_segredo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_loja record;
  v_cliente record;
  v_cliente_id uuid;
  v_dispositivo_id uuid;
  v_endereco jsonb;
  v_endereco_id uuid;
  v_modalidade text;
  v_item jsonb;
  v_res jsonb;
  v_detalhe jsonb;
  v_divergencias jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_taxa numeric := 0;
  v_total numeric;
  v_distancia numeric;
  v_faixa_id uuid;
  v_faixa_taxa numeric;
  v_exige_aprovacao boolean := false;
  v_forma record;
  v_bandeira_id uuid;
  v_bandeira_nome text;
  v_troco_para numeric;
  v_troco numeric;
  v_status text;
  v_pix_status text;
  v_pedido_id uuid;
  v_numero bigint;
  v_linha integer := 0;
  v_item_id uuid;
  v_sabor jsonb;
  v_adicional jsonb;
  v_componente jsonb;
  v_existente record;
  v_idem uuid;
  v_whats text;
  v_nome text;
  -- Venda de balcão sem cliente identificado (D-2026-09-26-81).
  v_balcao_anonimo boolean;
  v_visto numeric;
  v_max_distancia numeric;
  -- Quem lançou, quando o lançamento é interno.
  v_interno uuid;
  v_origem text;
  -- RN-MAN-004: o lançamento interno já é o aceite. Guardado para o
  -- histórico, a auditoria e o retorno dizerem isso com todas as letras.
  v_aceito_na_criacao boolean := false;
begin
  -- 1. LEGITIMIDADE ------------------------------------------------------
  if public.origem_confiavel(p_segredo) then
    -- Caminho do cliente público: o servidor provou a origem, e não há
    -- funcionário envolvido mesmo que alguém logado dispare a chamada.
    v_interno := null;
  else
    -- Caminho do balcão: exige sessão interna com a permissão normativa.
    v_interno := public.current_app_user_id();
    if v_interno is null or not public.has_permission('orders.create_manual') then
      return jsonb_build_object('ok', false, 'erro',
        'Não foi possível enviar o pedido por aqui.');
    end if;
  end if;

  -- RN-MAN-002: a origem é preservada para relatórios. O cliente público NÃO
  -- escolhe canal — senão bastaria declarar "balcão" para fugir de alguma
  -- regra. Quem escolhe é quem está lançando.
  if v_interno is null then
    v_origem := 'shalon_link';
  else
    v_origem := coalesce(nullif(p_pedido ->> 'origem', ''), 'counter');
    if v_origem not in ('shalon_link', 'whatsapp', 'phone', 'counter', 'ifood', 'other') then
      return jsonb_build_object('ok', false, 'erro', 'Origem de pedido inválida.');
    end if;
  end if;

  -- 2. IDEMPOTÊNCIA ------------------------------------------------------
  begin
    v_idem := nullif(p_pedido ->> 'idempotency_key', '')::uuid;
  exception when others then
    v_idem := null;
  end;

  if v_idem is not null then
    select o.id, o.order_number, o.status, o.total into v_existente
      from public.orders o where o.idempotency_key = v_idem;
    if v_existente.id is not null then
      return jsonb_build_object(
        'ok', true, 'ja_existia', true,
        'pedido_id', v_existente.id, 'numero', v_existente.order_number,
        'status', v_existente.status, 'total', v_existente.total);
    end if;
  end if;

  -- 3. LOJA --------------------------------------------------------------
  select * into v_loja from public.store_settings limit 1;
  if v_loja.id is null then
    return jsonb_build_object('ok', false, 'erro',
      'A loja ainda não está recebendo pedidos.');
  end if;

  -- RN-MAN-006 (era interpretação em D-2026-09-19-49, hoje é regra):
  -- a pausa fecha o CHECKOUT PÚBLICO, não o balcão. O lançamento interno
  -- não passa pelo checkout — a loja pausa o link público justamente quando
  -- está cheia, e travar o balcão nesse momento impediria de atender quem
  -- está fisicamente na frente do atendente ou ao telefone.
  --
  -- Isso NÃO afrouxa nada além do horário: catálogo, disponibilidade,
  -- compatibilidade, preço e permissão continuam valendo para o pedido
  -- manual, porque são verificados adiante, no mesmo código de sempre.
  if v_interno is null and not coalesce(public.loja_aberta(), false) then
    return jsonb_build_object('ok', false, 'erro',
      'A loja fechou. Seu carrinho continua guardado.', 'loja_fechada', true);
  end if;

  v_modalidade := p_pedido ->> 'modalidade';
  if v_modalidade is null or v_modalidade not in ('delivery', 'pickup') then
    return jsonb_build_object('ok', false, 'erro', 'Escolha entrega ou retirada.');
  end if;

  -- 4. CLIENTE -----------------------------------------------------------
  v_nome := btrim(coalesce(p_pedido -> 'cliente' ->> 'nome', ''));
  v_whats := public.normalizar_whatsapp(p_pedido -> 'cliente' ->> 'whatsapp');

  -- VENDA DE BALCÃO SEM CLIENTE IDENTIFICADO (D-2026-09-26-81).
  --
  -- Quem chega ao balcão e leva uma lata não tem por que informar telefone, e
  -- o PDV não tem campo para isso (09 §4.1). Até aqui, a única saída seria
  -- inventar um WhatsApp — e `customers_whatsapp_unico` é índice ÚNICO sobre o
  -- normalizado, ou seja, a identidade do cliente. Um número fixo colaria
  -- todas as vendas de balcão num único registro e faria histórico,
  -- `padrao_de_compra` e remarketing mentirem sobre ele; números sintéticos por
  -- venda encheriam `customers` de lixo, com risco de colidir com um número
  -- real. `orders.customer_id` já é NULÁVEL: o modelo sempre admitiu pedido sem
  -- cliente cadastrado, e é essa porta que se abre aqui.
  --
  -- QUATRO CONDIÇÕES, TODAS NECESSÁRIAS:
  --
  --  1. lançamento INTERNO. O checkout público continua exigindo identificação:
  --     é o cliente comprando à distância, e sem ele não há a quem entregar,
  --     nem acompanhar, nem avisar;
  --  2. origem `counter`. Pedido de WhatsApp ou telefone tem, por definição,
  --     alguém do outro lado;
  --  3. modalidade `pickup`. Não é preferência: `customer_addresses.customer_id`
  --     é NOT NULL, então entrega sem cliente não teria onde guardar o
  --     endereço — e entregar para ninguém não é um caso de uso;
  --  4. os DOIS campos vazios. Nome preenchido e telefone em branco continua
  --     sendo erro, e é de propósito: assim um telefone digitado errado falha
  --     alto, em vez de virar silenciosamente uma venda anônima.
  --
  -- O que NÃO muda: `payment_status` continua 'pending', a origem continua
  -- gravada, o snapshot do nome continua NOT NULL — passa a ser o literal
  -- "Balcão", que é a verdade sobre quem comprou, e é o mesmo rótulo do
  -- wireframe da fila (§4.2).
  v_balcao_anonimo := v_interno is not null
                  and v_origem = 'counter'
                  and v_modalidade = 'pickup'
                  and v_nome = ''
                  and v_whats = '';

  if v_balcao_anonimo then
    -- Sem cliente: nada a procurar, criar, atualizar ou bloquear.
    v_cliente_id := null;
    v_nome := 'Balcão';
    v_whats := '';
  else
  if length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'erro', 'Informe seu nome.');
  end if;
  if v_whats !~ '^[0-9]{10,15}$' then
    return jsonb_build_object('ok', false, 'erro', 'Informe um WhatsApp válido com DDD.');
  end if;

  select * into v_cliente from public.customers c where c.whatsapp_normalized = v_whats;

  if v_cliente.id is null then
    insert into public.customers (name, whatsapp_normalized, whatsapp_display,
      marketing_consent, marketing_consent_updated_at)
    values (v_nome, v_whats, p_pedido -> 'cliente' ->> 'whatsapp',
      coalesce((p_pedido -> 'cliente' ->> 'consentimento_marketing')::boolean, false),
      case when coalesce((p_pedido -> 'cliente' ->> 'consentimento_marketing')::boolean, false)
           then now() end)
    returning * into v_cliente;
  else
    if v_cliente.is_blocked then
      return jsonb_build_object('ok', false, 'erro',
        'Não conseguimos concluir este pedido. Fale com a pizzaria pelo WhatsApp.');
    end if;

    update public.customers c
      set name = v_nome,
          whatsapp_display = coalesce(p_pedido -> 'cliente' ->> 'whatsapp', c.whatsapp_display),
          marketing_consent =
            coalesce((p_pedido -> 'cliente' ->> 'consentimento_marketing')::boolean, c.marketing_consent),
          marketing_consent_updated_at =
            case when coalesce((p_pedido -> 'cliente' ->> 'consentimento_marketing')::boolean,
                               c.marketing_consent) is distinct from c.marketing_consent
                 then now() else c.marketing_consent_updated_at end
      where c.id = v_cliente.id
      returning * into v_cliente;
  end if;
  v_cliente_id := v_cliente.id;
  end if;

  -- 5. DISPOSITIVO -------------------------------------------------------
  if nullif(p_pedido ->> 'dispositivo_token', '') is not null then
    select d.id into v_dispositivo_id from public.public_devices d
      where d.token_hash = public.hash_token(p_pedido ->> 'dispositivo_token')
        and d.revoked_at is null;

    if v_dispositivo_id is null then
      insert into public.public_devices (customer_id, token_hash)
      values (v_cliente_id, public.hash_token(p_pedido ->> 'dispositivo_token'))
      returning id into v_dispositivo_id;
    else
      update public.public_devices
        set last_seen_at = now(), customer_id = coalesce(customer_id, v_cliente_id)
        where id = v_dispositivo_id;
    end if;
  end if;

  -- 6. ITENS -------------------------------------------------------------
  -- RN-MAN-003: pedido manual respeita as regras estruturais do domínio.
  -- A revalidação é a mesma; estar no administrativo não contorna
  -- disponibilidade nem compatibilidade.
  if jsonb_typeof(p_pedido -> 'itens') <> 'array'
     or jsonb_array_length(p_pedido -> 'itens') = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Seu carrinho está vazio.');
  end if;
  if jsonb_array_length(p_pedido -> 'itens') > 60 then
    return jsonb_build_object('ok', false, 'erro', 'Carrinho grande demais.');
  end if;

  for v_item in select * from jsonb_array_elements(p_pedido -> 'itens') loop
    v_res := public.montar_item(v_item);
    v_visto := nullif(v_item ->> 'preco_unitario_visto', '')::numeric;

    if not (v_res ->> 'ok')::boolean then
      v_divergencias := v_divergencias || jsonb_build_array(jsonb_build_object(
        'linha', v_item ->> 'linha', 'tipo', 'item_invalido',
        'nome', v_res ->> 'nome', 'erro', v_res ->> 'erro'));
    elsif v_visto is not null and v_visto <> (v_res ->> 'preco_unitario')::numeric then
      v_divergencias := v_divergencias || jsonb_build_array(jsonb_build_object(
        'linha', v_item ->> 'linha', 'tipo', 'preco_alterado',
        'nome', v_res ->> 'nome',
        'preco_visto', v_visto, 'preco_atual', (v_res ->> 'preco_unitario')::numeric));
      v_subtotal := v_subtotal + (v_res ->> 'total')::numeric;
    else
      v_subtotal := v_subtotal + (v_res ->> 'total')::numeric;
    end if;
  end loop;

  if jsonb_array_length(v_divergencias) > 0 then
    return jsonb_build_object('ok', false, 'reconfirmar', true,
      'divergencias', v_divergencias,
      'erro', 'O cardápio mudou enquanto você finalizava. Confira antes de enviar.');
  end if;

  -- 7. ENTREGA OU RETIRADA ----------------------------------------------
  if v_modalidade = 'pickup' then
    v_taxa := 0;
  else
    v_endereco := p_pedido -> 'endereco';
    if v_endereco is null or jsonb_typeof(v_endereco) <> 'object' then
      return jsonb_build_object('ok', false, 'erro', 'Informe o endereço de entrega.');
    end if;

    if (v_endereco ->> 'latitude') is null or (v_endereco ->> 'longitude') is null then
      return jsonb_build_object('ok', false, 'erro',
        'Não conseguimos localizar esse endereço. Confira os dados ou ajuste no mapa.',
        'endereco_ambiguo', true);
    end if;

    v_distancia := nullif(p_pedido -> 'rota' ->> 'distancia_km', '')::numeric;
    if v_distancia is null or v_distancia < 0 then
      return jsonb_build_object('ok', false, 'erro',
        'Não conseguimos calcular a rota até você agora. Tente de novo em instantes.',
        'rota_indisponivel', true);
    end if;

    select f.id, f.fee into v_faixa_id, v_faixa_taxa
      from public.faixa_para_distancia(v_distancia) f;

    if v_faixa_id is null then
      select max(b.max_distance_km) into v_max_distancia
        from public.delivery_fee_bands b where b.is_active;
      return jsonb_build_object('ok', false, 'erro',
        case when v_max_distancia is null
             then 'A entrega não está configurada. Você pode escolher retirada.'
             else 'Esse endereço está fora da nossa área de entrega. Você pode escolher retirada.'
        end,
        'fora_de_area', true,
        'distancia_km', v_distancia,
        'distancia_maxima_km', v_max_distancia);
    end if;

    v_taxa := v_faixa_taxa;
    v_exige_aprovacao := v_distancia > v_loja.automatic_delivery_radius_km;

    if v_loja.delivery_minimum_enabled
       and v_subtotal < coalesce(v_loja.delivery_minimum_subtotal, 0) then
      return jsonb_build_object('ok', false,
        'erro', format('O pedido mínimo para entrega é R$ %s.',
                       to_char(v_loja.delivery_minimum_subtotal, 'FM999G999D00')),
        'pedido_minimo', true,
        'minimo', v_loja.delivery_minimum_subtotal, 'subtotal', v_subtotal);
    end if;

    begin
      v_endereco_id := nullif(v_endereco ->> 'id', '')::uuid;
    exception when others then
      v_endereco_id := null;
    end;

    if v_endereco_id is null then
      insert into public.customer_addresses (
        customer_id, label, street, number, complement, neighborhood, city, state,
        postal_code, reference_point, latitude, longitude, geocode_provider,
        geocode_confidence, was_map_adjusted, is_preferred)
      values (
        v_cliente_id,
        nullif(v_endereco ->> 'rotulo', ''),
        v_endereco ->> 'logradouro', v_endereco ->> 'numero',
        nullif(v_endereco ->> 'complemento', ''),
        v_endereco ->> 'bairro', v_endereco ->> 'cidade', v_endereco ->> 'uf',
        nullif(v_endereco ->> 'cep', ''), nullif(v_endereco ->> 'referencia', ''),
        (v_endereco ->> 'latitude')::numeric, (v_endereco ->> 'longitude')::numeric,
        nullif(v_endereco ->> 'provedor', ''), nullif(v_endereco ->> 'confianca', ''),
        coalesce((v_endereco ->> 'ajustado_no_mapa')::boolean, false),
        not exists (select 1 from public.customer_addresses a
                     where a.customer_id = v_cliente_id and a.is_active))
      returning id into v_endereco_id;
    end if;
  end if;

  v_total := v_subtotal + v_taxa;

  -- 8. PAGAMENTO ---------------------------------------------------------
  select * into v_forma from public.payment_methods m
    where m.id = nullif(p_pedido -> 'pagamento' ->> 'forma_id', '')::uuid
      and m.is_active
      and ((v_modalidade = 'delivery' and m.available_for_delivery)
           or (v_modalidade = 'pickup' and m.available_for_pickup));

  if v_forma.id is null then
    return jsonb_build_object('ok', false, 'erro',
      'Escolha uma forma de pagamento disponível.');
  end if;

  if v_forma.requires_brand then
    select b.id, b.name into v_bandeira_id, v_bandeira_nome
      from public.payment_brands b
      where b.id = nullif(p_pedido -> 'pagamento' ->> 'bandeira_id', '')::uuid
        and b.payment_method_id = v_forma.id
        and b.is_active;
    if v_bandeira_id is null then
      return jsonb_build_object('ok', false, 'erro',
        format('Escolha a bandeira aceita para %s.', v_forma.name));
    end if;
  end if;

  if v_forma.payment_family = 'pix_key'
     and not exists (select 1 from public.pix_key_settings p where p.is_enabled) then
    return jsonb_build_object('ok', false, 'erro',
      'O Pix antecipado não está disponível no momento.');
  end if;

  if coalesce((p_pedido -> 'pagamento' ->> 'precisa_troco')::boolean, false) then
    if v_forma.payment_family <> 'cash' then
      return jsonb_build_object('ok', false, 'erro',
        'Troco só se aplica a pagamento em dinheiro.');
    end if;
    v_troco_para := nullif(p_pedido -> 'pagamento' ->> 'troco_para', '')::numeric;
    if v_troco_para is null or v_troco_para < v_total then
      return jsonb_build_object('ok', false,
        'erro', 'O valor para troco precisa ser igual ou maior que o total do pedido.',
        'troco_invalido', true, 'total', v_total);
    end if;
    v_troco := v_troco_para - v_total;
  end if;

  -- 9. ESTADO INICIAL ----------------------------------------------------
  -- RN-MAN-004 e RN-MAN-005, que substituem a lacuna D-2026-09-19-48.
  --
  -- Pedido público é SOLICITAÇÃO do cliente: aguarda a Shalon confirmar.
  -- Pedido manual é REGISTRO de um pedido que a Shalon já recebeu e já
  -- aceitou por outro canal. Exigir do atendente um segundo clique de
  -- "aceitar" logo depois de ele ter lançado o pedido seria cerimônia sem
  -- conteúdo — ele já decidiu ao lançar.
  --
  -- MAS a ordem das condições importa, e é ela que faz RN-MAN-005 valer:
  -- os bloqueios são testados ANTES. Nascer aceito é o caso em que nada
  -- bloqueia, nunca um atalho para furar bloqueio. Pix por chave continua
  -- esperando confirmação de recebimento; entrega acima do raio automático
  -- continua esperando aprovação — inclusive porque aprovar exige
  -- `orders.accept`, que nem todo lançador de pedido manual tem.
  if v_forma.payment_family = 'pix_key' then
    v_status := 'waiting_pix_confirmation';
    v_pix_status := 'pending';
  elsif v_exige_aprovacao then
    v_status := 'waiting_delivery_approval';
  elsif v_interno is not null then
    v_status := 'confirmed';
    v_aceito_na_criacao := true;
  else
    v_status := 'waiting_store_confirmation';
  end if;

  -- 10. CRIAÇÃO ----------------------------------------------------------
  insert into public.orders (
    customer_id, public_device_id, tracking_token_hash, source, fulfillment_type,
    status, payment_status, customer_name_snapshot, customer_whatsapp_snapshot,
    marketing_consent_snapshot, subtotal, delivery_fee, total, general_note,
    estimated_min_minutes, estimated_max_minutes,
    requires_delivery_approval, delivery_approval_status,
    delivery_route_distance_km, delivery_route_provider, delivery_fee_band_id,
    delivery_address_snapshot, store_address_snapshot, idempotency_key,
    created_by_user_id, accepted_by, accepted_at
  ) values (
    v_cliente_id, v_dispositivo_id,
    public.hash_token(p_pedido ->> 'tracking_token'),
    v_origem,
    v_modalidade, v_status, 'pending',
    v_nome, v_whats,
    coalesce((p_pedido -> 'cliente' ->> 'consentimento_marketing')::boolean, false),
    v_subtotal, v_taxa, v_total,
    nullif(btrim(coalesce(p_pedido ->> 'observacao_geral', '')), ''),
    case when v_modalidade = 'delivery'
         then coalesce(v_loja.current_delivery_eta_min_minutes, v_loja.delivery_eta_min_minutes)
         else coalesce(v_loja.current_pickup_eta_min_minutes, v_loja.pickup_eta_min_minutes) end,
    case when v_modalidade = 'delivery'
         then coalesce(v_loja.current_delivery_eta_max_minutes, v_loja.delivery_eta_max_minutes)
         else coalesce(v_loja.current_pickup_eta_max_minutes, v_loja.pickup_eta_max_minutes) end,
    v_exige_aprovacao,
    case when v_exige_aprovacao then 'pending' end,
    v_distancia,
    case when v_modalidade = 'delivery' then nullif(p_pedido -> 'rota' ->> 'provedor', '') end,
    v_faixa_id,
    case when v_modalidade = 'delivery' then jsonb_build_object(
      'endereco_id', v_endereco_id,
      'logradouro', v_endereco ->> 'logradouro', 'numero', v_endereco ->> 'numero',
      'complemento', v_endereco ->> 'complemento', 'bairro', v_endereco ->> 'bairro',
      'cidade', v_endereco ->> 'cidade', 'uf', v_endereco ->> 'uf',
      'cep', v_endereco ->> 'cep', 'referencia', v_endereco ->> 'referencia',
      'latitude', v_endereco ->> 'latitude', 'longitude', v_endereco ->> 'longitude',
      'confianca', v_endereco ->> 'confianca'
    ) end,
    jsonb_build_object(
      'nome', v_loja.store_name,
      'logradouro', v_loja.address_street, 'numero', v_loja.address_number,
      'bairro', v_loja.address_neighborhood, 'cidade', v_loja.address_city,
      'uf', v_loja.address_state, 'cep', v_loja.address_postal_code
    ),
    v_idem,
    v_interno,
    -- Mesmas colunas que `comando_pedido` preencheria no aceite manual: o
    -- aceite do lançamento interno não é um estado órfão sem autor (§33).
    case when v_aceito_na_criacao then v_interno end,
    case when v_aceito_na_criacao then now() end
  ) returning id, order_number into v_pedido_id, v_numero;

  for v_item in select * from jsonb_array_elements(p_pedido -> 'itens') loop
    v_res := public.montar_item(v_item);
    v_detalhe := v_res -> 'detalhe';
    v_linha := v_linha + 1;

    insert into public.order_items (
      order_id, line_number, item_type, product_id, product_name_snapshot,
      category_name_snapshot, quantity, unit_price, line_total,
      size_id, size_name_snapshot, crust_id, crust_name_snapshot, crust_price_snapshot,
      observation, promotion_id, promotion_name_snapshot, regular_unit_price_snapshot
    ) values (
      v_pedido_id, v_linha, v_detalhe ->> 'item_type',
      (v_detalhe ->> 'produto_id')::uuid, v_detalhe ->> 'produto_nome',
      v_detalhe ->> 'categoria_nome',
      (v_res ->> 'quantidade')::integer,
      (v_res ->> 'preco_unitario')::numeric,
      (v_res ->> 'total')::numeric,
      nullif(v_detalhe ->> 'tamanho_id', '')::uuid, v_detalhe ->> 'tamanho_nome',
      nullif(v_detalhe ->> 'borda_id', '')::uuid, v_detalhe ->> 'borda_nome',
      coalesce((v_detalhe ->> 'borda_preco')::numeric, 0),
      nullif(btrim(coalesce(v_item ->> 'observacao', '')), ''),
      nullif(v_detalhe ->> 'promocao_id', '')::uuid, v_detalhe ->> 'promocao_nome',
      nullif(v_detalhe ->> 'preco_regular', '')::numeric
    ) returning id into v_item_id;

    for v_sabor in select * from jsonb_array_elements(coalesce(v_detalhe -> 'sabores', '[]'::jsonb)) loop
      insert into public.order_item_flavors (
        order_item_id, flavor_product_id, flavor_name_snapshot, variant_id,
        effective_price_snapshot, portion, sort_order)
      values (
        v_item_id, (v_sabor ->> 'produto_id')::uuid, v_sabor ->> 'nome',
        (v_sabor ->> 'variacao_id')::uuid, (v_sabor ->> 'preco_efetivo')::numeric,
        (v_sabor ->> 'porcao')::numeric, coalesce((v_sabor ->> 'ordem')::integer, 0));
    end loop;

    for v_adicional in select * from jsonb_array_elements(coalesce(v_detalhe -> 'adicionais', '[]'::jsonb)) loop
      insert into public.order_item_addons (
        order_item_id, addon_id, addon_name_snapshot, price_snapshot)
      values (v_item_id, (v_adicional ->> 'id')::uuid, v_adicional ->> 'nome',
        (v_adicional ->> 'preco')::numeric);
    end loop;

    for v_componente in select * from jsonb_array_elements(coalesce(v_detalhe -> 'combo', '[]'::jsonb)) loop
      insert into public.order_combo_components (
        order_item_id, component_product_id, component_variant_id,
        product_name_snapshot, size_name_snapshot, quantity, sort_order)
      values (v_item_id, (v_componente ->> 'produto_id')::uuid,
        nullif(v_componente ->> 'variacao_id', '')::uuid,
        v_componente ->> 'nome', v_componente ->> 'tamanho_nome',
        (v_componente ->> 'quantidade')::integer,
        coalesce((v_componente ->> 'ordem')::integer, 0));
    end loop;
  end loop;

  insert into public.order_payment_intents (
    order_id, payment_method_id, payment_method_name_snapshot,
    payment_method_family_snapshot, payment_brand_id, payment_brand_name_snapshot,
    amount_expected, needs_change, change_for_amount, expected_change_amount,
    pix_confirmation_status
  ) values (
    v_pedido_id, v_forma.id, v_forma.name, v_forma.payment_family,
    v_bandeira_id, v_bandeira_nome,
    v_total, v_troco is not null, v_troco_para, v_troco, v_pix_status
  );

  insert into public.order_status_history (order_id, from_status, to_status,
    actor_type, actor_user_id, reason)
  values (v_pedido_id, null, v_status,
    case when v_interno is null then 'customer' else 'user' end,
    v_interno,
    case when v_interno is null then 'Pedido enviado pelo cliente'
         when v_aceito_na_criacao then 'Pedido lançado e aceito pela equipe no mesmo ato'
         else 'Pedido lançado pela equipe' end);

  -- §33: lançamento manual é ato de funcionário e fica auditado.
  if v_interno is not null then
    perform public.log_audit('criar_pedido_manual', 'orders', v_pedido_id, null,
      jsonb_build_object('origem', v_origem, 'total', v_total, 'status', v_status,
                         'aceito_na_criacao', v_aceito_na_criacao), null);
  end if;

  return jsonb_build_object(
    'ok', true, 'ja_existia', false,
    'pedido_id', v_pedido_id, 'numero', v_numero, 'status', v_status,
    'subtotal', v_subtotal, 'taxa_entrega', v_taxa, 'total', v_total,
    'exige_aprovacao_entrega', v_exige_aprovacao,
    'distancia_km', v_distancia,
    'origem', v_origem,
    'aceito_na_criacao', v_aceito_na_criacao,
    'troco_esperado', v_troco);
end;
$$;
