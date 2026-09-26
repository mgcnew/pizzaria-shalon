-- =============================================================================
-- RESOLUÇÃO DE CÓDIGO E BUSCA DO PDV — FASE 12, ETAPA 4
--
-- 09-PDV-FRENTE-DE-CAIXA.md §2.1, §2.3, §6.1, §6.4 · D-2026-09-25-78
--
-- AS PERGUNTAS QUE ESTE ARQUIVO RESPONDE:
--
-- 1. um bipe pode escolher um tamanho sozinho? (bloco C — não pode)
-- 2. um código inexistente pode virar item fantasma? (bloco D — não pode)
-- 3. item inativo some ou aparece com bandeira? (bloco E — aparece)
-- 4. a resolução usa a MESMA normalização do cadastro? (bloco F)
-- 5. `anon` ganhou alguma coisa? (bloco G — não)
-- 6. `buscar_catalogo` pública continua intocada? (bloco I — regressão)
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
begin insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido); end; $h$;

-- Resolve e devolve o jsonb. `execute` dinâmico pelo mesmo motivo das etapas
-- anteriores: plano em cache não revalida privilégio e faria o bloco G medir o
-- papel errado.
create or replace function pg_temp.resolver(p_codigo text)
returns jsonb language plpgsql as $h$
declare v jsonb;
begin
  execute 'select public.resolver_codigo_de_barras($1)' into v using p_codigo;
  return v;
exception when others then
  return jsonb_build_object('EXCECAO', sqlstate);
end; $h$;

create or replace function pg_temp.buscar(p_termo text)
returns integer language plpgsql as $h$
declare n integer;
begin
  execute 'select count(*) from public.buscar_catalogo_pdv($1)' into n using p_termo;
  return n;
exception when others then return -1;
end; $h$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('99999999-cccc-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vecat4@teste.local','x',now(),now(),now()),
  ('99999999-cccc-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','semcat4@teste.local','x',now(),now(),now());

insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a4a4a4a4-0000-0000-0000-000000000001','Ve catalogo E4','owner',false,'active'),
  ('a4a4a4a4-0000-0000-0000-000000000002','Sem catalogo E4','counter',false,'active');

insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b4b4b4b4-0000-0000-0000-000000000001','99999999-cccc-1111-1111-111111111111','a4a4a4a4-0000-0000-0000-000000000001',true),
  ('b4b4b4b4-0000-0000-0000-000000000002','99999999-cccc-2222-2222-222222222222','a4a4a4a4-0000-0000-0000-000000000002',true);

insert into public.roles (id, name, description, is_system, is_active) values
  ('c4c4c4c4-0000-0000-0000-00000000000a','Ve catalogo E4','ve e gerencia',false,true),
  ('c4c4c4c4-0000-0000-0000-00000000000b','Sem catalogo E4','nem ve',false,true);

insert into public.role_permissions (role_id, permission_id)
select 'c4c4c4c4-0000-0000-0000-00000000000a', id from public.permissions
 where code in ('catalog.view','catalog.manage','orders.view');
insert into public.role_permissions (role_id, permission_id)
select 'c4c4c4c4-0000-0000-0000-00000000000b', id from public.permissions where code in ('orders.view');

insert into public.user_roles (app_user_id, role_id) values
  ('b4b4b4b4-0000-0000-0000-000000000001','c4c4c4c4-0000-0000-0000-00000000000a'),
  ('b4b4b4b4-0000-0000-0000-000000000002','c4c4c4c4-0000-0000-0000-00000000000b');

-- Duas categorias: uma normal e uma PAUSADA, para provar RN-DISP-004 pelo
-- caminho da resolução.
insert into public.categories (id, name, slug, sort_order, is_temporarily_available) values
  ('d4d4d4d4-0000-0000-0000-0000000000ca','Bebidas E4','bebidas-e4',1,true),
  ('d4d4d4d4-0000-0000-0000-0000000000cb','Pausada E4','pausada-e4',2,false);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('e4e4e4e4-0000-0000-0000-0000000000a1','Broto E4',4,1,1),
  ('e4e4e4e4-0000-0000-0000-0000000000a2','Grande E4',8,2,2);

