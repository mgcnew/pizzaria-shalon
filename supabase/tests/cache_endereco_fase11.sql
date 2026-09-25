-- =============================================================================
-- TESTES DO CACHE DE COORDENADA — FASE 11, FASE A
--
-- 02-MODELO-DADOS-SUPABASE.md §8.2 · 03-RLS-RBAC-SEGURANCA.md §9, §11
-- 04-REGRAS-NEGOCIO.md RN-ENT-003/004/005/008 · CLAUDE.md §13, §16, §20
-- Decisão: D-2026-09-25 (Fase A aprovada; Fase B NÃO implementada)
--
-- AS DUAS PERGUNTAS QUE ESTE ARQUIVO RESPONDE:
--
-- 1. A normalização pode unir dois endereços DIFERENTES? Esse é o único erro
--    inaceitável: uniria a coordenada de uma casa à de outra, e o cliente
--    pagaria a taxa errada. O erro oposto — separar o que é igual — produz
--    apenas um MISS, que é o comportamento de hoje.
--
-- 2. O cache consegue, de alguma forma, produzir frete zero, entrega fora de
--    área ou coordenada em que não se devia confiar?
--
-- Tudo que simula o navegador roda como `anon`, que é o papel real dele.
--
-- Transação com ROLLBACK: nada é persistido.
-- =============================================================================

begin;

create temporary table resultado_teste (
  n serial, cenario text, esperado text, obtido text, passou boolean
) on commit drop;

grant all on resultado_teste to anon, authenticated;
grant all on sequence resultado_teste_n_seq to anon, authenticated;

create or replace function pg_temp.checar(p_cenario text, p_esperado text, p_obtido text)
returns void language plpgsql as $$
begin
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido);
end;
$$;

-- Atalho: as duas chaves são iguais?
create or replace function pg_temp.mesma_chave(
  a_log text, a_num text, a_bai text, a_cid text, a_uf text, a_cep text,
  b_log text, b_num text, b_bai text, b_cid text, b_uf text, b_cep text
) returns text language sql as $$
  select (public.chave_de_endereco(a_log, a_num, a_bai, a_cid, a_uf, a_cep)
        = public.chave_de_endereco(b_log, b_num, b_bai, b_cid, b_uf, b_cep))::text;
$$;

-- =============================================================================
-- PARTE 1 — NORMALIZAÇÃO: O QUE É O MESMO ENDEREÇO
-- =============================================================================

select pg_temp.checar('abreviacao: R. das Flores = Rua das Flores', 'true',
  pg_temp.mesma_chave('R. das Flores','100','Centro','Cidade','SP','01000-000',
                      'Rua das Flores','100','Centro','Cidade','SP','01000-000'));

select pg_temp.checar('abreviacao: Av. = Avenida', 'true',
  pg_temp.mesma_chave('Av. Brasil','50','Centro','Cidade','SP','01000-000',
                      'Avenida Brasil','50','Centro','Cidade','SP','01000-000'));

select pg_temp.checar('abreviacao: Jd. = Jardim no bairro', 'true',
  pg_temp.mesma_chave('Rua X','1','Jd. das Acacias','Cidade','SP','01000-000',
                      'Rua X','1','Jardim das Acacias','Cidade','SP','01000-000'));

select pg_temp.checar('acento: Sao Paulo = São Paulo', 'true',
  pg_temp.mesma_chave('Rua X','1','Centro','Sao Paulo','SP','01000-000',
                      'Rua X','1','Centro','São Paulo','SP','01000-000'));

select pg_temp.checar('acento no logradouro: Praca da Se = Praça da Sé', 'true',
  pg_temp.mesma_chave('Praca da Se','1','Se','Cidade','SP','01000-000',
                      'Praça da Sé','1','Sé','Cidade','SP','01000-000'));

select pg_temp.checar('caixa: RUA DAS FLORES = rua das flores', 'true',
  pg_temp.mesma_chave('RUA DAS FLORES','100','CENTRO','CIDADE','SP','01000-000',
                      'rua das flores','100','centro','cidade','sp','01000-000'));

select pg_temp.checar('espaco duplo e sobra nas bordas nao mudam a chave', 'true',
  pg_temp.mesma_chave('  Rua   das  Flores ','100','Centro','Cidade','SP','01000-000',
                      'Rua das Flores','100','Centro','Cidade','SP','01000-000'));

select pg_temp.checar('CEP com e sem mascara e o mesmo endereco', 'true',
  pg_temp.mesma_chave('Rua X','1','Centro','Cidade','SP','01000-000',
                      'Rua X','1','Centro','Cidade','SP','01000000'));

