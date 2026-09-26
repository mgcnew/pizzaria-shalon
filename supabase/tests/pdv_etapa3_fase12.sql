-- =============================================================================
-- TESTES DO CRUD DO CÓDIGO DE BARRAS — FASE 12 (PDV), ETAPA 3
--
-- 09-PDV-FRENTE-DE-CAIXA.md §2.3, §6.1, §8.2 · 03-RLS-RBAC-SEGURANCA.md §33.2-A
-- CLAUDE.md §33, §34, §37 · Decisão D-2026-09-25-78, item 1
--
-- AS PERGUNTAS QUE ESTE ARQUIVO RESPONDE:
--
-- 1. trocar o primário pode deixar o item SEM primário, ou com DOIS?
-- 2. uma recusa no meio da troca deixa metade gravada?
-- 3. o EAN chega a impedir algo em algum caminho?
-- 4. quem não tem `catalog.manage` consegue escrever por alguma porta?
--
-- O bloco F é o coração: força a recusa DEPOIS do rebaixamento e prova que o
-- primário anterior sobreviveu.
--
-- Os vetores de EAN do bloco A são OS MESMOS de `tests/domain/ean.test.ts`. O
-- dígito verificador existe nos dois lados — SQL para o que a RPC devolve,
-- TypeScript para o aviso enquanto se digita — e a lista compartilhada é o que
-- impede um dos lados de derivar em silêncio.
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
returns void language plpgsql as $h$
begin
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido);
end;
$h$;

-- `execute` dinâmico: plpgsql não guarda plano de comando dinâmico, e foi o
-- plano em cache que, na Etapa 1, fez um teste de permissão medir o papel
-- anterior em vez do corrente.
create or replace function pg_temp.tentar(p_sql text)
returns text language plpgsql as $h$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$h$;

-- Devolve o NOME DO ÍNDICE que barrou. É o discriminador em que as RPCs
-- confiam para distinguir os dois 23505 possíveis; se o Postgres não o
-- preenchesse, as mensagens sairiam trocadas.
create or replace function pg_temp.indice_violado(p_sql text)
returns text language plpgsql as $h$
declare v text;
begin
  execute p_sql;
  return '(nao falhou)';
exception when others then
  get stacked diagnostics v = constraint_name;
  return coalesce(v, '(sem nome)');
end;
$h$;

create or replace function pg_temp.visiveis(p_produto uuid)
returns integer language plpgsql as $h$
declare n integer;
begin
  execute 'select jsonb_array_length(public.codigos_de_barras_do_item($1, null))'
    into n using p_produto;
  return n;
exception when others then
  return -1;
end;
$h$;

-- Quantos primários existem para um alvo. É o invariante que nunca pode passar
-- de um, e é conferido depois de cada mexida.
create or replace function pg_temp.primarios(p_produto uuid)
returns integer language sql as $h$
  select count(*)::integer from public.product_barcodes
   where product_id = p_produto and is_primary;
$h$;

-- AUDITORIA SE LÊ COMO `postgres`, E ISSO É A CORREÇÃO DE UM ERRO DE MEDIÇÃO.
--
-- `audit_logs` tem RLS exigindo `audit.view`, e os papéis desta suíte têm
-- `catalog.manage` mas NÃO têm `audit.view` — é o desenho certo: quem mexe no
-- catálogo não lê a auditoria. A primeira versão destes cenários consultava
-- `audit_logs` direto sob o papel de teste e recebia zero linha, então dez
-- cenários reportaram "não auditou" quando a auditoria estava lá.
--
-- Pior: fazia `B17` e `F7` passarem À TOA, comparando zero com zero. Um teste
-- que não consegue ver o que mede não está medindo nada.
--
-- `security definer` num `pg_temp` pertence ao `postgres`, que tem
-- `rolbypassrls`. A pergunta volta a ser "foi escrito?" em vez de "quem pode
-- ler?" — e essa segunda pergunta ganhou cenário próprio no fim do bloco H.
create or replace function pg_temp.auditorias(p_acao text)
returns integer language sql security definer as $h$
  select count(*)::integer from public.audit_logs where action = p_acao;
$h$;

create or replace function pg_temp.audit_qtd(p_entity uuid, p_acao text)
returns integer language sql security definer as $h$
  select count(*)::integer from public.audit_logs
   where entity_id = p_entity and action = p_acao;
$h$;

create or replace function pg_temp.audit_entidade(p_entity uuid, p_acao text)
returns text language sql security definer as $h$
  select entity_type from public.audit_logs
   where entity_id = p_entity and action = p_acao;
$h$;

create or replace function pg_temp.audit_ator(p_entity uuid, p_acao text)
returns text language sql security definer as $h$
  select actor_user_id::text from public.audit_logs
   where entity_id = p_entity and action = p_acao;
$h$;

create or replace function pg_temp.audit_antes(p_entity uuid, p_acao text, p_chave text)
returns text language sql security definer as $h$
  select before_data ->> p_chave from public.audit_logs
   where entity_id = p_entity and action = p_acao;
$h$;

create or replace function pg_temp.audit_depois(p_entity uuid, p_acao text, p_chave text)
returns text language sql security definer as $h$
  select after_data ->> p_chave from public.audit_logs
   where entity_id = p_entity and action = p_acao;
$h$;

create or replace function pg_temp.audit_motivo(p_entity uuid, p_acao text)
returns text language sql security definer as $h$
  select reason from public.audit_logs
   where entity_id = p_entity and action = p_acao;
$h$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('99999999-bbbb-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gerecat@teste.local','x',now(),now(),now()),
  ('99999999-bbbb-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sove@teste.local','x',now(),now(),now()),
  ('99999999-bbbb-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','semcat@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a3a3a3a3-0000-0000-0000-000000000001','Gerencia catalogo E3','owner',false,'active'),
  ('a3a3a3a3-0000-0000-0000-000000000002','So ve catalogo E3','counter',false,'active'),
  ('a3a3a3a3-0000-0000-0000-000000000003','Sem catalogo E3','counter',false,'active');

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b3b3b3b3-0000-0000-0000-000000000001','99999999-bbbb-1111-1111-111111111111','a3a3a3a3-0000-0000-0000-000000000001',true),
  ('b3b3b3b3-0000-0000-0000-000000000002','99999999-bbbb-2222-2222-222222222222','a3a3a3a3-0000-0000-0000-000000000002',true),
  ('b3b3b3b3-0000-0000-0000-000000000003','99999999-bbbb-3333-3333-333333333333','a3a3a3a3-0000-0000-0000-000000000003',true);