insert into public.products (id, category_id, product_type, name, slug, base_price,
                             is_active, is_temporarily_available, short_description) values
  -- simples: bipa e entra
  ('d4d4d4d4-0000-0000-0000-000000000001','d4d4d4d4-0000-0000-0000-0000000000ca','drink',
   'Refrigerante Limão E4','refri-limao-e4',10.00,true,true,'Gelado e cítrico'),
  -- com variantes ativas: bipar o produto NÃO pode escolher tamanho
  ('d4d4d4d4-0000-0000-0000-000000000002','d4d4d4d4-0000-0000-0000-0000000000ca','pizza',
   'Pizza Calabresa E4','pizza-calabresa-e4',null,true,true,null),
  -- com variantes TODAS INATIVAS: resolve direto para o produto
  ('d4d4d4d4-0000-0000-0000-000000000003','d4d4d4d4-0000-0000-0000-0000000000ca','pizza',
   'Pizza Aposentada E4','pizza-aposentada-e4',33.00,true,true,null),
  -- cadastro inativo
  ('d4d4d4d4-0000-0000-0000-000000000004','d4d4d4d4-0000-0000-0000-0000000000ca','drink',
   'Suco Descontinuado E4','suco-desc-e4',9.00,false,true,null),
  -- ativo, mas indisponível hoje
  ('d4d4d4d4-0000-0000-0000-000000000005','d4d4d4d4-0000-0000-0000-0000000000ca','drink',
   'Agua Acabou E4','agua-acabou-e4',5.00,true,false,null),
  -- em categoria pausada
  ('d4d4d4d4-0000-0000-0000-000000000006','d4d4d4d4-0000-0000-0000-0000000000cb','drink',
   'Cha da Pausada E4','cha-pausada-e4',7.00,true,true,null);

insert into public.product_variants (id, product_id, size_id, price, is_active) values
  ('f4f4f4f4-0000-0000-0000-000000000001','d4d4d4d4-0000-0000-0000-000000000002','e4e4e4e4-0000-0000-0000-0000000000a1',35.00,true),
  ('f4f4f4f4-0000-0000-0000-000000000002','d4d4d4d4-0000-0000-0000-000000000002','e4e4e4e4-0000-0000-0000-0000000000a2',60.00,true),
  -- inativa: não é oferta, não entra em lista nenhuma
  ('f4f4f4f4-0000-0000-0000-000000000003','d4d4d4d4-0000-0000-0000-000000000003','e4e4e4e4-0000-0000-0000-0000000000a2',50.00,false);

-- Promoção vigente na variante Grande: 60,00 -> 49,90.
insert into public.promotions (id, name, target_type, variant_id, promotional_price, starts_at, ends_at)
values ('11114444-0000-0000-0000-000000000001','Grande em promo E4','variant',
        'f4f4f4f4-0000-0000-0000-000000000002', 49.90, now() - interval '1 day', now() + interval '7 days');

-- `sku` preenchido com um valor que NÃO é código de barras. O bloco G prova
-- que ele continua sem participar de nada.
update public.product_variants set sku = 'SKU-FORNECEDOR-777'
 where id = 'f4f4f4f4-0000-0000-0000-000000000001';

-- Códigos. Cadastrados direto para não depender das RPCs da Etapa 3.
insert into public.product_barcodes (code, product_id, variant_id, is_primary) values
  ('7891234567895','d4d4d4d4-0000-0000-0000-000000000001',null,true),   -- simples
  ('0012345678905','d4d4d4d4-0000-0000-0000-000000000001',null,false),  -- zeros a esquerda
  ('12345678905',  'd4d4d4d4-0000-0000-0000-000000000005',null,false),  -- o mesmo sem os zeros
  ('PIZZA-CAL',    'd4d4d4d4-0000-0000-0000-000000000002',null,true),   -- produto COM variante ativa
  ('96385074',     null,'f4f4f4f4-0000-0000-0000-000000000002',true),   -- variante Grande
  ('VAR-INATIVA',  null,'f4f4f4f4-0000-0000-0000-000000000003',true),   -- variante inativa
  ('APOSENTADA',   'd4d4d4d4-0000-0000-0000-000000000003',null,true),   -- variantes todas inativas
  ('DESCONT',      'd4d4d4d4-0000-0000-0000-000000000004',null,true),   -- produto inativo
  ('ACABOU',       'd4d4d4d4-0000-0000-0000-000000000005',null,true),   -- indisponivel hoje
  ('CHAPAUSA',     'd4d4d4d4-0000-0000-0000-000000000006',null,true);   -- categoria pausada

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-cccc-1111-1111-111111111111","role":"authenticated"}';