select pg_temp.checar('hifen e virgula no logradouro nao mudam a chave', 'true',
  pg_temp.mesma_chave('Rua Dom Pedro-II','1','Centro','Cidade','SP','01000-000',
                      'Rua Dom Pedro II','1','Centro','Cidade','SP','01000-000'));

-- RN-ENT-004 — o motivo de a função não receber complemento nem referência.
-- A prova de que trocar o complemento não muda a chave está na PARTE 3, pela
-- coluna gerada; aqui se prova que os campos nem existem na assinatura.
select pg_temp.checar('RN-ENT-004: complemento nao e argumento da funcao', 'true',
  (select count(*) = 0 from information_schema.parameters p
    where p.specific_schema = 'public'
      and p.specific_name like 'chave_de_endereco%'
      and p.parameter_name in ('p_complemento','p_referencia'))::text);

-- =============================================================================
-- PARTE 2 — NORMALIZAÇÃO: O QUE NUNCA PODE SER UNIDO
-- =============================================================================

select pg_temp.checar('numero diferente = chave diferente', 'false',
  pg_temp.mesma_chave('Rua X','100','Centro','Cidade','SP','01000-000',
                      'Rua X','102','Centro','Cidade','SP','01000-000'));

select pg_temp.checar('123 e 123A sao casas diferentes', 'false',
  pg_temp.mesma_chave('Rua X','123','Centro','Cidade','SP','01000-000',
                      'Rua X','123A','Centro','Cidade','SP','01000-000'));

select pg_temp.checar('s/n nao e o numero 0', 'false',
  pg_temp.mesma_chave('Rua X','s/n','Centro','Cidade','SP','01000-000',
                      'Rua X','0','Centro','Cidade','SP','01000-000'));

select pg_temp.checar('logradouro diferente = chave diferente', 'false',
  pg_temp.mesma_chave('Rua das Flores','100','Centro','Cidade','SP','01000-000',
                      'Rua das Pedras','100','Centro','Cidade','SP','01000-000'));

select pg_temp.checar('bairro diferente = chave diferente', 'false',
  pg_temp.mesma_chave('Rua X','1','Centro','Cidade','SP','01000-000',
                      'Rua X','1','Jardim Sul','Cidade','SP','01000-000'));

select pg_temp.checar('cidade diferente = chave diferente', 'false',
  pg_temp.mesma_chave('Rua X','1','Centro','Cidade A','SP','01000-000',
                      'Rua X','1','Centro','Cidade B','SP','01000-000'));

select pg_temp.checar('UF diferente = chave diferente', 'false',
  pg_temp.mesma_chave('Rua X','1','Centro','Cidade','SP','01000-000',
                      'Rua X','1','Centro','Cidade','RJ','01000-000'));

select pg_temp.checar('CEP diferente = chave diferente', 'false',
  pg_temp.mesma_chave('Rua X','1','Centro','Cidade','SP','01000-000',
                      'Rua X','1','Centro','Cidade','SP','02000-000'));

-- O separador '|' não pode ser forjado a partir do conteúdo.
select pg_temp.checar('campo nao consegue se disfarcar de outro', 'false',
  pg_temp.mesma_chave('Rua X|1','','Centro','Cidade','SP','01000-000',
                      'Rua X','1','Centro','Cidade','SP','01000-000'));

-- CEP incompleto é tratado como ausente, o que gera outra chave — e MISS,
-- que é seguro.
select pg_temp.checar('CEP incompleto nao vale como CEP', 'false',
  pg_temp.mesma_chave('Rua X','1','Centro','Cidade','SP','01000-000',
                      'Rua X','1','Centro','Cidade','SP','0100'));

select pg_temp.checar('CEP incompleto e CEP ausente dao a mesma chave', 'true',
  pg_temp.mesma_chave('Rua X','1','Centro','Cidade','SP','0100',
                      'Rua X','1','Centro','Cidade','SP',null));

-- =============================================================================
-- PARTE 3 — COLUNA GERADA
-- =============================================================================

insert into public.customers (id, name, whatsapp_display, whatsapp_normalized)
values ('aaaaaaa1-0000-0000-0000-000000000001','Cliente Cache','(11) 90000-0001','5511900000001');

insert into public.customer_addresses (
  id, customer_id, street, number, neighborhood, city, state, postal_code,
  complement, reference_point, latitude, longitude,
  geocode_provider, geocode_confidence, was_map_adjusted, is_active)
