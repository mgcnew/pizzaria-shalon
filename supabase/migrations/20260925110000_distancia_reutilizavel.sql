-- =============================================================================
-- DISTÂNCIA REUTILIZÁVEL — Fase 11, cache (Fase B)
--
-- 02-MODELO-DADOS-SUPABASE.md §8.2 (ALTERADO por esta decisão)
-- 04-REGRAS-NEGOCIO.md RN-ENT-006/007/008 · CLAUDE.md §16, §20
-- Decisão: D-2026-09-25-77
--
-- O QUE MUDOU NA NORMA
--
-- O §8.2 dizia: "Taxa/distância não pertencem ao endereço salvo. Devem ser
-- recalculadas a cada novo pedido." A metade sobre TAXA continua valendo
-- integralmente. A metade sobre DISTÂNCIA foi alterada por decisão explícita.
--
-- A razão é que as duas coisas têm naturezas diferentes, e o §8.2 as tratava
-- como uma só:
--
-- - a TAXA é preço. Depende da tabela de faixas, que a Shalon muda quando
--   quiser, e precisa ser recalculada sempre — é o que RN-ENT-008 protege;
-- - a DISTÂNCIA é medida física entre dois pontos fixos. Não muda porque a
--   tabela de preços mudou.
--
-- Por isso nenhuma coluna de taxa aparece abaixo, e nenhuma vai aparecer.
-- `cotar_entrega` e `criar_pedido` continuam sendo as únicas autoridades do
-- preço, recalculando pelas faixas vigentes a cada cotação e a cada pedido.
-- Reutilizar distância NÃO congela preço: o mesmo endereço em cache passa a
-- custar diferente no minuto seguinte a uma alteração de faixa.
--
-- POR QUE A ORIGEM É GRAVADA JUNTO
--
-- Distância só é reutilizável se os DOIS pontos forem os mesmos. O endereço
-- é garantido pela `address_key`; a origem, por estas colunas. Guardar a
-- origem usada na medição é melhor que um trigger de invalidação: a
-- comparação é explícita, e não depende de alguém ter lembrado de limpar o
-- cache quando a loja mudar de endereço.
-- =============================================================================

alter table public.customer_addresses
  -- Sempre positiva. Zero é o valor que aparece quando algo se perdeu no
  -- caminho, e zero km viraria a faixa mais barata — exatamente o acidente
  -- que CLAUDE.md §20 proíbe. A constraint recusa antes de chegar lá.
  add column route_distance_km numeric(8, 3),
  add column route_provider    text,
  add column route_origin_lat  numeric(10, 7),
  add column route_origin_lng  numeric(10, 7),
  add column route_measured_at timestamptz;

comment on column public.customer_addresses.route_distance_km is
  'Distância RODOVIÁRIA medida da loja até aqui. Nunca taxa (D-2026-09-25-77).';
comment on column public.customer_addresses.route_origin_lat is
  'Origem USADA na medição. Se a loja mudar de lugar, a distância deixa de valer.';
comment on column public.customer_addresses.route_measured_at is
  'Quando a rota foi medida. TTL de 90 dias — malha viária muda devagar, mas muda.';

alter table public.customer_addresses
  add constraint customer_addresses_distancia_positiva
    check (route_distance_km is null or route_distance_km > 0);

-- TUDO OU NADA. Meia medição não é medição: distância sem a origem que a
-- produziu é um número sem sentido, e reutilizá-la seria cobrar por uma rota
-- que ninguém mediu. Registro incompleto não pode existir — é mais forte que
-- filtrar na consulta, porque nem chega a ser gravado.
alter table public.customer_addresses
  add constraint customer_addresses_rota_completa
    check (
      (route_distance_km is null and route_provider is null
        and route_origin_lat is null and route_origin_lng is null
        and route_measured_at is null)
      or
      (route_distance_km is not null and route_provider is not null
        and route_origin_lat is not null and route_origin_lng is not null
        and route_measured_at is not null)
    );

-- ---------------------------------------------------------------- gravação