-- =============================================================================
-- BLOCO A — CÓDIGO DE VARIANTE RESOLVE DIRETO PARA A VARIANTE
-- =============================================================================
select set_config('teste.a', pg_temp.resolver('96385074')::text, true);

select pg_temp.checar('A1 encontrou', 'true', (current_setting('teste.a')::jsonb ->> 'encontrado'));
select pg_temp.checar('A2 o alvo e a VARIANTE', 'variante', (current_setting('teste.a')::jsonb ->> 'alvo'));
select pg_temp.checar('A3 nao precisa escolher nada', 'false',
  (current_setting('teste.a')::jsonb ->> 'precisa_escolher_variante'));
select pg_temp.checar('A4 devolve a variante certa', 'f4f4f4f4-0000-0000-0000-000000000002',
  (current_setting('teste.a')::jsonb ->> 'variante_id'));
select pg_temp.checar('A5 e o produto dono dela', 'd4d4d4d4-0000-0000-0000-000000000002',
  (current_setting('teste.a')::jsonb ->> 'produto_id'));
select pg_temp.checar('A6 com o nome do tamanho', 'Grande E4',
  (current_setting('teste.a')::jsonb ->> 'tamanho_nome'));
-- Preço EFETIVO, não o de tabela: a promoção vigente manda (CLAUDE.md §16).
select pg_temp.checar('A7 o preco e o EFETIVO, com a promocao', '49.90',
  (current_setting('teste.a')::jsonb ->> 'preco'));
select pg_temp.checar('A8 e o de tabela vem junto, para mostrar o de/por', '60.00',
  (current_setting('teste.a')::jsonb ->> 'preco_de'));
select pg_temp.checar('A9 marcado como promocao', 'true',
  (current_setting('teste.a')::jsonb ->> 'em_promocao'));
select pg_temp.checar('A10 disponivel', 'true', (current_setting('teste.a')::jsonb ->> 'disponivel'));
select pg_temp.checar('A11 ativo', 'true', (current_setting('teste.a')::jsonb ->> 'ativo'));
-- Não há escolha a fazer, então não há lista a oferecer.
select pg_temp.checar('A12 NAO devolve lista de variantes', 'false',
  (current_setting('teste.a')::jsonb ? 'variantes')::text);
select pg_temp.checar('A13 traz o tamanho para o configurador nao precisar', '8',
  (current_setting('teste.a')::jsonb ->> 'fatias'));

-- =============================================================================
-- BLOCO B — CÓDIGO DE PRODUTO SEM VARIANTE ATIVA RESOLVE DIRETO
-- =============================================================================
select set_config('teste.b', pg_temp.resolver('7891234567895')::text, true);

select pg_temp.checar('B1 encontrou', 'true', (current_setting('teste.b')::jsonb ->> 'encontrado'));
select pg_temp.checar('B2 o alvo e o PRODUTO', 'produto', (current_setting('teste.b')::jsonb ->> 'alvo'));
select pg_temp.checar('B3 nao precisa escolher', 'false',
  (current_setting('teste.b')::jsonb ->> 'precisa_escolher_variante'));
select pg_temp.checar('B4 devolve o produto certo', 'd4d4d4d4-0000-0000-0000-000000000001',
  (current_setting('teste.b')::jsonb ->> 'produto_id'));
select pg_temp.checar('B5 com preco', '10.00', (current_setting('teste.b')::jsonb ->> 'preco'));
select pg_temp.checar('B6 disponivel', 'true', (current_setting('teste.b')::jsonb ->> 'disponivel'));
-- Produto simples não tem variante nenhuma para escolher.
select pg_temp.checar('B7 sem variante_id no topo', 'false',
  (current_setting('teste.b')::jsonb ? 'variante_id')::text);
