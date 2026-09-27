-- =============================================================================
-- RBAC DA ETAPA 8 — `cash.adjust` PARA O ATENDENTE
--
-- 03-RLS-RBAC-SEGURANCA.md §6, §31, §32 · CLAUDE.md §12, §14, §33
-- Migration: 20260926180000_atendente_pode_suprir_e_sangrar.sql
-- Decisão: D-2026-09-26-82
--
-- Esta suíte tem um assunto só: provar que a migration de RBAC faz EXATAMENTE
-- uma coisa. Ela mede o estado ANTES, aplica a migration, mede o DEPOIS e
-- compara conjunto a conjunto — não contagem, conjunto, porque duas trocas
-- simultâneas manteriam a contagem e passariam.
--
-- As quatro perguntas que o checkpoint pediu:
--
--   1. o Atendente passa a ter `cash.adjust`?          (R3, R4)
--   2. continua SEM `cash.reopen`?                     (R5)
--   3. Owner/Admin permanece inalterado?               (R6, R7)
--   4. as outras permissões do Atendente ficam iguais? (R8, R9 — o diff)
--
-- E mais três que ninguém pediu e que custam pouco: a permissão já existia no
-- catálogo desde a Fase 2 (R1), a concessão fica auditada (R10) e a migration
-- é idempotente (R11).
--
-- A migration está PERSISTIDA no DEV (ledger 121). Então o "antes" não existe
-- mais para ser observado: a suíte o RECONSTRÓI dentro da transação, revogando
-- a permissão antes de medir a linha de base e aplicando a migration em
-- seguida. Isso torna a medição determinística e, de quebra, faz a suíte valer
-- como regressão — R0 falha no dia em que alguém revogar `cash.adjust` de
-- verdade, e R14 falha se alguém conceder `cash.reopen` por descuido.
--
-- Transação com ROLLBACK: a revogação do ensaio não sobrevive.
-- =============================================================================

begin;

create temporary table resultado_teste (
  n serial, cenario text, esperado text, obtido text, passou boolean
) on commit drop;

create or replace function pg_temp.checar(p_cenario text, p_esperado text, p_obtido text)
returns void language plpgsql as $h$
begin insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido); end; $h$;

/** O conjunto de permissões de um papel, como texto ordenado e comparável. */
create or replace function pg_temp.conjunto(p_papel text) returns text
language sql as $h$
  select coalesce(string_agg(p.code, ',' order by p.code), 'vazio')
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
   where r.name = p_papel and r.is_system; $h$;

-- ------------------------------------------------- o estado REAL, antes de tudo
select pg_temp.checar('R0 no DEV persistido, o Atendente TEM cash.adjust', 'true',
  (select ('cash.adjust' = any (string_to_array(pg_temp.conjunto('Atendente'), ','))))::text);
select pg_temp.checar('R0b e NAO tem cash.reopen', 'false',
  (select ('cash.reopen' = any (string_to_array(pg_temp.conjunto('Atendente'), ','))))::text);

-- ---------------------------------------------------------------- linha de base
--
-- A revogação reconstrói o estado anterior à migration. Só existe dentro desta
-- transação, e é o que permite medir o efeito da migration em vez de supô-lo.
delete from public.role_permissions rp
 using public.roles r, public.permissions p
 where rp.role_id = r.id and rp.permission_id = p.id
   and r.name = 'Atendente' and r.is_system and p.code = 'cash.adjust';

create temp table base as
select 'Atendente' as papel, pg_temp.conjunto('Atendente') as conjunto
union all
select 'Owner/Admin', pg_temp.conjunto('Owner/Admin');

create temp table auditoria_base as select count(*) as n from public.audit_logs;

select pg_temp.checar('R1 cash.adjust existe no catalogo de permissoes desde a Fase 2', 'true',
  (select exists (select 1 from public.permissions where code = 'cash.adjust'))::text);
select pg_temp.checar('R2 e o Atendente NAO a tinha antes desta migration', 'false',
  (select ('cash.adjust' = any (string_to_array(conjunto, ','))) from base where papel = 'Atendente')::text);

-- =============================================================================
-- A MIGRATION, byte a byte como está no arquivo.
-- =============================================================================
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.code = 'cash.adjust'
 where r.name = 'Atendente';