-- Três papéis construídos aqui, e não herdados do seed: view+manage, só view, e
-- nada de catálogo. São eles que provam que `manage` é exigido para escrever e
-- `view` para ler.
insert into public.roles (id, name, description, is_system, is_active) values
  ('c3c3c3c3-0000-0000-0000-00000000000a','Gerencia catalogo E3','ve e gerencia',false,true),
  ('c3c3c3c3-0000-0000-0000-00000000000b','So ve catalogo E3','ve e nao gerencia',false,true),
  ('c3c3c3c3-0000-0000-0000-00000000000c','Sem catalogo E3','nem ve',false,true);

insert into public.role_permissions (role_id, permission_id)
select 'c3c3c3c3-0000-0000-0000-00000000000a', id from public.permissions
 where code in ('catalog.view','catalog.manage','orders.view');
insert into public.role_permissions (role_id, permission_id)
select 'c3c3c3c3-0000-0000-0000-00000000000b', id from public.permissions
 where code in ('catalog.view','orders.view');
insert into public.role_permissions (role_id, permission_id)
select 'c3c3c3c3-0000-0000-0000-00000000000c', id from public.permissions
 where code in ('orders.view');

insert into public.user_roles (app_user_id, role_id) values
  ('b3b3b3b3-0000-0000-0000-000000000001','c3c3c3c3-0000-0000-0000-00000000000a'),
  ('b3b3b3b3-0000-0000-0000-000000000002','c3c3c3c3-0000-0000-0000-00000000000b'),
  ('b3b3b3b3-0000-0000-0000-000000000003','c3c3c3c3-0000-0000-0000-00000000000c');

insert into public.categories (id, name, slug, sort_order)
values ('d3d3d3d3-0000-0000-0000-00000000000c','Cat E3','cat-e3',1);

insert into public.products (id, category_id, product_type, name, slug, base_price) values
  ('d3d3d3d3-0000-0000-0000-000000000001','d3d3d3d3-0000-0000-0000-00000000000c','other','Refri E3','refri-e3',10.00),
  ('d3d3d3d3-0000-0000-0000-000000000002','d3d3d3d3-0000-0000-0000-00000000000c','other','Suco E3','suco-e3',12.00),
  ('d3d3d3d3-0000-0000-0000-0000000000f1','d3d3d3d3-0000-0000-0000-00000000000c','pizza','Pizza E3','pizza-e3',null);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order)
values ('e3e3e3e3-0000-0000-0000-00000000000f','G E3',8,2,1);

insert into public.product_variants (id, product_id, size_id, price)
values ('e3e3e3e3-0000-0000-0000-000000000001','d3d3d3d3-0000-0000-0000-0000000000f1',
        'e3e3e3e3-0000-0000-0000-00000000000f', 50.00);

-- =============================================================================
-- BLOCO A — EAN: AVISAR, NUNCA BLOQUEAR
--
-- Mesmos vetores de `tests/domain/ean.test.ts`.
-- =============================================================================

select pg_temp.checar('A1 EAN-13 valido 7891234567895', 'true',
  public.ean_valido('7891234567895')::text);
select pg_temp.checar('A2 EAN-13 valido 4006381333931', 'true',
  public.ean_valido('4006381333931')::text);
select pg_temp.checar('A3 EAN-13 valido com zeros a esquerda', 'true',
  public.ean_valido('0012345678905')::text);
select pg_temp.checar('A4 EAN-13 degenerado todo zero', 'true',
  public.ean_valido('0000000000000')::text);
select pg_temp.checar('A5 EAN-13 invalido 7891234567890', 'false',
  public.ean_valido('7891234567890')::text);
select pg_temp.checar('A6 EAN-13 invalido 4006381333930', 'false',
  public.ean_valido('4006381333930')::text);
select pg_temp.checar('A7 EAN-8 valido 96385074', 'true',
  public.ean_valido('96385074')::text);
select pg_temp.checar('A8 EAN-8 invalido 96385075', 'false',
  public.ean_valido('96385075')::text);

-- O `null` e o que separa "errado" de "nao se aplica".
select pg_temp.checar('A9 nao-EAN ABC123 responde null', 'NULO',
  coalesce(public.ean_valido('ABC123')::text, 'NULO'));
select pg_temp.checar('A10 nao-EAN SHALON-01 responde null', 'NULO',
  coalesce(public.ean_valido('SHALON-01')::text, 'NULO'));
select pg_temp.checar('A11 cinco digitos nao e EAN', 'NULO',
  coalesce(public.ean_valido('12345')::text, 'NULO'));
select pg_temp.checar('A12 doze digitos nao e EAN', 'NULO',
  coalesce(public.ean_valido('123456789012')::text, 'NULO'));
select pg_temp.checar('A13 AB-12 nao e EAN', 'NULO',
  coalesce(public.ean_valido('AB-12')::text, 'NULO'));
select pg_temp.checar('A14 treze digitos COM hifen nao e EAN', 'NULO',
  coalesce(public.ean_valido('12345678-9012-3')::text, 'NULO'));

select pg_temp.checar('A15 espaco e pontuacao nao atrapalham', 'true',
  public.ean_valido('789 1234 5678 95')::text);
select pg_temp.checar('A16 ponto tambem nao', 'true',
  public.ean_valido('789.123.456.789.5')::text);

-- Consequencia direta da Etapa 2: o hifen sobrevive a normalizacao, entao
-- desqualifica o codigo como EAN. E o comportamento certo.
select pg_temp.checar('A17 hifen desqualifica como EAN', 'NULO',
  coalesce(public.ean_valido('789-123-456-789-5')::text, 'NULO'));

-- Se os zeros fossem descartados, sobrariam 11 digitos e a resposta seria nula.
select pg_temp.checar('A18 zeros a esquerda preservados no julgamento', 'true',
  public.ean_valido('0012345678905')::text);
select pg_temp.checar('A19 o mesmo numero sem os zeros nao e EAN', 'NULO',
  coalesce(public.ean_valido('12345678905')::text, 'NULO'));

