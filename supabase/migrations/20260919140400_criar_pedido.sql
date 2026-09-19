-- 0042 — Criação transacional do pedido
-- 03-RLS-RBAC-SEGURANCA.md §9.2 · 02-MODELO-DADOS-SUPABASE.md §19 e §24
-- 04-REGRAS-NEGOCIO.md RN-VALID, RN-CLI, RN-ENT, RN-PGTO, RN-CHK · CLAUDE.md §16, §34
--
-- ESTA É A ÚNICA PORTA DE CRIAÇÃO DE PEDIDO PÚBLICO.
--
-- Recebe IDs e escolhas; recalcula TUDO. Nenhum valor monetário vindo de
-- fora é aceito como autoridade — nem preço de item, nem subtotal, nem
-- taxa, nem total. O único número que vem de fora é a DISTÂNCIA, porque o
-- Postgres não fala com o provedor de rotas; e ela só é aceita mediante
-- prova de que a chamada partiu do nosso servidor (migration 0040).
--
-- Tudo acontece na transação da própria função: ou nasce pedido completo
-- com itens, sabores, adicionais, componentes, intenção de pagamento e
-- histórico, ou não nasce nada (CLAUDE.md §34).

-- RN-ENT-015: fronteira (min, max], e a faixa que começa em 0 cobre o 0.
create or replace function public.faixa_para_distancia(p_km numeric)
returns public.delivery_fee_bands language sql stable set search_path = ''
as $$
  select b.*
  from public.delivery_fee_bands b
  where b.is_active
    and p_km is not null
    and (
      (p_km > b.min_distance_km and p_km <= b.max_distance_km)
      or (p_km = 0 and b.min_distance_km = 0)
    )
  order by b.min_distance_km
  limit 1;
$$;

comment on function public.faixa_para_distancia is 'RN-ENT-015: fronteira (min, max]; a faixa iniciada em 0 cobre a distância 0.';

revoke all on function public.faixa_para_distancia(numeric) from public;
grant execute on function public.faixa_para_distancia(numeric) to anon, authenticated;

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
  -- Escalares, e não RECORD: a bandeira só é consultada quando a forma
  -- exige, e RECORD não atribuído estoura em plpgsql (lição da 0036).
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
  v_visto numeric;
  v_max_distancia numeric;
