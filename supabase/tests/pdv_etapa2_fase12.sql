-- =============================================================================
-- TESTES DO CÓDIGO DE BARRAS — FASE 12 (PDV), ETAPA 2
--
-- 02-MODELO-DADOS-SUPABASE.md §5.4-A · 03-RLS-RBAC-SEGURANCA.md §33.2-A
-- 09-PDV-FRENTE-DE-CAIXA.md §2.3 · CLAUDE.md §12, §36 · D-2026-09-25-78
--
-- AS TRÊS PERGUNTAS QUE ESTE ARQUIVO RESPONDE:
--
-- 1. NORMALIZAÇÃO — dois jeitos de escrever o mesmo código chegam ao mesmo
--    lugar, e dois códigos realmente diferentes NUNCA são fundidos?
-- 2. UNICIDADE — existe algum caminho pelo qual um bipe resolva duas coisas?
-- 3. RLS — o código de barras é invisível para quem não tem `catalog.view`, e
--    inalterável para quem não tem `catalog.manage`?
--
-- Blocos A–G rodam como `postgres` DE PROPÓSITO: ali o objeto de medida é a
-- constraint, e RLS só atrapalharia. O bloco H troca de papel e é o único que
-- mede autorização.
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

-- `execute` dinâmico, nunca SQL estático: plpgsql NÃO guarda plano de comando
-- dinâmico, e foi exatamente o plano em cache que, na Etapa 1, fez um teste de
-- permissão medir o papel anterior em vez do papel corrente.
create or replace function pg_temp.tentar(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- Quantas linhas o papel corrente VÊ. -1 significa privilégio de tabela negado,
-- que é diferente de ver zero linhas por RLS — a distinção é o ponto de H7/H9.
create or replace function pg_temp.visiveis()
returns integer language plpgsql as $$
declare n integer;
begin
  execute 'select count(*) from public.product_barcodes' into n;
  return n;
exception when others then
  return -1;
end;
$$;

-- Quantas linhas o comando REALMENTE afetou. RLS filtra UPDATE e DELETE em
-- silêncio: zero linhas e nenhum erro. Sem contar, o teste passaria acreditando
-- que negou quando na verdade não achou nada.
create or replace function pg_temp.afetadas(p_sql text)
returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
exception when others then
  return -1;
end;
$$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('99999999-aaaa-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','donacb@teste.local','x',now(),now(),now()),
  ('99999999-aaaa-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','soolhacb@teste.local','x',now(),now(),now()),
  ('99999999-aaaa-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','semcatalogo@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a1a1a1a1-cb00-0000-0000-000000000001','Dona CB','owner',false,'active'),
  ('a1a1a1a1-cb00-0000-0000-000000000002','So olha catalogo CB','counter',false,'active'),
  ('a1a1a1a1-cb00-0000-0000-000000000003','Sem catalogo CB','counter',false,'active');

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b1b1b1b1-cb00-0000-0000-000000000001','99999999-aaaa-1111-1111-111111111111','a1a1a1a1-cb00-0000-0000-000000000001',true),
  ('b1b1b1b1-cb00-0000-0000-000000000002','99999999-aaaa-2222-2222-222222222222','a1a1a1a1-cb00-0000-0000-000000000002',true),
  ('b1b1b1b1-cb00-0000-0000-000000000003','99999999-aaaa-3333-3333-333333333333','a1a1a1a1-cb00-0000-0000-000000000003',true);

insert into public.user_roles (app_user_id, role_id)
select 'b1b1b1b1-cb00-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';

-- Papéis construídos aqui, e não herdados do seed: se amanhã alguém alterar o
-- que "Atendente" pode fazer, este arquivo continua medindo a REGRA — view sem
-- manage, e nada de catálogo — em vez de medir o seed.
insert into public.roles (id, name, description, is_system, is_active) values
  ('c1c1c1c1-cb00-0000-0000-00000000000a','So ve catalogo CB','ve e nao gerencia',false,true),
  ('c1c1c1c1-cb00-0000-0000-00000000000b','Sem catalogo CB','nem ve o catalogo',false,true);

insert into public.role_permissions (role_id, permission_id)
select 'c1c1c1c1-cb00-0000-0000-00000000000a', id from public.permissions
 where code in ('catalog.view','orders.view');
insert into public.role_permissions (role_id, permission_id)
select 'c1c1c1c1-cb00-0000-0000-00000000000b', id from public.permissions
 where code in ('orders.view');

insert into public.user_roles (app_user_id, role_id) values
  ('b1b1b1b1-cb00-0000-0000-000000000002','c1c1c1c1-cb00-0000-0000-00000000000a'),
  ('b1b1b1b1-cb00-0000-0000-000000000003','c1c1c1c1-cb00-0000-0000-00000000000b');

-- Produtos e variantes de teste. P9 nasce SEM variante de propósito: é o único
-- que pode ser excluído, porque `product_variants.product_id` é
-- `on delete restrict` e uma variante barraria a exclusão do produto.
insert into public.products (id, category_id, product_type, name, slug, base_price)
select 'd1d1d1d1-cb00-0000-0000-000000000001', c.id, 'other', 'Item CB Um', 'item-cb-um', 10.00
  from public.categories c order by c.sort_order, c.id limit 1;
insert into public.products (id, category_id, product_type, name, slug, base_price)
select 'd1d1d1d1-cb00-0000-0000-000000000002', c.id, 'other', 'Item CB Dois', 'item-cb-dois', 12.00
  from public.categories c order by c.sort_order, c.id limit 1;
insert into public.products (id, category_id, product_type, name, slug, base_price)
select 'd1d1d1d1-cb00-0000-0000-000000000009', c.id, 'other', 'Item CB Nove', 'item-cb-nove', 9.00
  from public.categories c order by c.sort_order, c.id limit 1;
insert into public.products (id, category_id, product_type, name, slug, base_price)
select 'd1d1d1d1-cb00-0000-0000-0000000000f1', c.id, 'pizza', 'Pizza CB', 'pizza-cb', null
  from public.categories c order by c.sort_order, c.id limit 1;

insert into public.product_variants (id, product_id, size_id, price)
select 'e1e1e1e1-cb00-0000-0000-000000000001', 'd1d1d1d1-cb00-0000-0000-0000000000f1', s.id, 50.00
  from public.pizza_sizes s order by s.sort_order, s.id limit 1;
insert into public.product_variants (id, product_id, size_id, price)
select 'e1e1e1e1-cb00-0000-0000-000000000002', 'd1d1d1d1-cb00-0000-0000-0000000000f1', s.id, 70.00
  from public.pizza_sizes s order by s.sort_order desc, s.id desc limit 1;

-- =============================================================================
-- BLOCO A — NORMALIZAÇÃO
--
-- A regra em uma frase: o mesmo código escrito de dois jeitos converge; dois
-- códigos diferentes NUNCA convergem. A segunda metade é a que protege dinheiro.
-- =============================================================================

select pg_temp.checar('A1 apara as bordas', '7891',
  public.normalizar_codigo_de_barras('   7891   '));

select pg_temp.checar('A2 unifica a caixa', 'AB12CD',
  public.normalizar_codigo_de_barras('ab12cd'));

-- Espaço NÃO vira separador: um código de barras e uma sequência unica, e quem
-- digita "789 123" quis dizer "789123".
select pg_temp.checar('A3 espaco interno desaparece sem separar', '789123',
  public.normalizar_codigo_de_barras('789 123'));

select pg_temp.checar('A4 tab e quebra de linha desaparecem', '789123',
  public.normalizar_codigo_de_barras(E'78\t9\n123'));

select pg_temp.checar('A5 pontuacao desaparece', '78912345',
  public.normalizar_codigo_de_barras('789.123/45'));

-- O hífen fica, e é escolha pelo lado seguro: separar `AB-12` de `AB12` no pior
-- caso não encontra; unir os dois casaria o bipe com o item errado.
select pg_temp.checar('A6 hifen e preservado', 'AB-12',
  public.normalizar_codigo_de_barras('ab-12'));

select pg_temp.checar('A7 zeros a esquerda preservados', '0000123',
  public.normalizar_codigo_de_barras('0000123'));

-- O teste mais importante do bloco: em EAN o zero à esquerda é significativo.
select pg_temp.checar('A8 zero a esquerda distingue codigos', 'diferentes',
  case when public.normalizar_codigo_de_barras('0123')
          = public.normalizar_codigo_de_barras('123')
       then 'fundiu' else 'diferentes' end);

select pg_temp.checar('A9 nulo virou vazio, nao nulo', 'vazio',
  case when public.normalizar_codigo_de_barras(null) = '' then 'vazio' else 'outro' end);

select pg_temp.checar('A10 acento nao sobrevive', 'O12',
  public.normalizar_codigo_de_barras('ção12'));

select pg_temp.checar('A11 normalizar e idempotente', 'true',
  (public.normalizar_codigo_de_barras(public.normalizar_codigo_de_barras(' ab 12.3 '))
   = public.normalizar_codigo_de_barras(' ab 12.3 '))::text);

-- IMMUTABLE não é estilo: sem ela a coluna gerada e o índice único são recusados.
select pg_temp.checar('A12 declarada IMMUTABLE', 'i',
  (select provolatile::text from pg_proc
    where proname = 'normalizar_codigo_de_barras' and pronamespace = 'public'::regnamespace));

select pg_temp.checar('A13 search_path fixado', 'true',
  (select (proconfig::text like '%search_path=%') ::text from pg_proc
    where proname = 'normalizar_codigo_de_barras' and pronamespace = 'public'::regnamespace));

-- =============================================================================
-- BLOCO B — COMPRIMENTO (medido no normalizado, não no digitado)
-- =============================================================================

select pg_temp.checar('B1 tres caracteres recusado', '23514', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('123', 'd1d1d1d1-cb00-0000-0000-000000000001')$q$));

