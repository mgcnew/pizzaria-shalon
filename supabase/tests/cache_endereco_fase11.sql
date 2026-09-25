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
select pg_temp.checar('NAO devolve distancia', 'true',
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
select pg_temp.checar('endereco_conhecido nao menciona faixa, taxa nem distancia', 'true',
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

-- §8.2 continua verdadeiro: a Fase B NÃO foi implementada.
select pg_temp.checar('02 §8.2: endereco salvo NAO guarda distancia', '0',
  (select count(*) from information_schema.columns c
    where c.table_schema='public' and c.table_name='customer_addresses'
      and c.column_name in ('route_distance_km','distance_km','delivery_fee'))::text);

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