values (
  'bbbbbbb1-0000-0000-0000-000000000001','aaaaaaa1-0000-0000-0000-000000000001',
  'R. das Flores','100','Centro','São Paulo','SP','01000-000',
  'Ap 42','perto da padaria', -23.5000000, -46.6000000,
  'here','exata', false, true);

select pg_temp.checar('coluna gerada calcula a chave sozinha', 'true',
  (select a.address_key = public.chave_de_endereco(
            'Rua das Flores','100','Centro','Sao Paulo','SP','01000000')
     from public.customer_addresses a
    where a.id = 'bbbbbbb1-0000-0000-0000-000000000001')::text);

select pg_temp.checar('coluna gerada nao pode ser escrita a mao', 'true',
  (select exists (
     select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name='customer_addresses'
        and c.column_name='address_key' and c.is_generated='ALWAYS'))::text);

-- Mudar o endereço recalcula a chave: não existe registro com chave obsoleta.
-- O carimbo nasce junto com a coordenada.
select pg_temp.checar('insert carimba geocoded_at', 'true',
  (select geocoded_at is not null from public.customer_addresses
    where id = 'bbbbbbb1-0000-0000-0000-000000000001')::text);

update public.customer_addresses set number = '200'
  where id = 'bbbbbbb1-0000-0000-0000-000000000001';

select pg_temp.checar('alterar o endereco recalcula a chave', 'true',
  (select a.address_key = public.chave_de_endereco(
            'Rua das Flores','200','Centro','Sao Paulo','SP','01000000')
     from public.customer_addresses a
    where a.id = 'bbbbbbb1-0000-0000-0000-000000000001')::text);

update public.customer_addresses set number = '100'
  where id = 'bbbbbbb1-0000-0000-0000-000000000001';

-- Complemento e referência NÃO mexem na identidade geográfica.
update public.customer_addresses set complement = 'Ap 71', reference_point = 'ao lado do posto'
  where id = 'bbbbbbb1-0000-0000-0000-000000000001';

select pg_temp.checar('RN-ENT-004: trocar complemento nao muda a chave', 'true',
  (select a.address_key = public.chave_de_endereco(
            'Rua das Flores','100','Centro','Sao Paulo','SP','01000000')
     from public.customer_addresses a
    where a.id = 'bbbbbbb1-0000-0000-0000-000000000001')::text);

-- =============================================================================
-- PARTE 4 — A CONSULTA `endereco_conhecido`
-- =============================================================================

-- O segredo real, capturado ANTES de trocar de papel: é assim que o servidor
-- Node chega, já com o segredo na mão.
select set_config('teste.segredo',
  (select valor from public.server_secrets where chave = 'checkout_origem'), true);

create or replace function pg_temp.consultar(
  p_log text default 'Rua das Flores', p_num text default '100',
  p_bai text default 'Centro', p_cid text default 'Sao Paulo',
  p_uf text default 'SP', p_cep text default '01000-000',
  p_prov text default 'here', p_seg text default null
) returns jsonb language sql as $$
  select public.endereco_conhecido(p_log, p_num, p_bai, p_cid, p_uf, p_cep,
           p_prov, coalesce(p_seg, current_setting('teste.segredo', true)));
$$;

set local role anon;

-- --------------------------------------------------------------- acerto
select pg_temp.checar('endereco conhecido e encontrado', 'true',
  (pg_temp.consultar() ->> 'encontrado'));

select pg_temp.checar('devolve a latitude gravada', '-23.5000000',
  (pg_temp.consultar() ->> 'latitude'));

select pg_temp.checar('devolve a confianca original', 'exata',
  (pg_temp.consultar() ->> 'confianca'));

select pg_temp.checar('acerto mesmo escrevendo abreviado e sem acento', 'true',
  (pg_temp.consultar('R. das Flores','100','Centro','São Paulo','SP','01000000')
     ->> 'encontrado'));

-- O que o cache NUNCA devolve.
-- Este registro nunca teve rota medida: não há distância a devolver. Depois
-- da Fase B, ausência de distância significa "ninguém mediu ainda", e não
-- "distância nunca é devolvida".
select pg_temp.checar('sem rota medida: nenhuma distancia e devolvida', 'true',
  ((pg_temp.consultar() -> 'distancia_km') is null)::text);

select pg_temp.checar('NAO devolve taxa', 'true',
  ((pg_temp.consultar() -> 'taxa') is null)::text);

select pg_temp.checar('NAO devolve dados do cliente', 'true',
  ((pg_temp.consultar() -> 'customer_id') is null
   and (pg_temp.consultar() -> 'whatsapp') is null)::text);