select pg_temp.checar('B2 quatro caracteres aceito', 'ok', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('B200', 'd1d1d1d1-cb00-0000-0000-000000000001')$q$));

select pg_temp.checar('B3 quarenta e oito aceito', 'ok', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values (repeat('B', 48), 'd1d1d1d1-cb00-0000-0000-000000000001')$q$));

select pg_temp.checar('B4 quarenta e nove recusado', '23514', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values (repeat('C', 49), 'd1d1d1d1-cb00-0000-0000-000000000001')$q$));

-- Cinco caracteres digitados que valem três: o limite olha o normalizado.
select pg_temp.checar('B5 curto DEPOIS de normalizar e recusado', '23514', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('1 2 3', 'd1d1d1d1-cb00-0000-0000-000000000001')$q$));

select pg_temp.checar('B6 so pontuacao e recusado', '23514', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('.../...', 'd1d1d1d1-cb00-0000-0000-000000000001')$q$));

-- =============================================================================
-- BLOCO C — ALVO: exatamente um
-- =============================================================================

select pg_temp.checar('C1 produto aceito', 'ok', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('C100', 'd1d1d1d1-cb00-0000-0000-000000000001')$q$));

select pg_temp.checar('C2 variante aceita', 'ok', pg_temp.tentar($q$
  insert into public.product_barcodes (code, variant_id)
  values ('C200', 'e1e1e1e1-cb00-0000-0000-000000000001')$q$));