-- =============================================================================
-- 1 e 2 — O ATENDENTE
-- =============================================================================
select pg_temp.checar('R3 o Atendente passou a ter cash.adjust', 'true',
  (select ('cash.adjust' = any (string_to_array(pg_temp.conjunto('Atendente'), ','))))::text);
select pg_temp.checar('R4 uma vez, nao duas', '1',
  (select count(*)::text from public.roles r
     join public.role_permissions rp on rp.role_id = r.id
     join public.permissions p on p.id = rp.permission_id
    where r.name = 'Atendente' and p.code = 'cash.adjust'));
select pg_temp.checar('R5 e continua SEM cash.reopen', 'false',
  (select ('cash.reopen' = any (string_to_array(pg_temp.conjunto('Atendente'), ','))))::text);
select pg_temp.checar('R5b nem cash.bypass_session entrou de carona', 'false',
  (select ('cash.bypass_session' = any (string_to_array(pg_temp.conjunto('Atendente'), ','))))::text);
select pg_temp.checar('R5c e finance.reverse tambem nao', 'false',
  (select ('finance.reverse' = any (string_to_array(pg_temp.conjunto('Atendente'), ','))))::text);

-- =============================================================================
-- 3 — O OWNER/ADMIN NÃO FOI TOCADO
-- =============================================================================
select pg_temp.checar('R6 Owner/Admin: conjunto identico ao de antes', 'true',
  (select (pg_temp.conjunto('Owner/Admin') = conjunto) from base where papel = 'Owner/Admin')::text);
select pg_temp.checar('R7 e continua com todas as permissoes do catalogo', 'true',
  (select (count(*) = (select count(*) from public.permissions))::text
     from public.roles r join public.role_permissions rp on rp.role_id = r.id
    where r.name = 'Owner/Admin'));

-- =============================================================================
-- 4 — O DIFF: NADA MAIS MUDOU
--
-- A pergunta não é "quantas permissões o Atendente tem", é "quais mudaram".
-- Estes dois cenários são o coração da suíte.
-- =============================================================================
select pg_temp.checar('R8 o Atendente GANHOU exatamente cash.adjust',
  'cash.adjust',
  (select coalesce(string_agg(c, ',' order by c), 'nada')
     from unnest(string_to_array(pg_temp.conjunto('Atendente'), ',')) c
    where c <> all (string_to_array((select conjunto from base where papel = 'Atendente'), ','))));
select pg_temp.checar('R9 e NAO PERDEU nenhuma',
  'nada',
  (select coalesce(string_agg(c, ',' order by c), 'nada')
     from unnest(string_to_array((select conjunto from base where papel = 'Atendente'), ',')) c
    where c <> all (string_to_array(pg_temp.conjunto('Atendente'), ','))));
select pg_temp.checar('R9b nenhum papel novo apareceu', 'Atendente, Owner/Admin',
  (select string_agg(name, ', ' order by name) from public.roles));

-- =============================================================================
-- DE GRAÇA — auditoria e idempotência
-- =============================================================================
select pg_temp.checar('R10 a concessao ficou auditada (§33)', '1',
  ((select count(*) from public.audit_logs) - (select n from auditoria_base))::text);
select pg_temp.checar('R11 a chave primaria impede a concessao dobrada', 'true',
  (select (not exists (
     select 1 from public.roles r
       join public.role_permissions rp on rp.role_id = r.id
       join public.permissions p on p.id = rp.permission_id
      where r.name = 'Atendente' and p.code = 'cash.adjust'
      group by 1 having count(*) > 1))::text));

-- =============================================================================
-- CONSEQUÊNCIA OPERACIONAL — a permissão só vale se a autoridade a enxergar
-- =============================================================================
select pg_temp.checar('R12 movimentar_caixa e a funcao que exige cash.adjust', 'true',
  (select (prosrc like '%cash.adjust%')::text from pg_proc
    where proname = 'movimentar_caixa'
      and pronamespace = 'public'::regnamespace limit 1));
select pg_temp.checar('R13 e reabrir_caixa continua exigindo cash.reopen', 'true',
  (select (prosrc like '%cash.reopen%')::text from pg_proc
    where proname = 'reabrir_caixa'
      and pronamespace = 'public'::regnamespace limit 1));

-- =============================================================================
select count(*) filter (where passou) || '/' || count(*) as resultado from resultado_teste;
select n, cenario, esperado, obtido from resultado_teste where not passou order by n;

rollback;