select pg_temp.checar('A20 pega troca de um digito', 'false',
  public.ean_valido('7891234567995')::text);
select pg_temp.checar('A21 pega transposicao de vizinhos', 'false',
  public.ean_valido('4006381333391')::text);
select pg_temp.checar('A22 vazio nao e EAN', 'NULO',
  coalesce(public.ean_valido('')::text, 'NULO'));
select pg_temp.checar('A23 nulo nao e EAN', 'NULO',
  coalesce(public.ean_valido(null)::text, 'NULO'));

select pg_temp.checar('A24 aviso existe para EAN que nao fecha', 'true',
  (public.aviso_de_codigo_de_barras('7891234567890') is not null)::text);
select pg_temp.checar('A25 aviso diz quantos digitos leu', 'true',
  (public.aviso_de_codigo_de_barras('7891234567890') like '%13 dígitos%')::text);
select pg_temp.checar('A26 aviso diz que pode salvar', 'true',
  (public.aviso_de_codigo_de_barras('96385075') like '%salvar assim mesmo%')::text);
select pg_temp.checar('A27 EAN correto nao gera aviso', 'NULO',
  coalesce(public.aviso_de_codigo_de_barras('7891234567895'), 'NULO'));
select pg_temp.checar('A28 nao-EAN nao gera aviso', 'NULO',
  coalesce(public.aviso_de_codigo_de_barras('SHALON-01'), 'NULO'));

select pg_temp.checar('A29 ean_valido e IMMUTABLE', 'i',
  (select provolatile::text from pg_proc
    where proname = 'ean_valido' and pronamespace = 'public'::regnamespace));

-- O TESTE QUE IMPEDE O EAN DE VIRAR AUTORIDADE: nenhuma constraint e nenhum
-- indice da tabela pode mencionar a validacao. Se algum dia alguem puser
-- `ean_valido` numa CHECK, este cenario cai.
select pg_temp.checar('A30 nenhuma constraint da tabela usa validacao de EAN', '0',
  (select count(*)::text from pg_constraint
    where conrelid = 'public.product_barcodes'::regclass
      and pg_get_constraintdef(oid) ilike '%ean%'));
select pg_temp.checar('A31 nenhum indice da tabela usa validacao de EAN', '0',
  (select count(*)::text from pg_indexes
    where schemaname='public' and tablename='product_barcodes' and indexdef ilike '%ean%'));

-- =============================================================================
-- BLOCO B — PERMISSÕES
-- =============================================================================

select pg_temp.checar('B1 anon sem execute em cadastrar', 'false',
  has_function_privilege('anon','public.cadastrar_codigo_de_barras(jsonb)','execute')::text);
select pg_temp.checar('B2 anon sem execute em alterar', 'false',
  has_function_privilege('anon','public.alterar_codigo_de_barras(uuid,jsonb)','execute')::text);
select pg_temp.checar('B3 anon sem execute em remover', 'false',
  has_function_privilege('anon','public.remover_codigo_de_barras(uuid,text)','execute')::text);
select pg_temp.checar('B4 anon sem execute em definir primario', 'false',
  has_function_privilege('anon','public.definir_codigo_primario(uuid)','execute')::text);
select pg_temp.checar('B5 anon sem execute na leitura', 'false',
  has_function_privilege('anon','public.codigos_de_barras_do_item(uuid,uuid)','execute')::text);
select pg_temp.checar('B6 PUBLIC sem execute em cadastrar', 'false',
  has_function_privilege('public','public.cadastrar_codigo_de_barras(jsonb)','execute')::text);
select pg_temp.checar('B7 authenticated COM execute em cadastrar', 'true',
  has_function_privilege('authenticated','public.cadastrar_codigo_de_barras(jsonb)','execute')::text);
select pg_temp.checar('B8 authenticated COM execute na leitura', 'true',
  has_function_privilege('authenticated','public.codigos_de_barras_do_item(uuid,uuid)','execute')::text);

-- As internas nao sao alcancaveis NEM por authenticated: rebaixar um primario
-- fora do fluxo completo deixaria o item sem primario sem registrar nada.
select pg_temp.checar('B9 demover_primario e interna, nem authenticated chama', 'false',
  has_function_privilege('authenticated','public.pdv_demover_primario(uuid,uuid,uuid)','execute')::text);
select pg_temp.checar('B10 dono_do_codigo e interna', 'false',
  has_function_privilege('authenticated','public.pdv_dono_do_codigo(text)','execute')::text);

-- ---------------------------------------------------- sem catalog.manage
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-bbbb-2222-2222-222222222222","role":"authenticated"}';

select set_config('teste.b', public.cadastrar_codigo_de_barras(jsonb_build_object(
  'codigo','B0001','produto_id','d3d3d3d3-0000-0000-0000-000000000001'))::text, true);
select pg_temp.checar('B11 so ver NAO cadastra', 'false',
  (current_setting('teste.b')::jsonb ->> 'ok'));
select pg_temp.checar('B12 e o bloqueio e nomeado', 'sem_permissao',
  (current_setting('teste.b')::jsonb ->> 'bloqueio'));
select pg_temp.checar('B13 so ver NAO define primario', 'sem_permissao',
  (public.definir_codigo_primario('00000000-0000-0000-0000-000000000001'::uuid) ->> 'bloqueio'));
select pg_temp.checar('B14 so ver NAO remove', 'sem_permissao',
  (public.remover_codigo_de_barras('00000000-0000-0000-0000-000000000001'::uuid) ->> 'bloqueio'));
select pg_temp.checar('B15 so ver NAO altera', 'sem_permissao',
  (public.alterar_codigo_de_barras('00000000-0000-0000-0000-000000000001'::uuid,
     jsonb_build_object('codigo','B0002')) ->> 'bloqueio'));
select pg_temp.checar('B16 a recusa nao gravou linha nenhuma', '0',
  (select count(*)::text from public.product_barcodes));
select pg_temp.checar('B17 e nao gravou auditoria nenhuma', '0',
  pg_temp.auditorias('codigo_de_barras_cadastrar')::text);

reset role;

-- =============================================================================
-- BLOCO C — CRUD
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-bbbb-1111-1111-111111111111","role":"authenticated"}';