select pg_temp.checar('NAO devolve complemento nem referencia', 'true',
  ((pg_temp.consultar() -> 'complemento') is null
   and (pg_temp.consultar() -> 'referencia') is null)::text);

-- ------------------------------------------------------------- segurança
select pg_temp.checar('sem segredo: origem_nao_confiavel', 'origem_nao_confiavel',
  (pg_temp.consultar(p_seg => 'segredo-errado') ->> 'erro'));

select pg_temp.checar('sem segredo NAO devolve coordenada', 'true',
  ((pg_temp.consultar(p_seg => 'segredo-errado') -> 'latitude') is null)::text);

select pg_temp.checar('segredo nulo tambem e recusado', 'origem_nao_confiavel',
  (public.endereco_conhecido('Rua das Flores','100','Centro','Sao Paulo','SP',
     '01000-000','here', null) ->> 'erro'));

select pg_temp.checar('anon NAO le customer_addresses diretamente', '0',
  (select count(*) from public.customer_addresses)::text);

-- ----------------------------------------------------- endereço incompleto
select pg_temp.checar('sem logradouro nunca e acerto', 'endereco_incompleto',
  (pg_temp.consultar('', '100') ->> 'motivo'));

select pg_temp.checar('sem numero nunca e acerto', 'endereco_incompleto',
  (pg_temp.consultar('Rua das Flores','') ->> 'motivo'));

select pg_temp.checar('sem cidade nunca e acerto', 'endereco_incompleto',
  (pg_temp.consultar(p_cid => '') ->> 'motivo'));

select pg_temp.checar('endereco todo vazio nunca e acerto', 'endereco_incompleto',
  (pg_temp.consultar('','','','','','') ->> 'motivo'));

-- ------------------------------------------------------- provedor e prazo
select pg_temp.checar('provedor diferente NAO reusa coordenada', 'false',
  (pg_temp.consultar(p_prov => 'mapbox') ->> 'encontrado'));

reset role;
update public.customer_addresses set geocoded_at = now() - interval '200 days'
  where id = 'bbbbbbb1-0000-0000-0000-000000000001';
set local role anon;

select pg_temp.checar('coordenada vencida NAO e acerto', 'false',
  (pg_temp.consultar() ->> 'encontrado'));

-- O cenário acima falhou na primeira execução da suíte, contra `updated_at`:
-- o trigger `customer_addresses_updated_at` reescrevia o campo e o registro
-- nascia novo de novo. Daí `geocoded_at` e o par de cenários abaixo.
reset role;
update public.customer_addresses set label = 'Casa', is_preferred = true
  where id = 'bbbbbbb1-0000-0000-0000-000000000001';
set local role anon;

select pg_temp.checar('update alheio NAO renova a validade do cache', 'false',
  (pg_temp.consultar() ->> 'encontrado'));

reset role;
update public.customer_addresses set latitude = -23.6, longitude = -46.7
  where id = 'bbbbbbb1-0000-0000-0000-000000000001';
set local role anon;

select pg_temp.checar('coordenada nova reinicia a validade', 'true',
  (pg_temp.consultar() ->> 'encontrado'));

select pg_temp.checar('idade de coordenada nova e zero dias', '0',
  (pg_temp.consultar() ->> 'dias'));

-- --------------------------------------- precedência do ajuste manual
--
-- ATENÇÃO À ORDEM, e ela custou uma correção: o trigger renova `geocoded_at`
-- sempre que a coordenada, o provedor ou a confiança mudam. Envelhecer o
-- registro NA MESMA instrução que marca o ajuste manual não funciona — o
-- trigger sobrescreve o carimbo, o cenário passa com coordenada fresca e não
-- prova nada sobre vencimento.
--
-- Por isso são duas instruções: primeiro marca o ajuste, depois envelhece
-- sozinho. Alteração isolada de `geocoded_at` é respeitada pelo trigger.
reset role;
update public.customer_addresses
   set latitude = -23.5, longitude = -46.6,
       was_map_adjusted = true, geocode_confidence = 'ajustada_no_mapa'
 where id = 'bbbbbbb1-0000-0000-0000-000000000001';

update public.customer_addresses set geocoded_at = now() - interval '200 days'
 where id = 'bbbbbbb1-0000-0000-0000-000000000001';

select pg_temp.checar('envelhecer o carimbo sozinho e respeitado', 'true',
  (select geocoded_at < now() - interval '199 days'
     from public.customer_addresses
    where id = 'bbbbbbb1-0000-0000-0000-000000000001')::text);