select pg_temp.checar('C3 sem alvo recusado', '23514', pg_temp.tentar($q$
  insert into public.product_barcodes (code) values ('C300')$q$));

select pg_temp.checar('C4 dois alvos recusado', '23514', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id, variant_id)
  values ('C400', 'd1d1d1d1-cb00-0000-0000-000000000001',
                  'e1e1e1e1-cb00-0000-0000-000000000001')$q$));

-- =============================================================================
-- BLOCO D — UNICIDADE GLOBAL
--
-- É este bloco que responde "um bipe pode resolver duas coisas?".
-- =============================================================================

select pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('D1000', 'd1d1d1d1-cb00-0000-0000-000000000001')$q$);

select pg_temp.checar('D1 mesmo codigo em outro produto recusado', '23505', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('D1000', 'd1d1d1d1-cb00-0000-0000-000000000002')$q$));

-- O caso que colunas separadas em products e product_variants NÃO conseguiriam
-- impedir, e a razão de existir uma tabela só.
select pg_temp.checar('D2 mesmo codigo em produto E variante recusado', '23505', pg_temp.tentar($q$
  insert into public.product_barcodes (code, variant_id)
  values ('D1000', 'e1e1e1e1-cb00-0000-0000-000000000001')$q$));

select pg_temp.checar('D3 escrito diferente TAMBEM colide', '23505', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('  d1 000 ', 'd1d1d1d1-cb00-0000-0000-000000000002')$q$));

select pg_temp.checar('D4 varios codigos no mesmo produto aceitos', 'ok', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id) values
    ('D4001', 'd1d1d1d1-cb00-0000-0000-000000000001'),
    ('D4002', 'd1d1d1d1-cb00-0000-0000-000000000001'),
    ('D4003', 'd1d1d1d1-cb00-0000-0000-000000000001')$q$));