select set_config('teste.c1', public.cadastrar_codigo_de_barras(jsonb_build_object(
  'codigo','7891234567895','produto_id','d3d3d3d3-0000-0000-0000-000000000001'))::text, true);
select pg_temp.checar('C1 com manage cadastra no produto', 'true',
  (current_setting('teste.c1')::jsonb ->> 'ok'));
select pg_temp.checar('C2 e devolve o normalizado do banco', '7891234567895',
  (current_setting('teste.c1')::jsonb ->> 'codigo_normalizado'));
select pg_temp.checar('C3 EAN correto nao veio com aviso', 'NULO',
  coalesce(current_setting('teste.c1')::jsonb ->> 'aviso_ean', 'NULO'));

select pg_temp.checar('C4 cadastra na variante', 'true',
  (public.cadastrar_codigo_de_barras(jsonb_build_object(
    'codigo','96385074','variante_id','e3e3e3e3-0000-0000-0000-000000000001')) ->> 'ok'));

select pg_temp.checar('C5 sem alvo e recusado', 'alvo_invalido',
  (public.cadastrar_codigo_de_barras(jsonb_build_object('codigo','C5000')) ->> 'bloqueio'));
select pg_temp.checar('C6 dois alvos e recusado', 'alvo_invalido',
  (public.cadastrar_codigo_de_barras(jsonb_build_object('codigo','C6000',
    'produto_id','d3d3d3d3-0000-0000-0000-000000000001',
    'variante_id','e3e3e3e3-0000-0000-0000-000000000001')) ->> 'bloqueio'));

-- Mensagem propria em vez de deixar a FK falar em 23503.
select pg_temp.checar('C7 produto inexistente tem mensagem propria', 'alvo_inexistente',
  (public.cadastrar_codigo_de_barras(jsonb_build_object('codigo','C7000',
    'produto_id','00000000-0000-0000-0000-0000000000ff')) ->> 'bloqueio'));
select pg_temp.checar('C8 variante inexistente tem mensagem propria', 'alvo_inexistente',
  (public.cadastrar_codigo_de_barras(jsonb_build_object('codigo','C8000',
    'variante_id','00000000-0000-0000-0000-0000000000fe')) ->> 'bloqueio'));

select pg_temp.checar('C9 codigo curto e recusado com mensagem', 'codigo_invalido',
  (public.cadastrar_codigo_de_barras(jsonb_build_object('codigo','1 2 3',
    'produto_id','d3d3d3d3-0000-0000-0000-000000000001')) ->> 'bloqueio'));
select pg_temp.checar('C10 quatro caracteres uteis e aceito', 'true',
  (public.cadastrar_codigo_de_barras(jsonb_build_object('codigo','C100',
    'produto_id','d3d3d3d3-0000-0000-0000-000000000001')) ->> 'ok'));

-- Codigo interno da casa, que nao e EAN: aceito e SEM aviso.
select set_config('teste.c11', public.cadastrar_codigo_de_barras(jsonb_build_object(
  'codigo','SHALON-01','produto_id','d3d3d3d3-0000-0000-0000-000000000002'))::text, true);
select pg_temp.checar('C11 codigo interno nao-EAN e aceito', 'true',
  (current_setting('teste.c11')::jsonb ->> 'ok'));
select pg_temp.checar('C12 e nao gera aviso nenhum', 'NULO',
  coalesce(current_setting('teste.c11')::jsonb ->> 'aviso_ean', 'NULO'));

-- EAN COM DIGITO ERRADO: SALVA, e avisa. E a decisao aprovada inteira num
-- cenario.
select set_config('teste.c13', public.cadastrar_codigo_de_barras(jsonb_build_object(
  'codigo','7891234567890','produto_id','d3d3d3d3-0000-0000-0000-000000000002'))::text, true);
select pg_temp.checar('C13 EAN invalido e SALVO, nao bloqueado', 'true',
  (current_setting('teste.c13')::jsonb ->> 'ok'));
select pg_temp.checar('C14 e vem com aviso', 'true',
  ((current_setting('teste.c13')::jsonb ->> 'aviso_ean') is not null)::text);
select pg_temp.checar('C15 e a linha existe de fato no banco', '1',
  (select count(*)::text from public.product_barcodes where code_normalized = '7891234567890'));

-- Alterar
select set_config('teste.c16', public.alterar_codigo_de_barras(
  (current_setting('teste.c13')::jsonb ->> 'id')::uuid,
  jsonb_build_object('codigo','7891234567895x'))::text, true);
select pg_temp.checar('C16 altera o texto do codigo', 'true',
  (current_setting('teste.c16')::jsonb ->> 'ok'));
select pg_temp.checar('C17 e o normalizado acompanhou', '7891234567895X',
  (current_setting('teste.c16')::jsonb ->> 'codigo_normalizado'));

-- Mover de alvo NAO e alterar.
select pg_temp.checar('C18 alterar nao move de item', 'alvo_imutavel',
  (public.alterar_codigo_de_barras((current_setting('teste.c13')::jsonb ->> 'id')::uuid,
    jsonb_build_object('produto_id','d3d3d3d3-0000-0000-0000-000000000001')) ->> 'bloqueio'));
select pg_temp.checar('C19 nem por variante', 'alvo_imutavel',
  (public.alterar_codigo_de_barras((current_setting('teste.c13')::jsonb ->> 'id')::uuid,
    jsonb_build_object('variante_id','e3e3e3e3-0000-0000-0000-000000000001')) ->> 'bloqueio'));

select pg_temp.checar('C20 alterar codigo inexistente e recusado', 'nao_encontrado',
  (public.alterar_codigo_de_barras('00000000-0000-0000-0000-0000000000aa'::uuid,
    jsonb_build_object('codigo','C2000')) ->> 'bloqueio'));

-- Remover, e a liberacao do valor
select set_config('teste.c21', public.remover_codigo_de_barras(
  (current_setting('teste.c13')::jsonb ->> 'id')::uuid, 'saiu de linha')::text, true);
select pg_temp.checar('C21 remove', 'true',
  (current_setting('teste.c21')::jsonb ->> 'ok'));
select pg_temp.checar('C22 e diz que nao era remocao repetida', 'false',
  (current_setting('teste.c21')::jsonb ->> 'ja_removido'));