begin
  -- 1. ORIGEM ------------------------------------------------------------
  -- Sem a prova de origem, a função não faz nada. É o que impede alguém de
  -- chamar /rest/v1/rpc/criar_pedido do navegador informando a distância
  -- que quiser (03 §9.1).
  if not public.origem_confiavel(p_segredo) then
    return jsonb_build_object('ok', false, 'erro',
      'Não foi possível enviar o pedido por aqui.');
  end if;

  -- 2. IDEMPOTÊNCIA ------------------------------------------------------
  -- Clique duplo, reenvio por rede instável e retry do navegador chegam
  -- como a MESMA tentativa. Só pode virar um pedido.
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

  -- RN-LOJA-002/003: fechada não esconde o cardápio, mas bloqueia o envio.
  if not coalesce(public.loja_aberta(), false) then
    return jsonb_build_object('ok', false, 'erro',
      'A loja fechou. Seu carrinho continua guardado.', 'loja_fechada', true);
  end if;

  v_modalidade := p_pedido ->> 'modalidade';
  if v_modalidade not in ('delivery', 'pickup') then
    return jsonb_build_object('ok', false, 'erro', 'Escolha entrega ou retirada.');
  end if;

  -- 4. CLIENTE -----------------------------------------------------------
  -- RN-CLI-002: nome e WhatsApp obrigatórios.
  v_nome := btrim(coalesce(p_pedido -> 'cliente' ->> 'nome', ''));
  v_whats := public.normalizar_whatsapp(p_pedido -> 'cliente' ->> 'whatsapp');

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
    -- RN-CLI-008: bloqueio impede novo pedido. A mensagem NÃO expõe o
    -- motivo interno — nem que exista bloqueio.
    if v_cliente.is_blocked then
      return jsonb_build_object('ok', false, 'erro',
        'Não conseguimos concluir este pedido. Fale com a pizzaria pelo WhatsApp.');
    end if;

    -- RN-CLI-005: atualiza o cadastro para frente. Os snapshots de pedidos
    -- antigos não são tocados.
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

  -- 5. DISPOSITIVO -------------------------------------------------------
  -- 03 §11: credencial do navegador, guardada como hash. Serve para
  -- "Meus pedidos" sem login, e NUNCA para liberar histórico por telefone.
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
  -- RN-VALID-001: revalidação completa antes de criar. Preço, promoção,
  -- disponibilidade, tamanho, meio a meio, borda, adicionais, combo e
  -- limites — tudo recalculado agora.
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
      -- RN-VALID-003: mudança de preço, para mais OU para menos, nunca é
      -- silenciosa.
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
    -- 03 §9.2: divergência comercial volta para confirmação, não vira
    -- pedido aceito em silêncio.
    return jsonb_build_object('ok', false, 'reconfirmar', true,
      'divergencias', v_divergencias,
      'erro', 'O cardápio mudou enquanto você finalizava. Confira antes de enviar.');
  end if;

  -- 7. ENTREGA OU RETIRADA ----------------------------------------------
  if v_modalidade = 'pickup' then
    -- RN-ENT-002: retirada não usa geocodificação, distância nem taxa.
    v_taxa := 0;
  else
    v_endereco := p_pedido -> 'endereco';
    if v_endereco is null or jsonb_typeof(v_endereco) <> 'object' then
      return jsonb_build_object('ok', false, 'erro', 'Informe o endereço de entrega.');
    end if;

    -- RN-ENT-003: sem coordenada confiável, não se inventa taxa.
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

    -- RN-ENT-006 e RN-ENT-015: a faixa vem da distância de ROTA.
    select f.id, f.fee into v_faixa_id, v_faixa_taxa
      from public.faixa_para_distancia(v_distancia) f;

    if v_faixa_id is null then
      -- RN-ENT-012 e CLAUDE.md §20: sem faixa, é fora de área. NUNCA taxa
      -- zero por ausência de configuração.
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

    -- RN-ENT-010/011: dentro do raio, fluxo normal; acima dele e dentro da
    -- área, o pedido segue com taxa e AGUARDA APROVAÇÃO da Shalon.
    v_exige_aprovacao := v_distancia > v_loja.automatic_delivery_radius_km;

    -- RN-LOJA-005: mínimo vale só para entrega e olha o SUBTOTAL, antes da
    -- taxa.
    if v_loja.delivery_minimum_enabled
       and v_subtotal < coalesce(v_loja.delivery_minimum_subtotal, 0) then
      return jsonb_build_object('ok', false,
        'erro', format('O pedido mínimo para entrega é R$ %s.',
                       to_char(v_loja.delivery_minimum_subtotal, 'FM999G999D00')),
        'pedido_minimo', true,
        'minimo', v_loja.delivery_minimum_subtotal, 'subtotal', v_subtotal);
    end if;

    -- Endereço salvo do cliente, para reuso futuro. A taxa NÃO é salva com
    -- ele: a cada pedido recalcula (RN-ENT-008).
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
  -- RN-PGTO-001: a lista vem do cadastro, nunca de enum no código.
  select * into v_forma from public.payment_methods m
    where m.id = nullif(p_pedido -> 'pagamento' ->> 'forma_id', '')::uuid
      and m.is_active
      and ((v_modalidade = 'delivery' and m.available_for_delivery)
           or (v_modalidade = 'pickup' and m.available_for_pickup));

  if v_forma.id is null then
    return jsonb_build_object('ok', false, 'erro',
      'Escolha uma forma de pagamento disponível.');
  end if;

  -- RN-PGTO-006: débito, crédito e voucher usam bandeira ATIVA cadastrada.
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

  -- RN-PGTO-008: Pix por chave só existe se estiver habilitado e completo.
  if v_forma.payment_family = 'pix_key'
     and not exists (select 1 from public.pix_key_settings p where p.is_enabled) then
    return jsonb_build_object('ok', false, 'erro',
      'O Pix antecipado não está disponível no momento.');
  end if;

  -- RN-PGTO-005: troco. O valor informado não pode ser menor que o total.
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
  -- RN-CHK-003: pedido enviado NÃO é pedido aceito.
  --
  -- Pix por chave define o STATUS porque nada vai à produção antes da
  -- confirmação do pagamento (RN-PGTO-010). A aprovação de entrega é
  -- dimensão SEPARADA (`delivery_approval_status`), então quando as duas
  -- condições ocorrem juntas nenhuma é perdida — e nenhuma precedência
  -- silenciosa foi inventada.
  if v_forma.payment_family = 'pix_key' then
    v_status := 'waiting_pix_confirmation';
    v_pix_status := 'pending';
  elsif v_exige_aprovacao then
    v_status := 'waiting_delivery_approval';
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
    delivery_address_snapshot, store_address_snapshot, idempotency_key
  ) values (
    v_cliente_id, v_dispositivo_id,
    public.hash_token(p_pedido ->> 'tracking_token'),
    coalesce(nullif(p_pedido ->> 'origem', ''), 'shalon_link'),
    v_modalidade, v_status, 'pending',
    v_nome, v_whats,
    coalesce((p_pedido -> 'cliente' ->> 'consentimento_marketing')::boolean, false),
    v_subtotal, v_taxa, v_total,
    nullif(btrim(coalesce(p_pedido ->> 'observacao_geral', '')), ''),
    -- RN-LOJA-004: o prazo que o cliente VIU acompanha o pedido.
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
    v_idem
  ) returning id, order_number into v_pedido_id, v_numero;

  -- Itens, agora com os snapshots completos.
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

  -- Intenção de pagamento: o que o cliente DECLAROU (RN-PGTO-002).
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

  insert into public.order_status_history (order_id, from_status, to_status, actor_type, reason)
  values (v_pedido_id, null, v_status, 'customer', 'Pedido enviado pelo cliente');

  return jsonb_build_object(
    'ok', true, 'ja_existia', false,
    'pedido_id', v_pedido_id, 'numero', v_numero, 'status', v_status,
    'subtotal', v_subtotal, 'taxa_entrega', v_taxa, 'total', v_total,
    'exige_aprovacao_entrega', v_exige_aprovacao,
    'distancia_km', v_distancia,
    'troco_esperado', v_troco);
end;
$$;

comment on function public.criar_pedido is 'Única porta de criação de pedido público. Recalcula tudo; nada vindo de fora é autoridade (03 §9.2).';

revoke all on function public.criar_pedido(jsonb, text) from public;
-- Fica chamável por anon porque o Server Action se apresenta como anon —
-- quem autoriza de verdade é o segredo de origem, conferido na primeira
-- linha da função.
grant execute on function public.criar_pedido(jsonb, text) to anon, authenticated;