select pg_temp.checar('D5 varios codigos na mesma variante aceitos', 'ok', pg_temp.tentar($q$
  insert into public.product_barcodes (code, variant_id) values
    ('D5001', 'e1e1e1e1-cb00-0000-0000-000000000001'),
    ('D5002', 'e1e1e1e1-cb00-0000-0000-000000000001')$q$));

-- Sem soft-delete, remover LIBERA o código: a embalagem saiu de linha e o
-- número pode voltar em outro item.
select pg_temp.tentar($q$delete from public.product_barcodes where code = 'D4003'$q$);
select pg_temp.checar('D6 remover libera o codigo para reuso', 'ok', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('D4003', 'd1d1d1d1-cb00-0000-0000-000000000002')$q$));

select pg_temp.checar('D7 zeros a esquerda convivem, nao colidem', 'ok', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id) values
    ('7891234', 'd1d1d1d1-cb00-0000-0000-000000000001'),
    ('07891234', 'd1d1d1d1-cb00-0000-0000-000000000002')$q$));

select pg_temp.checar('D8 e as duas linhas existem de fato', '2',
  (select count(*)::text from public.product_barcodes
    where code_normalized in ('7891234','07891234')));

-- =============================================================================
-- BLOCO E — is_primary: no máximo um por alvo
-- =============================================================================

select pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id, is_primary)
  values ('E1000', 'd1d1d1d1-cb00-0000-0000-000000000001', true)$q$);

select pg_temp.checar('E1 dois primarios no mesmo produto recusado', '23505', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id, is_primary)
  values ('E1001', 'd1d1d1d1-cb00-0000-0000-000000000001', true)$q$));

select pg_temp.tentar($q$
  insert into public.product_barcodes (code, variant_id, is_primary)
  values ('E2000', 'e1e1e1e1-cb00-0000-0000-000000000001', true)$q$);

select pg_temp.checar('E2 dois primarios na mesma variante recusado', '23505', pg_temp.tentar($q$
  insert into public.product_barcodes (code, variant_id, is_primary)
  values ('E2001', 'e1e1e1e1-cb00-0000-0000-000000000001', true)$q$));

-- `is_primary = false` repete à vontade: é o caso comum, e um índice único
-- total em vez de parcial o teria proibido.
select pg_temp.checar('E3 primario + varios nao-primarios convivem', 'ok', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id, is_primary) values
    ('E3001', 'd1d1d1d1-cb00-0000-0000-000000000001', false),
    ('E3002', 'd1d1d1d1-cb00-0000-0000-000000000001', false)$q$));

select pg_temp.checar('E4 primarios em produtos diferentes aceitos', 'ok', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id, is_primary)
  values ('E4001', 'd1d1d1d1-cb00-0000-0000-000000000002', true)$q$));

select pg_temp.checar('E5 primario de variante nao conflita com o de produto', 'ok', pg_temp.tentar($q$
  insert into public.product_barcodes (code, variant_id, is_primary)
  values ('E5001', 'e1e1e1e1-cb00-0000-0000-000000000002', true)$q$));

-- =============================================================================
-- BLOCO F — A COLUNA GERADA
--
-- A pergunta: existe caminho pelo qual o normalizado deixe de corresponder ao
-- `code` da própria linha? Se existir, a unicidade é decorativa.
-- =============================================================================

select pg_temp.checar('F1 gravar o normalizado direto e recusado', '428C9', pg_temp.tentar($q$
  insert into public.product_barcodes (code, code_normalized, product_id)
  values ('F1000', 'OUTRACOISA', 'd1d1d1d1-cb00-0000-0000-000000000001')$q$));

select pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('f 1 0 0 1', 'd1d1d1d1-cb00-0000-0000-000000000001')$q$);

select pg_temp.checar('F2 normalizado calculado no insert', 'F1001',
  (select code_normalized from public.product_barcodes where code = 'f 1 0 0 1'));

select pg_temp.tentar($q$
  update public.product_barcodes set code = '  f-1002  ' where code = 'f 1 0 0 1'$q$);

select pg_temp.checar('F3 normalizado RECALCULADO no update', 'F-1002',
  (select code_normalized from public.product_barcodes where code = '  f-1002  '));

-- Varredura: toda linha da tabela corresponde à função. Zero divergências.
select pg_temp.checar('F4 nenhuma linha divergente da funcao', '0',
  (select count(*)::text from public.product_barcodes
    where code_normalized <> public.normalizar_codigo_de_barras(code)));