select pg_temp.checar('C23 e diz qual valor ficou livre', '7891234567895X',
  (current_setting('teste.c21')::jsonb ->> 'codigo_liberado'));
select pg_temp.checar('C24 remover de novo e idempotente, nao erro', 'true',
  (public.remover_codigo_de_barras(
    (current_setting('teste.c13')::jsonb ->> 'id')::uuid) ->> 'ja_removido'));
select pg_temp.checar('C25 o valor removido pode ser reusado', 'true',
  (public.cadastrar_codigo_de_barras(jsonb_build_object('codigo','7891234567895X',
    'produto_id','d3d3d3d3-0000-0000-0000-000000000001')) ->> 'ok'));

-- Leitura
select pg_temp.checar('C26 leitura devolve os codigos do produto', '3',
  jsonb_array_length(public.codigos_de_barras_do_item(
    'd3d3d3d3-0000-0000-0000-000000000001'::uuid, null))::text);
select pg_temp.checar('C27 item sem codigo devolve lista vazia', '0',
  jsonb_array_length(public.codigos_de_barras_do_item(
    'd3d3d3d3-0000-0000-0000-0000000000f1'::uuid, null))::text);
select pg_temp.checar('C28 leitura da variante e separada', '1',
  jsonb_array_length(public.codigos_de_barras_do_item(
    null, 'e3e3e3e3-0000-0000-0000-000000000001'::uuid))::text);
select pg_temp.checar('C29 leitura traz o aviso de EAN junto', 'true',
  (public.codigos_de_barras_do_item(null,'e3e3e3e3-0000-0000-0000-000000000001'::uuid)
     -> 0 ? 'aviso_ean')::text);

reset role;

-- =============================================================================
-- BLOCO D — O PRIMÁRIO E A TROCA
--
-- A exigência: trocar o primário NÃO pode obrigar ninguém a apagar o anterior.
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-bbbb-1111-1111-111111111111","role":"authenticated"}';

select set_config('teste.d1', public.cadastrar_codigo_de_barras(jsonb_build_object(
  'codigo','D1000','produto_id','d3d3d3d3-0000-0000-0000-0000000000f1',
  'primario', true))::text, true);
select pg_temp.checar('D1 primeiro primario nao rebaixa ninguem', '0',
  (current_setting('teste.d1')::jsonb ->> 'primarios_demovidos'));
select pg_temp.checar('D2 e o item tem um primario', '1',
  pg_temp.primarios('d3d3d3d3-0000-0000-0000-0000000000f1')::text);

-- O CENARIO QUE A EXIGENCIA DESCREVE: cadastrar outro primario DIRETO, sem
-- apagar o anterior.
select set_config('teste.d3', public.cadastrar_codigo_de_barras(jsonb_build_object(
  'codigo','D2000','produto_id','d3d3d3d3-0000-0000-0000-0000000000f1',
  'primario', true))::text, true);
select pg_temp.checar('D3 cadastrar outro primario FUNCIONA direto', 'true',
  (current_setting('teste.d3')::jsonb ->> 'ok'));
select pg_temp.checar('D4 e rebaixou exatamente um', '1',
  (current_setting('teste.d3')::jsonb ->> 'primarios_demovidos'));
select pg_temp.checar('D5 continua havendo UM primario so', '1',
  pg_temp.primarios('d3d3d3d3-0000-0000-0000-0000000000f1')::text);
select pg_temp.checar('D6 e o novo e quem manda', 'D2000',
  (select code_normalized from public.product_barcodes
    where product_id = 'd3d3d3d3-0000-0000-0000-0000000000f1' and is_primary));
select pg_temp.checar('D7 o anterior continua existindo, so nao e primario', '1',
  (select count(*)::text from public.product_barcodes
    where code_normalized = 'D1000' and not is_primary));

-- Troca explicita pelo id
select set_config('teste.d8', public.definir_codigo_primario(
  (current_setting('teste.d1')::jsonb ->> 'id')::uuid)::text, true);
select pg_temp.checar('D8 definir_codigo_primario troca', 'true',
  (current_setting('teste.d8')::jsonb ->> 'ok'));
select pg_temp.checar('D9 e rebaixou o outro', '1',
  (current_setting('teste.d8')::jsonb ->> 'primarios_demovidos'));
select pg_temp.checar('D10 de novo, UM primario so', '1',
  pg_temp.primarios('d3d3d3d3-0000-0000-0000-0000000000f1')::text);
select pg_temp.checar('D11 e voltou a ser o D1000', 'D1000',
  (select code_normalized from public.product_barcodes
    where product_id = 'd3d3d3d3-0000-0000-0000-0000000000f1' and is_primary));

select pg_temp.checar('D12 definir o que ja e primario e idempotente', 'true',
  (public.definir_codigo_primario(
    (current_setting('teste.d1')::jsonb ->> 'id')::uuid) ->> 'ja_primario'));
select pg_temp.checar('D13 e nao rebaixou ninguem', '1',
  pg_temp.primarios('d3d3d3d3-0000-0000-0000-0000000000f1')::text);

select pg_temp.checar('D14 definir primario de codigo inexistente e recusado', 'nao_encontrado',
  (public.definir_codigo_primario('00000000-0000-0000-0000-0000000000ab'::uuid) ->> 'bloqueio'));

-- Promover por `alterar` tambem rebaixa
select pg_temp.checar('D15 alterar com primario=true promove e rebaixa', '1',
  (public.alterar_codigo_de_barras(
    (current_setting('teste.d3')::jsonb ->> 'id')::uuid,
    jsonb_build_object('primario', true)) ->> 'primarios_demovidos'));
select pg_temp.checar('D16 e o invariante aguenta', '1',
  pg_temp.primarios('d3d3d3d3-0000-0000-0000-0000000000f1')::text);

-- Rebaixar sem promover ninguem e LEGAL: nao existe regra de "pelo menos um".
select pg_temp.checar('D17 rebaixar sozinho e permitido', 'true',
  (public.alterar_codigo_de_barras(
    (current_setting('teste.d3')::jsonb ->> 'id')::uuid,
    jsonb_build_object('primario', false)) ->> 'ok'));
select pg_temp.checar('D18 e o item fica sem primario, o que e valido', '0',
  pg_temp.primarios('d3d3d3d3-0000-0000-0000-0000000000f1')::text);