-- POR QUE UMA FUNÇÃO SEPARADA, E NÃO `criar_pedido`
--
-- `criar_pedido` é a função autoritativa do pedido, e alterá-la neste gate foi
-- explicitamente excluído (decisão de 25/09/2026: não misturar). Esta função
-- só grava dado derivado de geografia; não cria pedido, não decide taxa e não
-- toca em nada que o pedido já gravou.
--
-- É chamada DEPOIS de `criar_pedido` ter sucesso, quando a linha de endereço
-- já existe. Consequência deliberada: só entrega realmente concluída semeia o
-- cache. Cotação abandonada não semeia.
--
-- A origem NÃO é parâmetro. Ela é lida de `store_settings` aqui dentro, para
-- que nem o servidor nem o navegador possam declarar uma origem que não é a
-- da loja — o que produziria uma distância "válida" medida de outro lugar.
create or replace function public.registrar_rota_medida(
  p_logradouro text,
  p_numero     text,
  p_bairro     text,
  p_cidade     text,
  p_uf         text,
  p_cep        text,
  p_distancia_km numeric,
  p_provedor   text,
  p_segredo    text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_chave  text;
  v_loja   record;
  v_linhas int;
begin
  if not public.origem_confiavel(p_segredo) then
    return jsonb_build_object('ok', false, 'erro', 'origem_nao_confiavel');
  end if;

  -- Distância inválida não é gravada, e não é erro do chamador: é só um
  -- registro que não vale a pena guardar.
  if p_distancia_km is null or p_distancia_km <= 0
     or p_provedor is null or btrim(p_provedor) = '' then
    return jsonb_build_object('ok', true, 'gravado', false, 'motivo', 'medicao_invalida');
  end if;

  select s.latitude, s.longitude into v_loja
    from public.store_settings s limit 1;

  if v_loja.latitude is null or v_loja.longitude is null then
    return jsonb_build_object('ok', true, 'gravado', false, 'motivo', 'loja_sem_coordenada');
  end if;

  v_chave := public.chave_de_endereco(
    p_logradouro, p_numero, p_bairro, p_cidade, p_uf, p_cep);

  if public.normalizar_parte_de_endereco(p_logradouro) = ''
     or public.normalizar_numero_de_endereco(p_numero) = ''
     or public.normalizar_parte_de_endereco(p_cidade) = ''
     or public.normalizar_parte_de_endereco(p_uf) = '' then
    return jsonb_build_object('ok', true, 'gravado', false, 'motivo', 'endereco_incompleto');
  end if;

  -- Grava em todo endereço ativo com a MESMA identidade geográfica: a
  -- distância entre dois pontos não depende de quem mora lá. São colunas
  -- derivadas de geografia, sem nada pessoal.
  --
  -- SEM FILTRO DE "JÁ ESTÁ IGUAL", e isso é deliberado. A primeira versão
  -- desta função só gravava quando algum campo diferisse, para poupar UPDATE.
  -- O efeito seria perverso: uma remedição que confirmasse a mesma distância
  -- não renovaria o carimbo, e o registro venceria de novo no dia seguinte,
  -- forçando nova chamada ao provedor para sempre.
  --
  -- A contrapartida é que o CHAMADOR precisa chamar só quando mediu de
  -- verdade. Distância vinda do cache não passa por aqui — se passasse, o
  -- carimbo se renovaria sozinho e o TTL de 90 dias nunca venceria.
  update public.customer_addresses a
     set route_distance_km = p_distancia_km,
         route_provider    = p_provedor,
         route_origin_lat  = v_loja.latitude,
         route_origin_lng  = v_loja.longitude,
         route_measured_at = now()
   where a.address_key = v_chave
     and a.is_active;

  get diagnostics v_linhas = row_count;
  return jsonb_build_object('ok', true, 'gravado', v_linhas > 0, 'linhas', v_linhas);
end;
$$;

comment on function public.registrar_rota_medida is
  'Guarda a distância medida para reuso. NUNCA taxa. Origem lida da loja, não do chamador.';

revoke all on function public.registrar_rota_medida(
  text, text, text, text, text, text, numeric, text, text) from public;
grant execute on function public.registrar_rota_medida(
  text, text, text, text, text, text, numeric, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- consulta

-- `endereco_conhecido` passa a devolver TAMBÉM a distância, quando ela for
-- reutilizável. As duas metades são independentes: coordenada pode valer com
-- a distância vencida, e é exatamente o que acontece quando a loja muda de
-- endereço — o cliente continua onde estava, a rota é que mudou.
create or replace function public.endereco_conhecido(
  p_logradouro text,
  p_numero     text,
  p_bairro     text,
  p_cidade     text,
  p_uf         text,
  p_cep        text,
  p_provedor   text,
  p_segredo    text
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c_validade_coord constant interval := interval '180 days';
  -- Mais curto que o da coordenada, de propósito: a casa não se move, mas a
  -- rota até ela muda com obra, mão única nova e condomínio fechado.
  c_validade_rota  constant interval := interval '90 days';
  v_chave text;
  v_reg   record;
  v_loja  record;
  v_saida jsonb;
begin
  if not public.origem_confiavel(p_segredo) then
    return jsonb_build_object('ok', false, 'erro', 'origem_nao_confiavel');
  end if;

  v_chave := public.chave_de_endereco(
    p_logradouro, p_numero, p_bairro, p_cidade, p_uf, p_cep);

  if public.normalizar_parte_de_endereco(p_logradouro) = ''
     or public.normalizar_numero_de_endereco(p_numero) = ''
     or public.normalizar_parte_de_endereco(p_cidade) = ''
     or public.normalizar_parte_de_endereco(p_uf) = '' then
    return jsonb_build_object('ok', true, 'encontrado', false, 'motivo', 'endereco_incompleto');
  end if;

  select a.latitude, a.longitude, a.geocode_confidence, a.geocode_provider,
         a.was_map_adjusted, a.geocoded_at,
         a.route_distance_km, a.route_provider, a.route_measured_at,
         a.route_origin_lat, a.route_origin_lng
    into v_reg
    from public.customer_addresses a
   where a.address_key = v_chave
     and a.is_active
     and a.latitude is not null
     and a.longitude is not null
     and a.geocode_confidence in ('exata', 'aproximada', 'ajustada_no_mapa')
     and (
       a.was_map_adjusted
       or (
         a.geocode_provider = p_provedor
         and a.geocoded_at is not null
         and a.geocoded_at > now() - c_validade_coord
       )
     )
   -- Entre candidatos igualmente válidos, prefere o que também tem rota
   -- utilizável: dois acertos poupam duas chamadas em vez de uma.
   order by a.was_map_adjusted desc,
            (a.route_measured_at is not null) desc,
            a.geocoded_at desc nulls last
   limit 1;

  if v_reg.latitude is null then
    return jsonb_build_object('ok', true, 'encontrado', false);
  end if;

  v_saida := jsonb_build_object(
    'ok', true,
    'encontrado', true,
    'latitude', v_reg.latitude,
    'longitude', v_reg.longitude,
    'confianca', v_reg.geocode_confidence,
    'provedor', v_reg.geocode_provider,
    'ajustado_no_mapa', v_reg.was_map_adjusted,
    'dias', greatest(0, (extract(epoch from (now() - v_reg.geocoded_at)) / 86400)::int),
    'rota', false
  );

  -- ---- a distância, se e somente se todas as condições valerem
  select s.latitude, s.longitude into v_loja
    from public.store_settings s limit 1;

  if v_reg.route_distance_km is not null
     and v_reg.route_distance_km > 0
     and v_reg.route_measured_at is not null
     and v_reg.route_measured_at > now() - c_validade_rota
     and v_reg.route_provider = p_provedor
     and v_loja.latitude is not null
     and v_loja.longitude is not null
     -- A MESMA origem. Loja em outro lugar é outra rota, ainda que o cliente
     -- não tenha se mexido.
     and v_reg.route_origin_lat = v_loja.latitude
     and v_reg.route_origin_lng = v_loja.longitude
  then
    v_saida := v_saida || jsonb_build_object(
      'rota', true,
      'distancia_km', v_reg.route_distance_km,
      'rota_provedor', v_reg.route_provider,
      'rota_dias', greatest(0,
        (extract(epoch from (now() - v_reg.route_measured_at)) / 86400)::int)
    );
  end if;

  return v_saida;
end;
$$;

comment on function public.endereco_conhecido is
  'Coordenada e, quando reutilizável, distância já medida. NUNCA taxa. Exige prova de origem.';