-- =============================================================================
-- BLOCO G — CHAVES ESTRANGEIRAS E EXCLUSÃO
-- =============================================================================

select pg_temp.checar('G1 produto inexistente recusado', '23503', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('G1000', '00000000-0000-0000-0000-0000000000ff')$q$));

select pg_temp.checar('G2 variante inexistente recusada', '23503', pg_temp.tentar($q$
  insert into public.product_barcodes (code, variant_id)
  values ('G2000', '00000000-0000-0000-0000-0000000000fe')$q$));

-- P9 não tem variante, então pode ser excluído: `product_variants.product_id`
-- é `on delete restrict` e barraria o produto que tem uma.
select pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('G3000', 'd1d1d1d1-cb00-0000-0000-000000000009')$q$);
select pg_temp.tentar($q$delete from public.products where id = 'd1d1d1d1-cb00-0000-0000-000000000009'$q$);
select pg_temp.checar('G3 excluir produto levou seus codigos', '0',
  (select count(*)::text from public.product_barcodes where code = 'G3000'));

select pg_temp.tentar($q$delete from public.product_barcodes where variant_id = 'e1e1e1e1-cb00-0000-0000-000000000002'$q$);
select pg_temp.tentar($q$
  insert into public.product_barcodes (code, variant_id)
  values ('G4000', 'e1e1e1e1-cb00-0000-0000-000000000002')$q$);
select pg_temp.tentar($q$delete from public.product_variants where id = 'e1e1e1e1-cb00-0000-0000-000000000002'$q$);
select pg_temp.checar('G4 excluir variante levou seus codigos', '0',
  (select count(*)::text from public.product_barcodes where code = 'G4000'));

-- =============================================================================
-- BLOCO H — RLS, GRANTS E PERMISSÃO
--
-- O único bloco que troca de papel. Duas camadas são medidas separadamente:
-- o GRANT de tabela (anon nem chega na policy) e a policy (authenticated chega,
-- e aí a permissão semântica decide).
-- =============================================================================

select pg_temp.checar('H1 RLS habilitado', 'true',
  (select relrowsecurity::text from pg_class where oid = 'public.product_barcodes'::regclass));

-- `force` importa porque sem ela o dono da tabela escapa da própria policy.
select pg_temp.checar('H2 RLS forcado', 'true',
  (select relforcerowsecurity::text from pg_class where oid = 'public.product_barcodes'::regclass));

select pg_temp.checar('H3 anon sem privilegio de SELECT', 'false',
  has_table_privilege('anon', 'public.product_barcodes', 'select')::text);
select pg_temp.checar('H4 anon sem privilegio de INSERT', 'false',
  has_table_privilege('anon', 'public.product_barcodes', 'insert')::text);
select pg_temp.checar('H5 PUBLIC sem privilegio de SELECT', 'false',
  has_table_privilege('public', 'public.product_barcodes', 'select')::text);
select pg_temp.checar('H6 authenticated COM privilegio de SELECT', 'true',
  has_table_privilege('authenticated', 'public.product_barcodes', 'select')::text);

-- Nenhuma policy menciona anon: o cardápio é público, o código de barras não.
select pg_temp.checar('H7 nenhuma policy alcanca anon', '0',
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'product_barcodes'
      and 'anon' = any (roles)));

select pg_temp.checar('H8 quatro policies, uma por comando', '4',
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'product_barcodes'));

-- Quantas linhas existem de verdade, medido sem RLS, para comparar adiante.
select set_config('teste.total', (select count(*)::text from public.product_barcodes), true);

-- ---------------------------------------------------------------- anon
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- -1 = privilégio negado. Não é "viu zero linhas": anon não chega na policy.
select pg_temp.checar('H9 anon nao le (privilegio negado, nao filtro)', '-1',
  pg_temp.visiveis()::text);
select pg_temp.checar('H10 anon nao insere', '42501', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('H1000', 'd1d1d1d1-cb00-0000-0000-000000000001')$q$));

reset role;

-- ------------------------------------------------- sem catalog.view
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-aaaa-3333-3333-333333333333","role":"authenticated"}';

-- Aqui o zero é legítimo: o privilégio existe, a policy é que não deixa passar
-- nenhuma linha.
select pg_temp.checar('H11 sem catalog.view ve zero linhas (nao erro)', '0',
  pg_temp.visiveis()::text);
