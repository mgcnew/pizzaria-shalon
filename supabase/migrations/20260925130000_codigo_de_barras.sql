-- =============================================================================
-- CÓDIGO DE BARRAS — Fase 12 (PDV), Etapa 2: a fundação estrutural
--
-- 02-MODELO-DADOS-SUPABASE.md §5.4-A · 03-RLS-RBAC-SEGURANCA.md §33.2-A
-- 09-PDV-FRENTE-DE-CAIXA.md §2.3 · CLAUDE.md §11, §12, §39
-- Decisão: D-2026-09-25-78
--
-- SÓ A ESTRUTURA. Nenhum CRUD, nenhuma resolução de código, nenhuma busca do
-- PDV, nenhuma interface — esses são as etapas 3 e 4.
--
-- POR QUE TABELA PRÓPRIA, E NÃO COLUNAS EM products E product_variants
--
-- Com duas colunas e dois índices únicos separados, **nada impediria o mesmo
-- código existir num produto E numa variante**. Um bipe passaria a resolver
-- duas coisas, e o PDV escolheria arbitrariamente — em cima de dinheiro.
--
-- Com uma tabela e UM índice único sobre o código normalizado, a ambiguidade é
-- impossível por construção, não por disciplina de quem cadastra.
--
-- Três benefícios vêm de graça: vários códigos por item (o fornecedor troca a
-- embalagem e o código antigo ainda está no estoque da casa), `is_primary`
-- dizendo qual mostrar, e remoção que LIBERA o código para reuso sem
-- soft-delete furando a unicidade.
--
-- `product_variants.sku` NÃO É TOCADO. É cadastro de fornecedor, não
-- identificador de venda, e misturar os dois num campo só é exatamente como o
-- projeto perderia a unicidade do código de barras.
-- =============================================================================

-- --------------------------------------------------------------- normalização

-- IMMUTABLE é requisito, não preferência: coluna gerada exige, e índice único
-- sobre ela também. É também o que impede alguém introduzir `now()` ou
-- `unaccent()` — esta última é STABLE, depende do dicionário instalado, e
-- mudaria a chave de um registro sem que o código tivesse mudado.
--
-- Mesmo precedente da Fase A do cache de endereço (`D-2026-09-25-76`): a
-- normalização existe UMA VEZ, no SQL. Nunca em TypeScript — duas definições
-- divergem, e divergência aqui casa o bipe com o produto errado.
create or replace function public.normalizar_codigo_de_barras(p_codigo text)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  v text;
begin
  if p_codigo is null then
    return '';
  end if;

  -- 1. bordas aparadas e caixa unificada. Leitor e digitação humana produzem
  --    caixas diferentes para o mesmo código alfanumérico interno.
  v := upper(btrim(p_codigo));

  -- 2. fica só o que é código: letra, dígito e hífen.
  --
  --    Espaço, tabulação, quebra de linha e pontuação DESAPARECEM em vez de
  --    virarem separador — um código de barras é uma sequência única, e
  --    "789 123" é a mesma coisa que "789123" digitada com o dedo trêmulo.
  --
  --    Zeros à esquerda são preservados: nada aqui remove zeros, e em EAN-13
  --    eles são significativos. `0000123` e `123` são códigos DIFERENTES.
  --
  --    O HÍFEN É MANTIDO, e é uma escolha pelo lado seguro: mantê-lo separa
  --    `AB-12` de `AB12`, o que no pior caso produz um código não encontrado.
  --    Removê-lo uniria dois códigos que talvez sejam de itens distintos — e
  --    unir é o único erro inaceitável aqui.
  return regexp_replace(v, '[^A-Z0-9-]', '', 'g');
end;
$$;

comment on function public.normalizar_codigo_de_barras is
  'Código de barras normalizado para comparação. IMMUTABLE por exigência da coluna gerada e do índice único. Preserva zeros à esquerda.';

-- --------------------------------------------------------------------- tabela