select pg_temp.checar('B8 sem lista de variantes', 'false',
  (current_setting('teste.b')::jsonb ? 'variantes')::text);

-- Produto cujas variantes estão TODAS INATIVAS: a palavra do §2.3 é "ativa",
-- então não há escolha a fazer e ele resolve direto.
select set_config('teste.b2', pg_temp.resolver('APOSENTADA')::text, true);
select pg_temp.checar('B9 variantes todas inativas: resolve DIRETO', 'false',
  (current_setting('teste.b2')::jsonb ->> 'precisa_escolher_variante'));
select pg_temp.checar('B10 e o alvo e o produto', 'produto',
  (current_setting('teste.b2')::jsonb ->> 'alvo'));
select pg_temp.checar('B11 com o preco base do produto', '33.00',
  (current_setting('teste.b2')::jsonb ->> 'preco'));

-- =============================================================================
-- BLOCO C — PRODUTO COM VARIANTE ATIVA: PRECISA ESCOLHER, E NÃO ESCOLHE
--
-- O bloco mais importante. Escolher um tamanho sozinho seria decidir preço no
-- lugar da pessoa, em cima de dinheiro.
-- =============================================================================
select set_config('teste.c', pg_temp.resolver('PIZZA-CAL')::text, true);

select pg_temp.checar('C1 encontrou', 'true', (current_setting('teste.c')::jsonb ->> 'encontrado'));
select pg_temp.checar('C2 o alvo e o produto', 'produto', (current_setting('teste.c')::jsonb ->> 'alvo'));
select pg_temp.checar('C3 PRECISA ESCOLHER', 'true',
  (current_setting('teste.c')::jsonb ->> 'precisa_escolher_variante'));

-- AS TRES AFIRMACOES QUE IMPEDEM A ESCOLHA AUTOMATICA.
select pg_temp.checar('C4 NAO escolheu variante', 'false',
  (current_setting('teste.c')::jsonb ? 'variante_id')::text);
select pg_temp.checar('C5 NAO escolheu tamanho', 'false',
  (current_setting('teste.c')::jsonb ? 'tamanho_id')::text);
select pg_temp.checar('C6 NAO inventou preco', 'false',
  (current_setting('teste.c')::jsonb ? 'preco')::text);

select pg_temp.checar('C7 devolve a lista para o configurador', 'true',
  (current_setting('teste.c')::jsonb ? 'variantes')::text);
select pg_temp.checar('C8 com as duas variantes ativas', '2',
  jsonb_array_length(current_setting('teste.c')::jsonb -> 'variantes')::text);
select pg_temp.checar('C9 ordenadas por tamanho: o broto primeiro', 'Broto E4',
  (current_setting('teste.c')::jsonb -> 'variantes' -> 0 ->> 'tamanho_nome'));
select pg_temp.checar('C10 cada uma com id', 'f4f4f4f4-0000-0000-0000-000000000001',
  (current_setting('teste.c')::jsonb -> 'variantes' -> 0 ->> 'id'));
select pg_temp.checar('C11 e com preco efetivo', '35.00',
  (current_setting('teste.c')::jsonb -> 'variantes' -> 0 ->> 'preco'));
select pg_temp.checar('C12 a grande vem com o preco promocional', '49.90',
  (current_setting('teste.c')::jsonb -> 'variantes' -> 1 ->> 'preco'));
select pg_temp.checar('C13 e marcada como promocao', 'true',
  (current_setting('teste.c')::jsonb -> 'variantes' -> 1 ->> 'em_promocao'));
select pg_temp.checar('C14 o produto continua identificado', 'd4d4d4d4-0000-0000-0000-000000000002',
  (current_setting('teste.c')::jsonb ->> 'produto_id'));

-- Variante inativa não entra na lista: não é oferta.
select pg_temp.checar('C15 variante inativa nao aparece na lista', '0',
  (select count(*)::text from jsonb_array_elements(current_setting('teste.c')::jsonb -> 'variantes') v
    where v ->> 'id' = 'f4f4f4f4-0000-0000-0000-000000000003'));

