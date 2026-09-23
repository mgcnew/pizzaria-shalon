-- 0102 — tg_audit_cliente volta para a política das funções de trigger
-- 03-RLS-RBAC-SEGURANCA.md §4 · CLAUDE.md §13, §33
--
-- A REGRA JÁ EXISTIA. A migration 0009 a escreveu com todas as letras:
--
--   "log_audit e as trigger functions NÃO são chamáveis por ninguém via API:
--    rodam apenas como SECURITY DEFINER a partir das triggers e do backend,
--    para que nenhum cliente consiga forjar um registro de auditoria."
--
-- E a aplicou a `tg_audit_generico`, `tg_audit_imutavel` e `tg_set_updated_at`.
-- `tg_audit_cliente` nasceu depois, na 0046 (Fase 5), e não passou por ali —
-- ficou com o EXECUTE que o Postgres concede a PUBLIC por padrão, mais as
-- concessões que o Supabase dá a `anon` e `authenticated` em função nova do
-- schema `public`. ACL encontrada na auditoria da Fase 10:
--
--   =X/postgres | postgres=X/postgres | anon=X/postgres
--   | authenticated=X/postgres | service_role=X/postgres
--
-- contra a das outras três:
--
--   postgres=X/postgres | service_role=X/postgres
--
-- NÃO É EXPLORÁVEL, E MESMO ASSIM É PARA CORRIGIR. O PostgREST não publica
-- função que retorna `trigger` — a chamada por `/rest/v1/rpc/tg_audit_cliente`
-- responde PGRST202, "não encontrada no schema cache". A correção é de
-- coerência: privilégio que ninguém precisa é privilégio que não deveria
-- existir, e a próxima versão do PostgREST não é lugar para se descobrir isso.
--
-- O TRIGGER NÃO DEPENDE DESTAS CONCESSÕES. Quem executa a função de trigger é
-- o motor de triggers do Postgres, que não consulta o EXECUTE do papel da
-- sessão. Revogar daqui não afeta a auditoria de `customers`; o teste de
-- regressão que acompanha esta fase prova isso operando como Atendente.

revoke all on function public.tg_audit_cliente() from public, anon, authenticated;

comment on function public.tg_audit_cliente is
  'Audita bloqueio e edição interna do cliente. Rotina do checkout não polui a auditoria. Não é chamável via API: só roda a partir da trigger (0009, 0102).';