-- Produto e variante tem primarios independentes
select pg_temp.checar('D19 variante pode ter o proprio primario', 'true',
  (public.definir_codigo_primario(
    (select id from public.product_barcodes
      where variant_id = 'e3e3e3e3-0000-0000-0000-000000000001' limit 1)) ->> 'ok'));
select pg_temp.checar('D20 primario de produto e de variante coexistem', 'true',
  (public.definir_codigo_primario(
    (current_setting('teste.d1')::jsonb ->> 'id')::uuid) ->> 'ok'));

-- VARREDURA FINAL: nenhum alvo do banco com dois primarios.
select pg_temp.checar('D21 nenhum produto com dois primarios', '0',
  (select count(*)::text from (
    select product_id from public.product_barcodes
     where is_primary and product_id is not null
     group by product_id having count(*) > 1) x));
select pg_temp.checar('D22 nenhuma variante com dois primarios', '0',
  (select count(*)::text from (
    select variant_id from public.product_barcodes
     where is_primary and variant_id is not null
     group by variant_id having count(*) > 1) x));

reset role;

-- =============================================================================
-- BLOCO E — DUPLICIDADE
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-bbbb-1111-1111-111111111111","role":"authenticated"}';

select set_config('teste.e1', public.cadastrar_codigo_de_barras(jsonb_build_object(
  'codigo','7891234567895','produto_id','d3d3d3d3-0000-0000-0000-000000000002'))::text, true);
select pg_temp.checar('E1 mesmo codigo em outro produto e recusado', 'codigo_duplicado',
  (current_setting('teste.e1')::jsonb ->> 'bloqueio'));

-- Saber que "ja existe" nao ajuda; saber ONDE esta resolve.
select pg_temp.checar('E2 a mensagem NOMEIA o item dono', 'true',
  ((current_setting('teste.e1')::jsonb ->> 'erro') like '%Refri E3%')::text);

select pg_temp.checar('E3 escrito diferente TAMBEM colide', 'codigo_duplicado',
  (public.cadastrar_codigo_de_barras(jsonb_build_object(
    'codigo','  789 1234 5678 95  ','produto_id','d3d3d3d3-0000-0000-0000-000000000002'))
   ->> 'bloqueio'));

select pg_temp.checar('E4 codigo de produto colide com o de variante', 'codigo_duplicado',
  (public.cadastrar_codigo_de_barras(jsonb_build_object(
    'codigo','96385074','produto_id','d3d3d3d3-0000-0000-0000-000000000002'))
   ->> 'bloqueio'));
select pg_temp.checar('E5 e a mensagem nomeia a VARIANTE', 'true',
  ((public.cadastrar_codigo_de_barras(jsonb_build_object(
    'codigo','96385074','produto_id','d3d3d3d3-0000-0000-0000-000000000002')) ->> 'erro')
   like '%variação Pizza E3%')::text);

select pg_temp.checar('E6 zeros a esquerda NAO colidem', 'true',
  (public.cadastrar_codigo_de_barras(jsonb_build_object(
    'codigo','07891234567895','produto_id','d3d3d3d3-0000-0000-0000-000000000002'))
   ->> 'ok'));

select pg_temp.checar('E7 alterar para um codigo ja usado e recusado', 'codigo_duplicado',
  (public.alterar_codigo_de_barras(
    (select id from public.product_barcodes where code_normalized = 'SHALON-01'),
    jsonb_build_object('codigo','7891234567895')) ->> 'bloqueio'));
select pg_temp.checar('E8 e a linha original ficou intacta', '1',
  (select count(*)::text from public.product_barcodes where code_normalized = 'SHALON-01'));

reset role;

-- =============================================================================
-- BLOCO F — FALHAS SEM ESTADO PARCIAL
--
-- O CORAÇÃO DESTA ETAPA. Cadastrar um primário rebaixa o anterior ANTES de
-- inserir. Se a inserção falhar, o rebaixamento tem de desaparecer — senão o
-- item fica SEM primário por causa de uma operação que foi recusada.
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-bbbb-1111-1111-111111111111","role":"authenticated"}';

-- Estado de partida: Suco E3 com um primário conhecido.
select set_config('teste.f0', public.cadastrar_codigo_de_barras(jsonb_build_object(
  'codigo','F0001','produto_id','d3d3d3d3-0000-0000-0000-000000000002',
  'primario', true))::text, true);
select pg_temp.checar('F1 fixture: Suco E3 tem primario F0001', 'F0001',
  (select code_normalized from public.product_barcodes
    where product_id = 'd3d3d3d3-0000-0000-0000-000000000002' and is_primary));
select set_config('teste.f_linhas',
  (select count(*)::text from public.product_barcodes
    where product_id = 'd3d3d3d3-0000-0000-0000-000000000002'), true);
select set_config('teste.f_audit', pg_temp.auditorias('codigo_de_barras_cadastrar')::text, true);

-- A OPERAÇÃO QUE FALHA NO MEIO: primário novo com um código que já existe
-- noutro item. O rebaixamento acontece, a inserção bate no índice de unicidade.
select set_config('teste.f2', public.cadastrar_codigo_de_barras(jsonb_build_object(
  'codigo','7891234567895','produto_id','d3d3d3d3-0000-0000-0000-000000000002',
  'primario', true))::text, true);

select pg_temp.checar('F2 a operacao e recusada', 'false',
  (current_setting('teste.f2')::jsonb ->> 'ok'));
select pg_temp.checar('F3 pelo motivo certo', 'codigo_duplicado',
  (current_setting('teste.f2')::jsonb ->> 'bloqueio'));

-- AS TRES AFIRMACOES QUE IMPORTAM.
select pg_temp.checar('F4 o primario ANTERIOR sobreviveu', 'F0001',
  (select code_normalized from public.product_barcodes
    where product_id = 'd3d3d3d3-0000-0000-0000-000000000002' and is_primary));
select pg_temp.checar('F5 o item NAO ficou sem primario', '1',
  pg_temp.primarios('d3d3d3d3-0000-0000-0000-000000000002')::text);
select pg_temp.checar('F6 nenhuma linha nova foi criada', current_setting('teste.f_linhas'),
  (select count(*)::text from public.product_barcodes
    where product_id = 'd3d3d3d3-0000-0000-0000-000000000002'));