-- =============================================================================
-- BLOCO D — CÓDIGO INEXISTENTE: RESULTADO EXPLÍCITO, SEM ITEM FANTASMA
-- =============================================================================
select set_config('teste.d', pg_temp.resolver('NAOEXISTE-999')::text, true);

select pg_temp.checar('D1 nao encontrou', 'false', (current_setting('teste.d')::jsonb ->> 'encontrado'));
-- Não é erro: é uma resposta. O PDV cai na busca por nome (§2.1).
select pg_temp.checar('D2 e isso NAO e erro', 'true', (current_setting('teste.d')::jsonb ->> 'ok'));
select pg_temp.checar('D3 devolve o que procurou, normalizado', 'NAOEXISTE-999',
  (current_setting('teste.d')::jsonb ->> 'codigo_normalizado'));

-- NADA DE ITEM FICTICIO.
select pg_temp.checar('D4 sem produto_id', 'false',
  (current_setting('teste.d')::jsonb ? 'produto_id')::text);
select pg_temp.checar('D5 sem variante_id', 'false',
  (current_setting('teste.d')::jsonb ? 'variante_id')::text);
select pg_temp.checar('D6 sem preco', 'false',
  (current_setting('teste.d')::jsonb ? 'preco')::text);
select pg_temp.checar('D7 sem alvo', 'false',
  (current_setting('teste.d')::jsonb ? 'alvo')::text);
select pg_temp.checar('D8 termo vazio nao encontra', 'false',
  (pg_temp.resolver('') ->> 'encontrado'));
select pg_temp.checar('D9 nulo nao encontra', 'false',
  (pg_temp.resolver(null) ->> 'encontrado'));
select pg_temp.checar('D10 e nao explode', 'false',
  (pg_temp.resolver(null) ? 'EXCECAO')::text);

-- =============================================================================
-- BLOCO E — INATIVO E INDISPONÍVEL: RESOLVE E INFORMA
--
-- §6.1 lista disponibilidade como CAMPO DE SAÍDA, não como filtro. Esconder
-- faria o bipe dizer "código não cadastrado" e mandar a pessoa procurar um
-- problema de cadastro que não existe.
-- =============================================================================
select set_config('teste.e1', pg_temp.resolver('DESCONT')::text, true);
select pg_temp.checar('E1 produto INATIVO ainda resolve', 'true',
  (current_setting('teste.e1')::jsonb ->> 'encontrado'));
select pg_temp.checar('E2 e diz que esta inativo', 'false',
  (current_setting('teste.e1')::jsonb ->> 'ativo'));
select pg_temp.checar('E3 e indisponivel', 'false',
  (current_setting('teste.e1')::jsonb ->> 'disponivel'));
select pg_temp.checar('E4 mas identifica o item', 'd4d4d4d4-0000-0000-0000-000000000004',
  (current_setting('teste.e1')::jsonb ->> 'produto_id'));

select set_config('teste.e5', pg_temp.resolver('ACABOU')::text, true);
select pg_temp.checar('E5 produto ATIVO porem indisponivel resolve', 'true',
  (current_setting('teste.e5')::jsonb ->> 'encontrado'));
select pg_temp.checar('E6 cadastro segue ativo', 'true',
  (current_setting('teste.e5')::jsonb ->> 'ativo'));
select pg_temp.checar('E7 e a operacao diz indisponivel', 'false',
  (current_setting('teste.e5')::jsonb ->> 'disponivel'));

-- RN-DISP-004 pelo caminho do leitor.
select set_config('teste.e8', pg_temp.resolver('CHAPAUSA')::text, true);
select pg_temp.checar('E8 categoria pausada derruba a disponibilidade', 'false',
  (current_setting('teste.e8')::jsonb ->> 'disponivel'));
select pg_temp.checar('E9 mas o produto continua ativo', 'true',
  (current_setting('teste.e8')::jsonb ->> 'ativo'));

select set_config('teste.e10', pg_temp.resolver('VAR-INATIVA')::text, true);
select pg_temp.checar('E10 variante INATIVA resolve', 'true',
  (current_setting('teste.e10')::jsonb ->> 'encontrado'));
select pg_temp.checar('E11 como variante', 'variante',
  (current_setting('teste.e10')::jsonb ->> 'alvo'));