set local role anon;

select pg_temp.checar('RN-ENT-005: ajuste manual nao expira por calendario', 'true',
  (pg_temp.consultar() ->> 'encontrado'));

select pg_temp.checar('RN-ENT-005: ajuste manual sobrevive a troca de provedor', 'true',
  (pg_temp.consultar(p_prov => 'mapbox') ->> 'encontrado'));

select pg_temp.checar('ajuste manual e sinalizado ao chamador', 'true',
  (pg_temp.consultar() ->> 'ajustado_no_mapa'));

-- --------------------------------------------- confiança insuficiente
reset role;
update public.customer_addresses
   set was_map_adjusted = false, geocode_confidence = 'ambigua',
       updated_at = now()
 where id = 'bbbbbbb1-0000-0000-0000-000000000001';
set local role anon;

select pg_temp.checar('RN-ENT-003: ambigua NUNCA e acerto de cache', 'false',
  (pg_temp.consultar() ->> 'encontrado'));

reset role;
update public.customer_addresses
   set was_map_adjusted = true
 where id = 'bbbbbbb1-0000-0000-0000-000000000001';
set local role anon;

select pg_temp.checar('ambigua com ajuste manual tambem NAO e acerto', 'false',
  (pg_temp.consultar() ->> 'encontrado'));

-- ------------------------------------------------ coordenada e inatividade
reset role;
update public.customer_addresses
   set was_map_adjusted = false, geocode_confidence = 'exata',
       latitude = null, longitude = null
 where id = 'bbbbbbb1-0000-0000-0000-000000000001';
set local role anon;

select pg_temp.checar('sem coordenada NAO e acerto', 'false',
  (pg_temp.consultar() ->> 'encontrado'));

reset role;
update public.customer_addresses
   set latitude = -23.5, longitude = -46.6, is_active = false
 where id = 'bbbbbbb1-0000-0000-0000-000000000001';
set local role anon;

select pg_temp.checar('endereco inativo NAO e acerto', 'false',
  (pg_temp.consultar() ->> 'encontrado'));

reset role;

-- =============================================================================
-- PARTE 5 — A AUTORIDADE NÃO MUDOU
-- =============================================================================

-- O cache não tem como produzir taxa: ele não fala com faixa nenhuma.
select pg_temp.checar('endereco_conhecido nao menciona faixa nem taxa', 'true',
  (select not (
       pg_get_functiondef(p.oid) ilike '%delivery_fee_bands%'
    or pg_get_functiondef(p.oid) ilike '%faixa_para_distancia%'
    or pg_get_functiondef(p.oid) ilike '%cotar_entrega%')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'endereco_conhecido')::text);

-- Continua valendo o que já valia: distância ausente nunca vira taxa.
select pg_temp.checar('cotar_entrega sem distancia nao devolve taxa', 'true',
  ((public.cotar_entrega(null, current_setting('teste.segredo', true)) -> 'taxa')
     is null)::text);

-- §8.2 REVISADO por `D-2026-09-25-77`: o endereço salvo passa a guardar
-- DISTÂNCIA, e continua proibido de guardar TAXA. As duas metades da regra,
-- em dois cenários.
select pg_temp.checar('02 §8.2 revisado: guarda distancia', '1',
  (select count(*) from information_schema.columns c
    where c.table_schema='public' and c.table_name='customer_addresses'
      and c.column_name = 'route_distance_km')::text);

select pg_temp.checar('RN-ENT-008: e NUNCA guarda taxa', '0',
  (select count(*) from information_schema.columns c
    where c.table_schema='public' and c.table_name='customer_addresses'
      and (c.column_name ilike '%fee%' or c.column_name ilike '%taxa%'
           or c.column_name ilike '%price%' or c.column_name ilike '%valor%'))::text);

-- =============================================================================
-- PARTE 6 — DISTÂNCIA REUTILIZÁVEL (FASE B, D-2026-09-25-77)
--
-- A PERGUNTA CENTRAL AQUI: reutilizar distância pode congelar preço?
-- A resposta tem de ser NÃO, e o cenário "mudar a faixa muda a taxa" é o que
-- prova. Se um dia ele falhar, a Fase B virou o que ela jurou não ser.
-- =============================================================================

-- Loja e faixas conhecidas. Substituem o que houver, dentro da transação.
delete from public.delivery_fee_bands;
delete from public.store_settings;

insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code, latitude, longitude,
  delivery_minimum_enabled, delivery_minimum_subtotal, automatic_delivery_radius_km,
  delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values (
  'ccccccc9-0000-0000-0000-000000000001','Shalon F11','5500000000000','Rua T','1','Centro',
  'Cidade','XX','00000-000', -20.0000000, -40.0000000,
  false, null, 4.0, 40, 60, 20, 30, true, 'America/Sao_Paulo'
);

insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 5, 8.50, true, 1), (5, 10, 15.00, true, 2);

-- Endereço com coordenada válida e SEM rota medida ainda.
insert into public.customer_addresses (
  id, customer_id, street, number, neighborhood, city, state, postal_code,
  latitude, longitude, geocode_provider, geocode_confidence, is_active)
values (
  'bbbbbbb2-0000-0000-0000-000000000001','aaaaaaa1-0000-0000-0000-000000000001',
  'Avenida das Palmeiras','233','Jardim Modelo','Cidade','XX','00000-111',
  -20.0100000, -40.0100000, 'here','exata', true);

create or replace function pg_temp.consultar_b(
  p_prov text default 'here', p_seg text default null
) returns jsonb language sql as $$
  select public.endereco_conhecido('Avenida das Palmeiras','233','Jardim Modelo',
           'Cidade','XX','00000-111', p_prov,
           coalesce(p_seg, current_setting('teste.segredo', true)));
$$;

-- ------------------------------------------------- antes de medir: sem rota
select pg_temp.checar('sem medicao: coordenada sim, rota nao', 'false',
  (pg_temp.consultar_b() ->> 'rota'));

select pg_temp.checar('sem medicao: coordenada continua valendo', 'true',
  (pg_temp.consultar_b() ->> 'encontrado'));

-- ------------------------------------------------------------- a gravação
select pg_temp.checar('gravar exige prova de origem', 'origem_nao_confiavel',
  (public.registrar_rota_medida('Avenida das Palmeiras','233','Jardim Modelo',
     'Cidade','XX','00000-111', 1.553, 'here', 'segredo-errado') ->> 'erro'));

-- A origem NÃO é parâmetro: é lida de `store_settings` dentro da função. Se
-- fosse parâmetro, o chamador poderia declarar uma origem que não é a da loja
-- e a distância "válida" teria sido medida de outro lugar.
select pg_temp.checar('origem NAO e parametro da gravacao', 'true',
  (select count(*) = 0 from information_schema.parameters p
    where p.specific_schema = 'public'
      and p.specific_name like 'registrar_rota_medida%'
      and p.parameter_name in ('p_origem_lat','p_origem_lng','p_latitude','p_longitude'))::text);

select pg_temp.checar('distancia zero NAO e gravada', 'medicao_invalida',
  (public.registrar_rota_medida('Avenida das Palmeiras','233','Jardim Modelo',
     'Cidade','XX','00000-111', 0, 'here',
     current_setting('teste.segredo', true)) ->> 'motivo'));

select pg_temp.checar('distancia negativa NAO e gravada', 'medicao_invalida',
  (public.registrar_rota_medida('Avenida das Palmeiras','233','Jardim Modelo',
     'Cidade','XX','00000-111', -3, 'here',
     current_setting('teste.segredo', true)) ->> 'motivo'));

select pg_temp.checar('distancia nula NAO e gravada', 'medicao_invalida',
  (public.registrar_rota_medida('Avenida das Palmeiras','233','Jardim Modelo',
     'Cidade','XX','00000-111', null, 'here',
     current_setting('teste.segredo', true)) ->> 'motivo'));

select pg_temp.checar('a medicao valida e gravada', 'true',
  (public.registrar_rota_medida('Avenida das Palmeiras','233','Jardim Modelo',
     'Cidade','XX','00000-111', 1.553, 'here',
     current_setting('teste.segredo', true)) ->> 'gravado'));

select pg_temp.checar('gravou a origem que a loja tem AGORA', 'true',
  (select route_origin_lat = -20.0000000 and route_origin_lng = -40.0000000
     from public.customer_addresses
    where id = 'bbbbbbb2-0000-0000-0000-000000000001')::text);

select pg_temp.checar('gravou provedor e data da medicao', 'true',
  (select route_provider = 'here' and route_measured_at is not null
     from public.customer_addresses
    where id = 'bbbbbbb2-0000-0000-0000-000000000001')::text);