create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),

  -- Como foi digitado ou lido, preservado para exibição e auditoria.
  code text not null,

  -- O que vale para comparação. GERADO pelo banco: não existe caminho pelo
  -- qual a aplicação, SQL manual ou uma migration distraída grave um
  -- normalizado que não corresponda ao `code` da própria linha.
  code_normalized text generated always as
    (public.normalizar_codigo_de_barras(code)) stored,

  -- O alvo. Um dos dois, nunca os dois, nunca nenhum.
  --
  -- `on delete cascade` porque código sem alvo não significa nada: a
  -- constraint `alvo_unico` proibiria a linha órfã, então `set null` deixaria
  -- a exclusão impossível em vez de limpa.
  product_id uuid references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,

  -- Qual código mostrar no cadastro quando o item tiver vários.
  is_primary boolean not null default false,

  created_at timestamptz not null default now(),
  -- Quem cadastrou. `set null` porque remover um acesso não pode apagar o
  -- código de barras de um produto (§28: histórico não se perde).
  created_by uuid references public.app_users(id) on delete set null,

  -- EXATAMENTE UM ALVO. `<>` sobre dois booleanos é XOR: proíbe os dois
  -- preenchidos e proíbe os dois nulos, numa expressão só.
  constraint product_barcodes_alvo_unico
    check ((product_id is null) <> (variant_id is null)),

  -- Comprimento medido no NORMALIZADO, não no digitado: "1 2 3" tem cinco
  -- caracteres e vale três.
  constraint product_barcodes_codigo_valido
    check (length(public.normalizar_codigo_de_barras(code)) between 4 and 48)
);

comment on table public.product_barcodes is
  'Código de barras de venda, para produto OU variante. Unicidade GLOBAL do código normalizado (D-2026-09-25-78).';
comment on column public.product_barcodes.code is
  'Como foi lido ou digitado. Preservado para exibição; a comparação usa code_normalized.';
comment on column public.product_barcodes.code_normalized is
  'Gerado pelo banco. É sobre ele que existe a unicidade global.';
comment on column public.product_barcodes.is_primary is
  'Qual código exibir no cadastro. No máximo um por alvo.';

-- ---------------------------------------------------------------- unicidade

-- A UNICIDADE QUE IMPORTA. Global, sobre o normalizado, sem cláusula parcial:
-- um código resolve para UMA coisa no sistema inteiro, produto ou variante.
-- É este índice que torna o bipe ambíguo impossível.
create unique index product_barcodes_codigo
  on public.product_barcodes (code_normalized);

-- No máximo um primário por alvo. Parciais, porque `is_primary = false` pode
-- repetir à vontade — é o caso comum.
create unique index product_barcodes_primario_produto
  on public.product_barcodes (product_id)
  where is_primary and product_id is not null;

create unique index product_barcodes_primario_variante
  on public.product_barcodes (variant_id)
  where is_primary and variant_id is not null;

-- Listar os códigos de um item (CLAUDE.md §39: índice em filtro frequente).
-- Os parciais acima não servem para isto: eles só cobrem as linhas primárias.
create index product_barcodes_do_produto
  on public.product_barcodes (product_id) where product_id is not null;

create index product_barcodes_da_variante
  on public.product_barcodes (variant_id) where variant_id is not null;

-- --------------------------------------------------------------------- RLS

-- 03 §33.2-A. Exceção deliberada ao restante do catálogo: código de barras é
-- DADO INTERNO e não pertence à vitrine. `products` tem policy para `anon`
-- porque o cardápio é público; aqui não há nenhuma.
alter table public.product_barcodes enable row level security;
alter table public.product_barcodes force row level security;

-- Duas camadas para o mesmo NÃO.
--
-- A ausência de policy para `anon` já o bloquearia, porque RLS é deny by
-- default (CLAUDE.md §12). Mas o Supabase concede privilégio de tabela a
-- `anon` por default em todo o schema `public`, e essa concessão sozinha
-- viraria acesso no dia em que alguém acrescentasse uma policy permissiva sem
-- perceber o que ela alimenta. Revogar o GRANT fecha a porta antes da policy.
revoke all on table public.product_barcodes from anon;
revoke all on table public.product_barcodes from public;

create policy product_barcodes_select on public.product_barcodes
  for select to authenticated
  using (public.has_permission('catalog.view'));

create policy product_barcodes_insert on public.product_barcodes
  for insert to authenticated
  with check (public.has_permission('catalog.manage'));

create policy product_barcodes_update on public.product_barcodes
  for update to authenticated
  using (public.has_permission('catalog.manage'))
  with check (public.has_permission('catalog.manage'));

create policy product_barcodes_delete on public.product_barcodes
  for delete to authenticated
  using (public.has_permission('catalog.manage'));