select pg_temp.checar('F7 nenhuma auditoria de cadastro ficou',
  current_setting('teste.f_audit'), pg_temp.auditorias('codigo_de_barras_cadastrar')::text);

-- O MESMO pela porta do `alterar`: promover uma linha e trocar o texto para um
-- codigo ja usado. Rebaixa, falha, e tem de desfazer.
select set_config('teste.f8', public.cadastrar_codigo_de_barras(jsonb_build_object(
  'codigo','F0002','produto_id','d3d3d3d3-0000-0000-0000-000000000002'))::text, true);
select pg_temp.checar('F8 fixture: segundo codigo, nao primario', 'false',
  (current_setting('teste.f8')::jsonb ->> 'primario'));

select pg_temp.checar('F9 alterar promovendo COM codigo duplicado e recusado', 'codigo_duplicado',
  (public.alterar_codigo_de_barras((current_setting('teste.f8')::jsonb ->> 'id')::uuid,
    jsonb_build_object('codigo','7891234567895','primario', true)) ->> 'bloqueio'));
select pg_temp.checar('F10 o primario anterior AINDA e F0001', 'F0001',
  (select code_normalized from public.product_barcodes
    where product_id = 'd3d3d3d3-0000-0000-0000-000000000002' and is_primary));
select pg_temp.checar('F11 e continua havendo um primario so', '1',
  pg_temp.primarios('d3d3d3d3-0000-0000-0000-000000000002')::text);
select pg_temp.checar('F12 a linha que ia ser promovida ficou como estava', 'F0002',
  (select code_normalized from public.product_barcodes
    where id = (current_setting('teste.f8')::jsonb ->> 'id')::uuid and not is_primary));

reset role;

-- =============================================================================
-- BLOCO G — CONCORRÊNCIA: O QUE SEGURA A CORRIDA
--
-- Duas sessões simultâneas não são reproduzíveis dentro de uma transação. O que
-- se prova aqui é o mecanismo de que a corrida depende: o índice parcial recusa
-- o segundo primário, e o Postgres informa QUAL índice — que é o discriminador
-- em que as RPCs confiam para escolher a mensagem.
-- =============================================================================

select pg_temp.checar('G1 segundo primario direto no banco e recusado', '23505',
  pg_temp.tentar($q$
    insert into public.product_barcodes (code, product_id, is_primary)
    values ('G1000', 'd3d3d3d3-0000-0000-0000-000000000002', true)$q$));

-- Sem este nome preenchido, as RPCs mostrariam a mensagem errada.
select pg_temp.checar('G2 e o Postgres informa o indice do PRIMARIO',
  'product_barcodes_primario_produto',
  pg_temp.indice_violado($q$
    insert into public.product_barcodes (code, product_id, is_primary)
    values ('G2000', 'd3d3d3d3-0000-0000-0000-000000000002', true)$q$));

select pg_temp.checar('G3 e o indice do CODIGO quando e duplicidade',
  'product_barcodes_codigo',
  pg_temp.indice_violado($q$
    insert into public.product_barcodes (code, product_id)
    values ('7891234567895', 'd3d3d3d3-0000-0000-0000-000000000002')$q$));

select pg_temp.checar('G4 os dois indices sao distinguiveis', 'true',
  (pg_temp.indice_violado($q$
     insert into public.product_barcodes (code, product_id, is_primary)
     values ('G4000', 'd3d3d3d3-0000-0000-0000-000000000002', true)$q$)
   <> pg_temp.indice_violado($q$
     insert into public.product_barcodes (code, product_id)
     values ('7891234567895', 'd3d3d3d3-0000-0000-0000-000000000002')$q$))::text);

select pg_temp.checar('G5 variante tem indice proprio, nao conflita com produto',
  'product_barcodes_primario_variante',
  pg_temp.indice_violado($q$
    insert into public.product_barcodes (code, variant_id, is_primary)
    values ('G5000', 'e3e3e3e3-0000-0000-0000-000000000001', true)$q$));

-- =============================================================================
-- BLOCO H — AUDITORIA
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-bbbb-1111-1111-111111111111","role":"authenticated"}';

select set_config('teste.h1', public.cadastrar_codigo_de_barras(jsonb_build_object(
  'codigo','H1000','produto_id','d3d3d3d3-0000-0000-0000-000000000001',
  'motivo','entrou no mix'))::text, true);

select pg_temp.checar('H1 cadastrar registra auditoria', '1',
  pg_temp.audit_qtd((current_setting('teste.h1')::jsonb ->> 'id')::uuid,
                    'codigo_de_barras_cadastrar')::text);
select pg_temp.checar('H2 na entidade certa', 'product_barcodes',
  pg_temp.audit_entidade((current_setting('teste.h1')::jsonb ->> 'id')::uuid,
                         'codigo_de_barras_cadastrar'));
select pg_temp.checar('H3 com o ator identificado', 'b3b3b3b3-0000-0000-0000-000000000001',
  pg_temp.audit_ator((current_setting('teste.h1')::jsonb ->> 'id')::uuid,
                     'codigo_de_barras_cadastrar'));
select pg_temp.checar('H4 com o normalizado no depois', 'H1000',
  pg_temp.audit_depois((current_setting('teste.h1')::jsonb ->> 'id')::uuid,
                       'codigo_de_barras_cadastrar', 'codigo_normalizado'));
select pg_temp.checar('H5 e o motivo guardado', 'entrou no mix',
  pg_temp.audit_motivo((current_setting('teste.h1')::jsonb ->> 'id')::uuid,
                       'codigo_de_barras_cadastrar'));

-- Alterar guarda ANTES e DEPOIS: sem os dois, a leitura nao mostra o que mudou.
select pg_temp.checar('H6 alterar registra auditoria', 'true',
  (public.alterar_codigo_de_barras((current_setting('teste.h1')::jsonb ->> 'id')::uuid,
    jsonb_build_object('codigo','H1001','motivo','erro de digitacao')) ->> 'ok'));
select pg_temp.checar('H7 com o valor ANTERIOR', 'H1000',
  pg_temp.audit_antes((current_setting('teste.h1')::jsonb ->> 'id')::uuid,
                      'codigo_de_barras_alterar', 'codigo_normalizado'));
