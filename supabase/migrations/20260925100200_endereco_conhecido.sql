-- =============================================================================
-- CONSULTA DE ENDEREÇO JÁ VALIDADO — Fase 11, cache (Fase A)
--
-- 03-RLS-RBAC-SEGURANCA.md §9, §11 · 04-REGRAS-NEGOCIO.md RN-ENT-003/004/008
-- CLAUDE.md §13, §16, §20
--
-- A PERGUNTA QUE ESTA FUNÇÃO RESPONDE: este endereço já foi geocodificado com
-- confiança suficiente, e a coordenada ainda vale?
--
-- O QUE ELA NÃO FAZ, E É DE PROPÓSITO
--
-- Não devolve distância, não devolve taxa, não consulta faixa e não cria nada.
-- Devolve uma coordenada ou nada. A distância continua vindo de uma chamada
-- real ao provedor, e a taxa continua saindo de `cotar_entrega` e do
-- recálculo em `criar_pedido` — nenhuma das duas foi tocada.
--
-- A Fase B (reuso de distância) está aprovada conceitualmente e NÃO está aqui.
--
-- POR QUE A BUSCA É POR CONTEÚDO, E NUNCA PELO `id` DO NAVEGADOR
--
-- O navegador envia `endereco.id` hoje, e `criar_pedido` o grava no snapshot.
-- Isso é inofensivo enquanto ninguém LÊ coordenada por esse id. Se esta
-- função aceitasse o id, um id forjado traria a coordenada do endereço de
-- outro cliente: distância errada, taxa errada, dinheiro errado. A assinatura
-- abaixo não tem `id` justamente para que esse caminho não exista.
--
-- POR QUE `grant execute to anon`
--
-- Mesmo motivo já documentado na 0045: o Server Action fala com o Supabase
-- usando a chave publicável, logo é `anon` no Postgres. Quem barra é o
-- SEGREDO DE ORIGEM, verificado na primeira linha do corpo. Sem segredo, a
-- resposta é `origem_nao_confiavel` e nenhuma coordenada é revelada.
--
-- Trocar por `service_role` para "resolver" seria o atalho proibido em §13.
-- =============================================================================

create or replace function public.endereco_conhecido(
  p_logradouro text,
  p_numero     text,
  p_bairro     text,
  p_cidade     text,
  p_uf         text,
  p_cep        text,
  -- Provedor em uso AGORA. Coordenada gravada por outro provedor não é
  -- reaproveitada: `D-2026-09-24-75` provou que a troca acontece, e a
  -- semântica de confiança de um provedor não é a do outro.
  p_provedor   text,
  p_segredo    text
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  -- Validade da coordenada. Endereço não muda de lugar, mas numeração é
  -- recadastrada, loteamento é regularizado e provedor melhora a base. Meio
  -- ano é curto o bastante para corrigir e longo o bastante para servir.
  c_validade constant interval := interval '180 days';
  v_chave text;
  v_reg   record;
begin
  if not public.origem_confiavel(p_segredo) then
    return jsonb_build_object('ok', false, 'erro', 'origem_nao_confiavel');
  end if;

  v_chave := public.chave_de_endereco(
    p_logradouro, p_numero, p_bairro, p_cidade, p_uf, p_cep);

  -- Endereço incompleto nunca é acerto. Sem logradouro, número ou cidade não
  -- existe identidade geográfica, e uma chave quase vazia casaria com
  -- qualquer outra igualmente vazia — o pior acerto falso possível.
  if public.normalizar_parte_de_endereco(p_logradouro) = ''
     or public.normalizar_numero_de_endereco(p_numero) = ''
     or public.normalizar_parte_de_endereco(p_cidade) = ''
     or public.normalizar_parte_de_endereco(p_uf) = '' then
    return jsonb_build_object('ok', true, 'encontrado', false, 'motivo', 'endereco_incompleto');
  end if;

  select a.latitude, a.longitude, a.geocode_confidence, a.geocode_provider,
         a.was_map_adjusted, a.geocoded_at
    into v_reg
    from public.customer_addresses a
   where a.address_key = v_chave
     and a.is_active
     -- A constraint `coordenadas_em_par` garante que as duas venham juntas;
     -- testar as duas é redundância deliberada, não desconfiança da constraint.
     and a.latitude is not null
     and a.longitude is not null
     -- RN-ENT-003: `ambigua` NUNCA é acerto de cache. Não havia confiança
     -- suficiente para cobrar por distância quando o endereço foi salvo, e o
     -- tempo não transformou isso em confiança.
     and a.geocode_confidence in ('exata', 'aproximada', 'ajustada_no_mapa')
     and (
       -- PRECEDÊNCIA DO AJUSTE MANUAL (RN-ENT-005): coordenada corrigida à
       -- mão por uma pessoa é autoridade superior à do provedor. Não expira
       -- por calendário e não é descartada por troca de provedor — foi um
       -- humano que olhou o mapa, e isso não envelhece como palpite de API.
       a.was_map_adjusted
       or (
         a.geocode_provider = p_provedor
         -- `geocoded_at`, NÃO `updated_at`: este último é reescrito pelo
         -- trigger a cada UPDATE, e usá-lo renovaria a validade de uma
         -- coordenada velha por causa de uma alteração alheia. Foi um teste
         -- da suíte que expôs isso.
         and a.geocoded_at is not null
         and a.geocoded_at > now() - c_validade
       )
     )
   -- Ajuste manual primeiro; entre os demais, o mais recente.
   order by a.was_map_adjusted desc, a.geocoded_at desc nulls last
   limit 1;

  if v_reg.latitude is null then
    return jsonb_build_object('ok', true, 'encontrado', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'encontrado', true,
    'latitude', v_reg.latitude,
    'longitude', v_reg.longitude,
    'confianca', v_reg.geocode_confidence,
    'provedor', v_reg.geocode_provider,
    'ajustado_no_mapa', v_reg.was_map_adjusted,
    -- Idade em DIAS, não timestamp: serve para diagnóstico e para o log, e
    -- não ajuda a reidentificar quando alguém pediu (03 §31).
    'dias', greatest(0, (extract(epoch from (now() - v_reg.geocoded_at)) / 86400)::int)
  );
end;
$$;

comment on function public.endereco_conhecido is
  'Coordenada já validada para este endereço, ou nada. Não devolve distância nem taxa. Exige prova de origem.';

-- Mesma postura da 0045: exposta por necessidade da chave publicável, barrada
-- pelo segredo de origem no corpo.
revoke all on function public.endereco_conhecido(text, text, text, text, text, text, text, text)
  from public;
grant execute on function public.endereco_conhecido(text, text, text, text, text, text, text, text)
  to anon, authenticated;
