-- =============================================================================
-- CHAVE DETERMINÍSTICA DE ENDEREÇO — Fase 11, cache de geocodificação (Fase A)
--
-- 02-MODELO-DADOS-SUPABASE.md §8.2 · 04-REGRAS-NEGOCIO.md RN-ENT-004
-- CLAUDE.md §16, §20
--
-- POR QUE ESTA FUNÇÃO EXISTE
--
-- `customer_addresses` já guarda latitude, longitude, provedor e confiança —
-- `criar_pedido` grava esses valores desde a Fase 5. Ninguém nunca leu de
-- volta, porque não havia como perguntar "este endereço já é conhecido?" sem
-- depender do `id` que o navegador manda, e o navegador não é autoridade.
--
-- Esta função responde a essa pergunta a partir do CONTEÚDO do endereço.
--
-- POR QUE ELA VIVE SÓ NO SQL
--
-- A tentação seria normalizar no TypeScript e consultar por igualdade. Seria
-- um erro: haveria DUAS definições da mesma regra, e qualquer divergência
-- futura entre elas produziria acerto de cache falso — a coordenada de um
-- endereço aplicada a outro, distância errada, taxa errada. Dinheiro.
--
-- Por isso a normalização existe uma vez só, aqui, e é usada tanto pela
-- coluna gerada quanto pela consulta. O TypeScript nunca calcula a chave:
-- manda os campos crus e o banco decide.
--
-- IMMUTABLE é requisito, não preferência: coluna gerada exige. É também o que
-- impede alguém de introduzir `now()` ou `unaccent()` — esta última é STABLE,
-- porque depende do dicionário instalado, e mudaria a chave de um registro
-- sem que o endereço tivesse mudado.
--
-- Por isso os acentos são removidos por `translate` explícito, e não por
-- `unaccent()` nem por decomposição Unicode: é a forma IMMUTABLE, legível e
-- que não depende de encoding nem de extensão instalada.
--
-- DIREÇÃO SEGURA DO ERRO: normalização conservadora demais gera MISS, e miss
-- cai no comportamento atual com o HERE — seguro. Normalização agressiva
-- demais uniria endereços diferentes, que é o único erro inaceitável aqui.
-- Toda decisão abaixo escolhe o lado do miss.
-- =============================================================================

-- ---------------------------------------------------------------- normalização

create or replace function public.normalizar_parte_de_endereco(p_texto text)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  v text;
begin
  if p_texto is null then
    return '';
  end if;

  -- 1. caixa baixa e acentos fora. "SÃO PAULO", "São Paulo" e "sao paulo"
  --    são a mesma cidade.
  v := translate(
         lower(p_texto),
         'áàâãäéèêëíìîïóòôõöúùûüýÿçñ',
         'aaaaaeeeeiiiiooooouuuuyycn'
       );

  -- 2. qualquer coisa que não seja letra ou dígito vira espaço. Cobre ponto
  --    de abreviação, vírgula, hífen, barra e o que mais o cliente digitar.
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');

  -- 3. abreviações expandidas, sempre em palavra inteira (\m e \M são as
  --    bordas de palavra do Postgres). São sinônimos: expandir não pode unir
  --    dois logradouros diferentes, só reconhecer o mesmo escrito de outro
  --    jeito. "R. das Flores" e "Rua das Flores" são a mesma rua.
  v := regexp_replace(v, '\mr\M',           'rua',       'g');
  v := regexp_replace(v, '\mav\M',          'avenida',   'g');
  v := regexp_replace(v, '\mal\M',          'alameda',   'g');
  v := regexp_replace(v, '\m(tv|trav)\M',   'travessa',  'g');
  v := regexp_replace(v, '\m(pc|pca)\M',    'praca',     'g');
  v := regexp_replace(v, '\mrod\M',         'rodovia',   'g');
  v := regexp_replace(v, '\mest\M',         'estrada',   'g');
  v := regexp_replace(v, '\mjd\M',          'jardim',    'g');
  v := regexp_replace(v, '\mvl\M',          'vila',      'g');
  v := regexp_replace(v, '\mpq\M',          'parque',    'g');

  -- 4. espaço interno colapsado e bordas aparadas.
  return btrim(regexp_replace(v, '\s+', ' ', 'g'));
end;
$$;

comment on function public.normalizar_parte_de_endereco is
  'Normaliza um pedaço de endereço para comparação. IMMUTABLE por exigência da coluna gerada.';

-- --------------------------------------------------------------------- número

-- O número NÃO passa pela expansão de abreviações: "123A" não é abreviação de
-- nada, e precisa continuar distinto de "123" — são casas diferentes, com
-- coordenadas possivelmente diferentes.
create or replace function public.normalizar_numero_de_endereco(p_numero text)
returns text language sql immutable set search_path = ''
as $$
  select regexp_replace(lower(coalesce(p_numero, '')), '[^a-z0-9]+', '', 'g');
$$;

comment on function public.normalizar_numero_de_endereco is
  'Número do imóvel normalizado. "123A" e "123" permanecem distintos: são casas diferentes.';

-- ----------------------------------------------------------------------- CEP

-- CEP participa da identidade somente quando está completo. CEP parcial,
-- vazio ou inválido é tratado como ausente — o que produz outra chave e, no
-- pior caso, um MISS.
create or replace function public.normalizar_cep(p_cep text)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  v text;
begin
  v := regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g');
  if length(v) <> 8 then
    return '';
  end if;
  return v;
end;
$$;

comment on function public.normalizar_cep is
  'CEP com 8 dígitos, ou vazio. CEP incompleto não participa da identidade do endereço.';

-- --------------------------------------------------------------------- chave

create or replace function public.chave_de_endereco(
  p_logradouro text,
  p_numero     text,
  p_bairro     text,
  p_cidade     text,
  p_uf         text,
  p_cep        text
) returns text language sql immutable set search_path = ''
as $$
  -- RN-ENT-004: `complemento` e `ponto de referência` NÃO entram, porque não
  -- movem a casa de lugar. "Ap 42" e "Ap 71" no mesmo prédio são a mesma
  -- coordenada e devem ser o mesmo acerto de cache. É a mesma razão pela qual
  -- os dois já ficam de fora da consulta de geocodificação.
  --
  -- O separador é '|', que a normalização nunca produz: ela devolve apenas
  -- [a-z0-9 ]. Assim nenhum campo pode se disfarçar de outro por concatenação.
  --
  -- Concatenação com `||`, e NÃO `concat_ws`: este último é STABLE no
  -- Postgres, não IMMUTABLE, e usá-lo aqui tornaria a declaração IMMUTABLE
  -- desta função uma afirmação falsa — que a coluna gerada aceita na criação
  -- e cobra depois. Todas as funções acima devolvem '' em vez de NULL
  -- justamente para que `||` seja seguro.
  select public.normalizar_parte_de_endereco(p_logradouro) || '|' ||
         public.normalizar_numero_de_endereco(p_numero)    || '|' ||
         public.normalizar_parte_de_endereco(p_bairro)     || '|' ||
         public.normalizar_parte_de_endereco(p_cidade)     || '|' ||
         public.normalizar_parte_de_endereco(p_uf)         || '|' ||
         public.normalizar_cep(p_cep);
$$;

comment on function public.chave_de_endereco is
  'Identidade geográfica do endereço. Complemento e referência NÃO participam (RN-ENT-004).';