-- --------------------------------------------------------- as constraints
--
-- A gravação pela RPC já recusa distância inválida, mas a trava do BANCO é a
-- que vale mesmo se alguém escrever por outro caminho. O bloco `exception`
-- cria um savepoint implícito: a violação não aborta a transação da suíte.
create or replace function pg_temp.tenta_rota(
  p_km numeric, p_prov text, p_lat numeric, p_lng numeric, p_quando timestamptz
) returns text language plpgsql as $$
begin
  begin
    update public.customer_addresses
       set route_distance_km = p_km, route_provider = p_prov,
           route_origin_lat = p_lat, route_origin_lng = p_lng,
           route_measured_at = p_quando
     where id = 'bbbbbbb2-0000-0000-0000-000000000001';
    return 'aceitou';
  exception when check_violation then
    return 'recusou';
  end;
end;
$$;

select pg_temp.checar('constraint recusa distancia zero', 'recusou',
  pg_temp.tenta_rota(0, 'here', -23.5, -46.5, now()));

select pg_temp.checar('constraint recusa distancia negativa', 'recusou',
  pg_temp.tenta_rota(-1.5, 'here', -23.5, -46.5, now()));

-- TUDO OU NADA: distância sem a origem que a produziu é número sem sentido.
select pg_temp.checar('constraint recusa medicao pela metade: sem origem', 'recusou',
  pg_temp.tenta_rota(3.2, 'here', null, null, now()));

select pg_temp.checar('constraint recusa medicao pela metade: sem provedor', 'recusou',
  pg_temp.tenta_rota(3.2, null, -23.5, -46.5, now()));

select pg_temp.checar('constraint recusa medicao pela metade: sem data', 'recusou',
  pg_temp.tenta_rota(3.2, 'here', -23.5, -46.5, null));

select pg_temp.checar('constraint aceita medicao completa', 'aceitou',
  pg_temp.tenta_rota(3.2, 'here', -23.5, -46.5, now()));

select pg_temp.checar('constraint aceita rota totalmente ausente', 'aceitou',
  pg_temp.tenta_rota(null, null, null, null, null));

-- Restaura a medição válida para os cenários seguintes.
select pg_temp.checar('medicao restaurada para os proximos cenarios', 'true',
  (public.registrar_rota_medida('Avenida das Palmeiras','233','Jardim Modelo',
     'Cidade','XX','00000-111', 1.553, 'here',
     current_setting('teste.segredo', true)) ->> 'gravado'));

-- --------------------------------------- reuso: quando tudo bate, tem rota
select pg_temp.checar('agora a rota e reutilizavel', 'true',
  (pg_temp.consultar_b() ->> 'rota'));

select pg_temp.checar('devolve a distancia medida', '1.553',
  (pg_temp.consultar_b() ->> 'distancia_km'));

select pg_temp.checar('devolve o provedor da rota', 'here',
  (pg_temp.consultar_b() ->> 'rota_provedor'));

select pg_temp.checar('NUNCA devolve taxa junto da rota', 'true',
  ((pg_temp.consultar_b() -> 'taxa') is null
   and (pg_temp.consultar_b() -> 'fee') is null)::text);

-- ---------------------------------- provedor diferente NAO reusa a rota
--
-- Consultar com outro provedor não serve para isolar isto: a COORDENADA
-- também é recusada por provedor diferente, e o endereço inteiro deixa de
-- casar — não sobra campo `rota` para examinar. O cenário útil é o registro
-- cuja coordenada é do provedor atual mas cuja ROTA foi medida por outro.
update public.customer_addresses set route_provider = 'mapbox'
 where id = 'bbbbbbb2-0000-0000-0000-000000000001';

select pg_temp.checar('rota medida por outro provedor NAO e reutilizada', 'false',
  (pg_temp.consultar_b() ->> 'rota'));

select pg_temp.checar('rota de outro provedor: a coordenada continua valendo', 'true',
  (pg_temp.consultar_b() ->> 'encontrado'));

update public.customer_addresses set route_provider = 'here'
 where id = 'bbbbbbb2-0000-0000-0000-000000000001';

select pg_temp.checar('com o provedor certo a rota volta a valer', 'true',
  (pg_temp.consultar_b() ->> 'rota'));

-- =================================================== REQUISITO 3
-- Mudar a loja de endereço invalida SOMENTE a distância. O cliente não se
-- mexeu: a coordenada dele continua valendo.
update public.store_settings
   set latitude = -21.0000000, longitude = -41.0000000;

select pg_temp.checar('origem mudou: a rota deixa de valer', 'false',
  (pg_temp.consultar_b() ->> 'rota'));

select pg_temp.checar('origem mudou: a COORDENADA do cliente continua valendo', 'true',
  (pg_temp.consultar_b() ->> 'encontrado'));

