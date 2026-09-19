-- 0044 — Projeções públicas do checkout
-- 03-RLS-RBAC-SEGURANCA.md §9.3 e §10 · 04 RN-PGTO, RN-ENT · CLAUDE.md §20, §23
--
-- Três portas estreitas, cada uma com a menor autorização que resolve:
--   · formas de pagamento  → anon, colunas escolhidas a dedo;
--   · origem e cotação     → só o servidor, com a prova de origem da 0040;
--   · chave Pix            → só quem tem o token de UM pedido esperando Pix.

-- ------------------------------------------------------- formas de pagamento
-- RN-PGTO-001: a lista vem do cadastro. Nada de enum no código.
-- `code` e `sort_order` interno não saem; bandeiras vêm aninhadas para não
-- obrigar a tela a uma segunda consulta por forma (N+1).
create or replace function public.formas_pagamento_publicas(p_modalidade text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(f order by f.ordem), '[]'::jsonb)
  from (
    select
      m.id,
      m.name as nome,
      m.payment_family as familia,
      m.requires_brand as exige_bandeira,
      -- RN-PGTO-005: troco só existe em dinheiro.
      (m.payment_family = 'cash') as permite_troco,
      m.sort_order as ordem,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', b.id, 'nome', b.name)
                         order by b.sort_order, b.name)
        from public.payment_brands b
        where b.payment_method_id = m.id and b.is_active
      ), '[]'::jsonb) as bandeiras
    from public.payment_methods m
    where m.is_active
      and ((p_modalidade = 'delivery' and m.available_for_delivery)
           or (p_modalidade = 'pickup' and m.available_for_pickup))
      -- RN-PGTO-008: Pix por chave só aparece quando está realmente
      -- configurado. Oferecer e depois falhar seria pior que não oferecer.
      and (m.payment_family <> 'pix_key'
           or exists (select 1 from public.pix_key_settings p where p.is_enabled))
  ) f;
$$;

comment on function public.formas_pagamento_publicas is 'RN-PGTO-001: formas ativas da modalidade, com bandeiras. Colunas escolhidas a dedo.';

revoke all on function public.formas_pagamento_publicas(text) from public;
grant execute on function public.formas_pagamento_publicas(text) to anon, authenticated;

-- ------------------------------------------------------------------- origem
-- RN-ENT-007: a origem da rota é o endereço CONFIGURADO da loja. Nunca
-- hardcoded, nunca vinda do navegador.
--
-- Exige a prova de origem porque coordenada da loja não é dado de cardápio:
-- quem chama isto é o nosso servidor, logo antes de pedir a rota.
-- Devolve `ok: false` quando a loja ainda não foi geocodificada — e aí o
-- checkout diz que não consegue calcular, em vez de inventar um ponto.
create or replace function public.origem_da_loja(p_segredo text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case
    when not public.origem_confiavel(p_segredo)
      then jsonb_build_object('ok', false, 'erro', 'origem_nao_confiavel')
    else coalesce((
      select case
        when s.latitude is null or s.longitude is null
          then jsonb_build_object('ok', false, 'erro', 'loja_sem_coordenada')
        else jsonb_build_object('ok', true,
               'latitude', s.latitude, 'longitude', s.longitude,
               'raio_automatico_km', s.automatic_delivery_radius_km)
      end
      from public.store_settings s limit 1
    ), jsonb_build_object('ok', false, 'erro', 'loja_nao_configurada'))
  end;
$$;

comment on function public.origem_da_loja is 'RN-ENT-007: origem da rota vem da configuração. Exige prova de origem do servidor.';

revoke all on function public.origem_da_loja(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ cotação
-- Mostra a taxa ANTES de enviar, usando exatamente a mesma faixa que
-- `criar_pedido` vai usar depois. Uma fórmula só (CLAUDE.md §16/§17).
--
-- É cotação, não autoridade: o pedido recalcula tudo de novo.
create or replace function public.cotar_entrega(p_km numeric, p_segredo text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_loja record;
  v_faixa_id uuid;
  v_faixa_taxa numeric;
  v_max numeric;
begin
  if not public.origem_confiavel(p_segredo) then
    return jsonb_build_object('ok', false, 'erro', 'origem_nao_confiavel');
  end if;

  select * into v_loja from public.store_settings limit 1;
  if v_loja.id is null then
    return jsonb_build_object('ok', false, 'erro', 'loja_nao_configurada');
  end if;

  select f.id, f.fee into v_faixa_id, v_faixa_taxa
    from public.faixa_para_distancia(p_km) f;

  if v_faixa_id is null then
    -- CLAUDE.md §20: falta de faixa é fora de área, jamais taxa zero.
    select max(b.max_distance_km) into v_max
      from public.delivery_fee_bands b where b.is_active;
    return jsonb_build_object('ok', false, 'fora_de_area', true,
      'distancia_km', p_km, 'distancia_maxima_km', v_max,
      'entrega_configurada', v_max is not null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'distancia_km', p_km,
    'taxa', v_faixa_taxa,
    -- RN-ENT-010/011: acima do raio o pedido segue, mas aguardando aprovação.
    'exige_aprovacao', p_km > v_loja.automatic_delivery_radius_km,
    'pedido_minimo_ativo', v_loja.delivery_minimum_enabled,
    'pedido_minimo_valor', v_loja.delivery_minimum_subtotal
  );
end;
$$;

comment on function public.cotar_entrega is 'Cota a taxa pela MESMA faixa que criar_pedido usará. Cotação não é autoridade.';

revoke all on function public.cotar_entrega(numeric, text) from public, anon, authenticated;

-- ----------------------------------------------------------------- chave Pix
-- RN-PGTO-009: a chave aparece para quem tem o pedido, enquanto ele espera
-- o Pix. Não é um endpoint "qual é a chave da pizzaria".
create or replace function public.pix_para_pagamento(p_token text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'ok', true,
      'tipo', px.key_type,
      'chave', px.pix_key,
      'titular', px.recipient_name,
      'instrucoes', px.instructions,
      'valor', o.total)
    from public.orders o
    join public.order_payment_intents pi on pi.order_id = o.id
    cross join lateral (select * from public.pix_key_settings limit 1) px
    where p_token is not null
      and length(p_token) >= 32
      and o.tracking_token_hash = public.hash_token(p_token)
      and pi.payment_method_family_snapshot = 'pix_key'
      and pi.pix_confirmation_status = 'pending'
      and px.is_enabled
  ), jsonb_build_object('ok', false));
$$;

comment on function public.pix_para_pagamento is 'RN-PGTO-009: chave Pix só para quem tem o token de um pedido aguardando Pix.';

revoke all on function public.pix_para_pagamento(text) from public;
grant execute on function public.pix_para_pagamento(text) to anon, authenticated;