select pg_temp.checar('H8 e o NOVO', 'H1001',
  pg_temp.audit_depois((current_setting('teste.h1')::jsonb ->> 'id')::uuid,
                       'codigo_de_barras_alterar', 'codigo_normalizado'));

-- Primario anterior de proposito: sem ele a troca rebaixaria zero e o cenario
-- seguinte nao provaria nada.
select public.definir_codigo_primario(
  (select id from public.product_barcodes where code_normalized = 'C100'));

select pg_temp.checar('H9 trocar primario registra auditoria', 'true',
  (public.definir_codigo_primario((current_setting('teste.h1')::jsonb ->> 'id')::uuid) ->> 'ok'));
select pg_temp.checar('H10 dizendo quantos rebaixou', '1',
  pg_temp.audit_depois((current_setting('teste.h1')::jsonb ->> 'id')::uuid,
                       'codigo_de_barras_primario', 'primarios_demovidos'));

-- A auditoria da REMOCAO e a unica memoria de que o codigo existiu (§28).
select pg_temp.checar('H11 remover registra auditoria', 'true',
  (public.remover_codigo_de_barras((current_setting('teste.h1')::jsonb ->> 'id')::uuid,
    'saiu do mix') ->> 'ok'));
select pg_temp.checar('H12 com o codigo que deixou de existir', 'H1001',
  pg_temp.audit_antes((current_setting('teste.h1')::jsonb ->> 'id')::uuid,
                      'codigo_de_barras_remover', 'codigo_normalizado'));
select pg_temp.checar('H13 e o motivo', 'saiu do mix',
  pg_temp.audit_motivo((current_setting('teste.h1')::jsonb ->> 'id')::uuid,
                       'codigo_de_barras_remover'));
select pg_temp.checar('H14 a linha realmente sumiu', '0',
  (select count(*)::text from public.product_barcodes
    where id = (current_setting('teste.h1')::jsonb ->> 'id')::uuid));

-- O ERRO QUE ESTES CENARIOS COMETERAM NA PRIMEIRA VERSAO, agora afirmado de
-- proposito: quem gerencia o catalogo NAO le a auditoria. E por isso que os
-- cenarios acima leem por funcao `security definer`, e nao direto.
select pg_temp.checar('H15 quem tem catalog.manage NAO enxerga audit_logs', '0',
  (select count(*)::text from public.audit_logs
    where action = 'codigo_de_barras_cadastrar'));
select pg_temp.checar('H16 mas as linhas existem de verdade', 'true',
  (pg_temp.auditorias('codigo_de_barras_cadastrar') > 0)::text);

reset role;

-- Recusa nao e evento: nao aconteceu nada para auditar.
select set_config('teste.h17', pg_temp.auditorias('codigo_de_barras_cadastrar')::text, true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-bbbb-1111-1111-111111111111","role":"authenticated"}';
select public.cadastrar_codigo_de_barras(jsonb_build_object(
  'codigo','7891234567895','produto_id','d3d3d3d3-0000-0000-0000-000000000002'));
reset role;
select pg_temp.checar('H17 a contagem de auditoria nao mudou com a recusa',
  current_setting('teste.h17'), pg_temp.auditorias('codigo_de_barras_cadastrar')::text);

-- =============================================================================
-- BLOCO I — O QUE A ETAPA 3 NÃO PODE TER MEXIDO
-- =============================================================================

select pg_temp.checar('I1 RLS segue habilitado e forcado', 'true/true',
  (select relrowsecurity::text || '/' || relforcerowsecurity::text
     from pg_class where oid = 'public.product_barcodes'::regclass));
select pg_temp.checar('I2 seguem quatro policies', '4',
  (select count(*)::text from pg_policies
    where schemaname='public' and tablename='product_barcodes'));
select pg_temp.checar('I3 anon segue sem privilegio na tabela', 'false',
  has_table_privilege('anon','public.product_barcodes','select')::text);
select pg_temp.checar('I4 PUBLIC segue sem privilegio', 'false',
  has_table_privilege('public','public.product_barcodes','select')::text);
select pg_temp.checar('I5 sku continua text e nulavel', 'text/YES',
  (select data_type || '/' || is_nullable from information_schema.columns
    where table_schema='public' and table_name='product_variants' and column_name='sku'));
select pg_temp.checar('I6 nenhum indice sobre sku', '0',
  (select count(*)::text from pg_indexes
    where schemaname='public' and tablename='product_variants' and indexdef like '%sku%'));
select pg_temp.checar('I7 nenhuma funcao nova menciona sku', '0',
  (select count(*)::text from pg_proc
    where pronamespace='public'::regnamespace
      and proname in ('cadastrar_codigo_de_barras','alterar_codigo_de_barras',
                      'remover_codigo_de_barras','definir_codigo_primario',
                      'codigos_de_barras_do_item','ean_valido')
      and prosrc ilike '%sku%'));
select pg_temp.checar('I8 a normalizacao nao foi redefinida pela Etapa 3', 'i',
  (select provolatile::text from pg_proc
    where proname = 'normalizar_codigo_de_barras' and pronamespace='public'::regnamespace));
select pg_temp.checar('I9 nenhuma linha divergente do normalizado', '0',
  (select count(*)::text from public.product_barcodes
    where code_normalized <> public.normalizar_codigo_de_barras(code)));

-- ---------------------------------------------------------- leitura e RLS
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-bbbb-2222-2222-222222222222","role":"authenticated"}';
select pg_temp.checar('I10 com catalog.view a leitura funciona', 'true',
  (pg_temp.visiveis('d3d3d3d3-0000-0000-0000-000000000001'::uuid) > 0)::text);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-bbbb-3333-3333-333333333333","role":"authenticated"}';
-- Zero, e nao erro: o privilegio existe, a policy e que nao deixa passar linha.
select pg_temp.checar('I11 sem catalog.view a leitura devolve vazio', '0',
  pg_temp.visiveis('d3d3d3d3-0000-0000-0000-000000000001'::uuid)::text);
reset role;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
-- -1 = privilegio negado, que e diferente de ver zero linha.
select pg_temp.checar('I12 anon nem executa a leitura', '-1',
  pg_temp.visiveis('d3d3d3d3-0000-0000-0000-000000000001'::uuid)::text);
reset role;

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