select pg_temp.checar('E12 e informa que esta inativa', 'false',
  (current_setting('teste.e10')::jsonb ->> 'ativo'));
select pg_temp.checar('E13 e indisponivel', 'false',
  (current_setting('teste.e10')::jsonb ->> 'disponivel'));

-- =============================================================================
-- BLOCO F — A NORMALIZAÇÃO É A DO BANCO
-- =============================================================================
select pg_temp.checar('F1 espacos internos nao atrapalham', 'true',
  (pg_temp.resolver('789 1234 5678 95') ->> 'encontrado'));
select pg_temp.checar('F2 minusculas encontram', 'true',
  (pg_temp.resolver('pizza-cal') ->> 'encontrado'));
select pg_temp.checar('F3 bordas aparadas', 'true',
  (pg_temp.resolver('   7891234567895   ') ->> 'encontrado'));
select pg_temp.checar('F4 pontuacao removida', 'true',
  (pg_temp.resolver('789.123.456.789.5') ->> 'encontrado'));
select pg_temp.checar('F5 e resolve o mesmo item', 'd4d4d4d4-0000-0000-0000-000000000001',
  (pg_temp.resolver('789 1234 5678 95') ->> 'produto_id'));

-- ZEROS A ESQUERDA: dois codigos diferentes, dois itens diferentes.
select pg_temp.checar('F6 com zeros resolve um item', 'd4d4d4d4-0000-0000-0000-000000000001',
  (pg_temp.resolver('0012345678905') ->> 'produto_id'));
select pg_temp.checar('F7 sem os zeros resolve OUTRO', 'd4d4d4d4-0000-0000-0000-000000000005',
  (pg_temp.resolver('12345678905') ->> 'produto_id'));

-- Hifen distingue, como na Etapa 2.
select pg_temp.checar('F8 hifen faz parte do codigo', 'true',
  (pg_temp.resolver('PIZZA-CAL') ->> 'encontrado'));
select pg_temp.checar('F9 sem o hifen e outro codigo, inexistente', 'false',
  (pg_temp.resolver('PIZZACAL') ->> 'encontrado'));

select pg_temp.checar('F10 o normalizado devolvido e o do banco', 'PIZZA-CAL',
  (pg_temp.resolver('  pizza-cal  ') ->> 'codigo_normalizado'));

-- =============================================================================
-- BLOCO G — PERMISSÕES: `anon` NÃO GANHA NADA
-- =============================================================================
reset role;

select pg_temp.checar('G1 anon sem execute em resolver', 'false',
  has_function_privilege('anon','public.resolver_codigo_de_barras(text)','execute')::text);
select pg_temp.checar('G2 anon sem execute na busca do PDV', 'false',
  has_function_privilege('anon','public.buscar_catalogo_pdv(text)','execute')::text);
select pg_temp.checar('G3 PUBLIC sem execute em resolver', 'false',
  has_function_privilege('public','public.resolver_codigo_de_barras(text)','execute')::text);
select pg_temp.checar('G4 PUBLIC sem execute na busca do PDV', 'false',
  has_function_privilege('public','public.buscar_catalogo_pdv(text)','execute')::text);
select pg_temp.checar('G5 authenticated com execute em resolver', 'true',
  has_function_privilege('authenticated','public.resolver_codigo_de_barras(text)','execute')::text);
select pg_temp.checar('G6 authenticated com execute na busca', 'true',
  has_function_privilege('authenticated','public.buscar_catalogo_pdv(text)','execute')::text);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('G7 anon nem executa o resolver', '42501',
  coalesce(pg_temp.resolver('7891234567895') ->> 'EXCECAO', '(executou)'));
select pg_temp.checar('G8 anon nem executa a busca do PDV', '-1', pg_temp.buscar('refri')::text);
reset role;

-- Sem `catalog.view`: a resposta e SEM PERMISSAO, e nao "nao encontrado".
-- Dizer "nao encontrado" mandaria o operador procurar um cadastro que existe.
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-cccc-2222-2222-222222222222","role":"authenticated"}';
select set_config('teste.g9', pg_temp.resolver('7891234567895')::text, true);
select pg_temp.checar('G9 sem catalog.view o resolver recusa', 'false',
  (current_setting('teste.g9')::jsonb ->> 'ok'));