select pg_temp.checar('H12 sem catalog.manage nao insere', '42501', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('H1200', 'd1d1d1d1-cb00-0000-0000-000000000001')$q$));

reset role;

-- --------------------------------------- catalog.view SEM catalog.manage
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-aaaa-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.checar('H13 com catalog.view le tudo', current_setting('teste.total'),
  pg_temp.visiveis()::text);

select pg_temp.checar('H14 ver nao da direito de inserir', '42501', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('H1400', 'd1d1d1d1-cb00-0000-0000-000000000001')$q$));

-- ZERO LINHAS, SEM ERRO — a armadilha da Etapa 1. Se este teste medisse apenas
-- "não deu erro", passaria acreditando que negou.
select pg_temp.checar('H15 ver nao da direito de atualizar (0 linhas, sem erro)', '0',
  pg_temp.afetadas($q$update public.product_barcodes set is_primary = true where code = 'C100'$q$)::text);

select pg_temp.checar('H16 ver nao da direito de remover (0 linhas, sem erro)', '0',
  pg_temp.afetadas($q$delete from public.product_barcodes where code = 'C100'$q$)::text);

select pg_temp.checar('H17 e a linha continua intacta', '1',
  (select count(*)::text from public.product_barcodes
    where code = 'C100' and not is_primary));

reset role;

-- ------------------------------------------------------- catalog.manage
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-aaaa-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.checar('H18 com catalog.manage insere', 'ok', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id, created_by)
  values ('H1800', 'd1d1d1d1-cb00-0000-0000-000000000001',
          'b1b1b1b1-cb00-0000-0000-000000000001')$q$));

select pg_temp.checar('H19 com catalog.manage atualiza (1 linha)', '1',
  pg_temp.afetadas($q$update public.product_barcodes set code = 'H1801' where code = 'H1800'$q$)::text);

select pg_temp.checar('H20 e o normalizado acompanhou', 'H1801',
  (select code_normalized from public.product_barcodes where code = 'H1801'));

select pg_temp.checar('H21 com catalog.manage remove (1 linha)', '1',
  pg_temp.afetadas($q$delete from public.product_barcodes where code = 'H1801'$q$)::text);

-- As constraints continuam valendo sob RLS: permissão não é licença para gravar
-- estado inválido.
select pg_temp.checar('H22 manage nao escapa da unicidade', '23505', pg_temp.tentar($q$
  insert into public.product_barcodes (code, product_id)
  values ('C100', 'd1d1d1d1-cb00-0000-0000-000000000002')$q$));

select pg_temp.checar('H23 manage nao escapa do alvo unico', '23514', pg_temp.tentar($q$
  insert into public.product_barcodes (code) values ('H2300')$q$));

reset role;

-- =============================================================================
-- BLOCO I — product_variants.sku INTOCADO
--
-- SKU é cadastro de fornecedor. A decisão foi não transformá-lo em
-- identificador de venda, e este bloco prova que a Etapa 2 não o tocou.
-- =============================================================================

select pg_temp.checar('I1 sku continua existindo e nulavel', 'text/YES',
  (select data_type || '/' || is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'product_variants' and column_name = 'sku'));

select pg_temp.checar('I2 nenhum indice novo sobre sku', '0',
  (select count(*)::text from pg_indexes
    where schemaname = 'public' and tablename = 'product_variants'
      and indexdef like '%sku%'));

select pg_temp.checar('I3 nenhuma constraint nova citando sku', '0',
  (select count(*)::text from pg_constraint
    where conrelid = 'public.product_variants'::regclass
      and pg_get_constraintdef(oid) like '%sku%'));

select pg_temp.checar('I4 product_barcodes nao referencia sku', '0',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'product_barcodes'
      and column_name like '%sku%'));

-- =============================================================================
-- RESULTADO
-- =============================================================================
select
  case when passou then 'OK    ' else 'FALHOU' end
    || ' | ' || lpad(n::text, 3) || ' | ' || rpad(cenario, 56)
    || ' | esperado=' || coalesce(esperado,'(null)') || ' obtido=' || coalesce(obtido,'(null)') as resultado
from resultado_teste where not passou
union all
select 'TOTAL: ' || count(*) || ' cenarios | PASSARAM: ' || count(*) filter (where passou)
  || ' | FALHARAM: ' || count(*) filter (where not passou)
from resultado_teste;

rollback;