select pg_temp.checar('origem mudou: nenhuma distancia e devolvida', 'true',
  ((pg_temp.consultar_b() -> 'distancia_km') is null)::text);

-- Volta a loja para o lugar: a rota antiga volta a servir.
update public.store_settings
   set latitude = -20.0000000, longitude = -40.0000000;

select pg_temp.checar('loja de volta ao lugar: a rota volta a valer', 'true',
  (pg_temp.consultar_b() ->> 'rota'));

-- =================================================== REQUISITO 4
-- Vencimento em 90 dias. A coordenada, com 180, continua válida.
update public.customer_addresses
   set route_measured_at = now() - interval '91 days'
 where id = 'bbbbbbb2-0000-0000-0000-000000000001';

select pg_temp.checar('rota com 91 dias NAO e reutilizada', 'false',
  (pg_temp.consultar_b() ->> 'rota'));

select pg_temp.checar('rota vencida: a coordenada continua valendo', 'true',
  (pg_temp.consultar_b() ->> 'encontrado'));

update public.customer_addresses
   set route_measured_at = now() - interval '89 days'
 where id = 'bbbbbbb2-0000-0000-0000-000000000001';

select pg_temp.checar('rota com 89 dias ainda serve', 'true',
  (pg_temp.consultar_b() ->> 'rota'));

-- =================================================== REQUISITO 6
-- Endereço diferente não pega a rota alheia.
select pg_temp.checar('outro numero na mesma rua: sem rota', 'false',
  (public.endereco_conhecido('Avenida das Palmeiras','999','Jardim Modelo',
     'Cidade','XX','00000-111','here',
     current_setting('teste.segredo', true)) ->> 'encontrado'));

-- =================================================== REQUISITO 2
-- O CENÁRIO QUE DEFINE A FASE B: a distância em cache NÃO congela preço.
select set_config('teste.km',
  (pg_temp.consultar_b() ->> 'distancia_km'), true);

select pg_temp.checar('taxa da faixa vigente, com distancia do cache', '8.50',
  (public.cotar_entrega(current_setting('teste.km')::numeric,
     current_setting('teste.segredo', true)) ->> 'taxa'));

-- A Shalon reajusta a tabela. NADA no cache é tocado.
update public.delivery_fee_bands set fee = 11.00 where min_distance_km = 0;

select pg_temp.checar('MESMA distancia em cache, taxa NOVA', '11.00',
  (public.cotar_entrega(current_setting('teste.km')::numeric,
     current_setting('teste.segredo', true)) ->> 'taxa'));

select pg_temp.checar('a distancia em cache nao mudou', '1.553',
  (pg_temp.consultar_b() ->> 'distancia_km'));

-- Encurtar a area: a distancia em cache passa a cair fora dela.
update public.delivery_fee_bands set is_active = false where min_distance_km = 0;

select pg_temp.checar('distancia do cache pode cair FORA DE AREA', 'true',
  (public.cotar_entrega(current_setting('teste.km')::numeric,
     current_setting('teste.segredo', true)) ->> 'fora_de_area'));

select pg_temp.checar('fora de area NAO devolve taxa', 'true',
  ((public.cotar_entrega(current_setting('teste.km')::numeric,
     current_setting('teste.segredo', true)) -> 'taxa') is null)::text);

update public.delivery_fee_bands set is_active = true where min_distance_km = 0;

-- ------------------------------------------------- a taxa nao mora aqui
-- As colunas e `endereco_conhecido` já foram verificadas na PARTE 5; aqui
-- falta a função de gravação, que é nova.
select pg_temp.checar('registrar_rota_medida nao menciona faixa nem taxa', 'true',
  (select not (pg_get_functiondef(p.oid) ilike '%delivery_fee_bands%'
    or pg_get_functiondef(p.oid) ilike '%faixa_para_distancia%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='registrar_rota_medida')::text);

-- =============================================================================
-- RESULTADO
-- =============================================================================
select
  case when passou then 'OK    ' else 'FALHOU' end
    || ' | ' || lpad(n::text, 3) || ' | ' || rpad(cenario, 58)
    || ' | esperado=' || coalesce(esperado,'(null)') || ' obtido=' || coalesce(obtido,'(null)') as resultado
from resultado_teste where not passou
union all
select 'TOTAL: ' || count(*) || ' cenarios | PASSARAM: ' || count(*) filter (where passou)
  || ' | FALHARAM: ' || count(*) filter (where not passou)
from resultado_teste;

rollback;