select pg_temp.checar('G10 e o bloqueio e nomeado', 'sem_permissao',
  (current_setting('teste.g9')::jsonb ->> 'bloqueio'));
select pg_temp.checar('G11 e NAO finge que o codigo nao existe', 'false',
  (current_setting('teste.g9')::jsonb ? 'encontrado')::text);
select pg_temp.checar('G12 sem catalog.view a busca devolve vazio', '0',
  pg_temp.buscar('refri')::text);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-cccc-1111-1111-111111111111","role":"authenticated"}';
select pg_temp.checar('G13 com catalog.view o resolver funciona', 'true',
  (pg_temp.resolver('7891234567895') ->> 'encontrado'));
select pg_temp.checar('G14 e a busca tambem', 'true', (pg_temp.buscar('refri') > 0)::text);

-- `sku` NAO e codigo de barras, e continua nao sendo.
select pg_temp.checar('G15 sku do fornecedor nao resolve como codigo', 'false',
  (pg_temp.resolver('SKU-FORNECEDOR-777') ->> 'encontrado'));
select pg_temp.checar('G16 nenhuma funcao da Etapa 4 menciona sku', '0',
  (select count(*)::text from pg_proc where pronamespace='public'::regnamespace
     and proname in ('resolver_codigo_de_barras','buscar_catalogo_pdv')
     and prosrc ilike '%sku%'));

-- =============================================================================
-- BLOCO H — A BUSCA DO PDV
-- =============================================================================
select pg_temp.checar('H1 acha por nome', 'true',
  (select count(*) > 0 from public.buscar_catalogo_pdv('calabresa'))::text);
select pg_temp.checar('H2 acha sem acento', 'true',
  (select count(*) > 0 from public.buscar_catalogo_pdv('limao'))::text);
select pg_temp.checar('H3 acha COM acento tambem', 'true',
  (select count(*) > 0 from public.buscar_catalogo_pdv('limão'))::text);
select pg_temp.checar('H4 acha pela categoria', 'true',
  (select count(*) > 0 from public.buscar_catalogo_pdv('bebidas e4'))::text);
select pg_temp.checar('H5 acha pelo nome do tamanho', 'true',
  (select count(*) > 0 from public.buscar_catalogo_pdv('broto e4'))::text);
select pg_temp.checar('H6 acha pela descricao', 'true',
  (select count(*) > 0 from public.buscar_catalogo_pdv('citrico'))::text);

-- CODIGO EXATO: um codigo nunca casaria com o nome de nada, entao ele precisa
-- ser criterio de busca, e nao so de ordenacao.
select pg_temp.checar('H7 acha pelo codigo exato', '1',
  (select count(*)::text from public.buscar_catalogo_pdv('7891234567895')));
select pg_temp.checar('H8 e marca que casou o codigo', 'true',
  (select casou_codigo::text from public.buscar_catalogo_pdv('7891234567895') limit 1));
select pg_temp.checar('H9 o codigo de VARIANTE encontra o produto dela', 'd4d4d4d4-0000-0000-0000-000000000002',
  (select id::text from public.buscar_catalogo_pdv('96385074') limit 1));
-- `calabresa e4` e nao `calabresa`: o cardapio real do DEV tem uma Calabresa, e
-- um cenario com `limit 1` passaria a depender de qual das duas vem primeiro.
select pg_temp.checar('H10 quem casou por nome nao vem marcado como codigo', 'false',
  (select casou_codigo::text from public.buscar_catalogo_pdv('calabresa e4') limit 1));

-- O que diferencia esta busca da publica.
select pg_temp.checar('H11 devolve as variantes com id e preco', '2',
  (select jsonb_array_length(variantes)::text from public.buscar_catalogo_pdv('calabresa e4')
    where id = 'd4d4d4d4-0000-0000-0000-000000000002'));
select pg_temp.checar('H12 com o id da variante', 'f4f4f4f4-0000-0000-0000-000000000001',
  (select variantes -> 0 ->> 'id' from public.buscar_catalogo_pdv('calabresa e4')
    where id = 'd4d4d4d4-0000-0000-0000-000000000002'));
select pg_temp.checar('H13 e o preco efetivo dela', '49.90',
  (select variantes -> 1 ->> 'preco' from public.buscar_catalogo_pdv('calabresa e4')
    where id = 'd4d4d4d4-0000-0000-0000-000000000002'));
select pg_temp.checar('H14 so variantes ATIVAS na lista', '0',
  (select jsonb_array_length(variantes)::text from public.buscar_catalogo_pdv('aposentada')
    where id = 'd4d4d4d4-0000-0000-0000-000000000003'));
select pg_temp.checar('H15 e a bandeira de variante ativa acompanha', 'false',
  (select tem_variante_ativa::text from public.buscar_catalogo_pdv('aposentada')
    where id = 'd4d4d4d4-0000-0000-0000-000000000003'));

-- Item inativo APARECE com bandeira: no balcao, saber que existe evita
-- cadastrar de novo.
select pg_temp.checar('H16 item inativo aparece na busca interna', '1',
  (select count(*)::text from public.buscar_catalogo_pdv('descontinuado')));
select pg_temp.checar('H17 com a bandeira de inativo', 'false',
  (select ativo::text from public.buscar_catalogo_pdv('descontinuado') limit 1));
select pg_temp.checar('H18 devolve o codigo primario do produto', '7891234567895',
  (select codigo_primario from public.buscar_catalogo_pdv('limao')
    where id = 'd4d4d4d4-0000-0000-0000-000000000001'));
select pg_temp.checar('H19 termo vazio devolve nada', '0', pg_temp.buscar('')::text);
select pg_temp.checar('H20 termo que nao casa nada devolve nada', '0',
  pg_temp.buscar('xilofone roxo')::text);
select pg_temp.checar('H21 preco do produto simples', '10.00',
  (select preco::text from public.buscar_catalogo_pdv('limao')
    where id = 'd4d4d4d4-0000-0000-0000-000000000001'));

-- =============================================================================
-- BLOCO I — REGRESSÃO: `buscar_catalogo` PÚBLICA CONTINUA IDÊNTICA
-- =============================================================================
select pg_temp.checar('I1 continua SECURITY INVOKER', 'false',
  (select prosecdef::text from pg_proc
    where proname='buscar_catalogo' and pronamespace='public'::regnamespace));
select pg_temp.checar('I2 continua executavel por anon', 'true',
  has_function_privilege('anon','public.buscar_catalogo(text)','execute')::text);
-- A assinatura de retorno nao foi estendida: nada de variantes nem de codigo
-- casado na funcao da vitrine.
select pg_temp.checar('I3 o retorno NAO ganhou coluna de variantes', '0',
  (select count(*)::text from pg_proc
    where proname='buscar_catalogo' and pronamespace='public'::regnamespace
      and pg_get_function_result(oid) ilike '%variantes%'));
select pg_temp.checar('I3b nem coluna de codigo casado', '0',
  (select count(*)::text from pg_proc
    where proname='buscar_catalogo' and pronamespace='public'::regnamespace
      and pg_get_function_result(oid) ilike '%casou%'));
-- O teste que pega contaminacao: se alguem tivesse levado o PDV para dentro da
-- funcao publica, o corpo mencionaria codigo de barras ou variante nomeada.
select pg_temp.checar('I4 o corpo NAO menciona product_barcodes', '0',
  (select count(*)::text from pg_proc
    where proname='buscar_catalogo' and pronamespace='public'::regnamespace
      and prosrc ilike '%product_barcodes%'));
select pg_temp.checar('I5 o corpo NAO menciona codigo de barras', '0',
  (select count(*)::text from pg_proc
    where proname='buscar_catalogo' and pronamespace='public'::regnamespace
      and prosrc ilike '%code_normalized%'));
select pg_temp.checar('I6 continua achando por nome', 'true',
  (select count(*) > 0 from public.buscar_catalogo('calabresa'))::text);
select pg_temp.checar('I7 e NAO acha por codigo de barras', '0',
  (select count(*)::text from public.buscar_catalogo('7891234567895')));

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.checar('I8 anon continua usando a busca publica', 'true',
  (select count(*) >= 0 from public.buscar_catalogo('calabresa'))::text);
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
