-- =============================================================================
-- `cash.adjust` PARA O ATENDENTE — Fase 12 (PDV), Etapa 8
--
-- 03-RLS-RBAC-SEGURANCA.md §6, §31, §32 · 04-REGRAS-NEGOCIO.md RN-CAIXA-*
-- 09-PDV-FRENTE-DE-CAIXA.md §4 · CLAUDE.md §14, §25, §33
-- Decisão: D-2026-09-26-82
--
-- POR QUÊ
--
-- O Atendente é o operador normal do PDV e do caixa: ele abre a sessão, recebe
-- os pedidos e fecha conferindo o dinheiro. Precisa também suprir e sangrar a
-- gaveta durante o plantão — trocar dinheiro, mandar sobra para o cofre — sem
-- depender da proprietária estar presente. Sem `cash.adjust` o servidor recusa
-- as duas operações, e o caixa que ele mesmo abriu e vai fechar fica com uma
-- lacuna no meio.
--
-- 03 §32 já previa "Sangria/suprimento | Dono/Admin ✓ | Atendente conforme
-- permissão". O seed da Fase 2 resolveu esse "conforme permissão" como "não
-- por padrão"; a operação real mostrou que o padrão certo é o contrário. Esta
-- migration troca o default, não a regra.
--
-- O QUE ESTA MIGRATION DELIBERADAMENTE NÃO FAZ
--
-- `cash.reopen` continua fora do Atendente, e 03 §32 marca ✗ explícito para
-- ela. Reabrir caixa fechado é conserto de histórico, não operação de plantão:
-- quem fecha não deve poder reabrir o próprio fechamento e refazer a contagem.
-- Isso é separação de funções, e é o que dá sentido à diferença justificada.
--
-- `finance.view`, `cash.bypass_session`, `finance.reverse` e qualquer outra
-- permissão ficam exatamente como estavam. A assimetria `payments.register` ×
-- `finance.view` (PI-F12-01 e a pendência da Etapa 7) NÃO é resolvida aqui.
--
-- AUDITORIA: a concessão fica registrada sozinha. `role_permissions` tem
-- trigger `role_permissions_audit` desde a Fase 2 (CLAUDE.md §33).
-- =============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.code = 'cash.adjust'
 where r.name = 'Atendente';

-- ------------------------------------------------------------------ postcondição
--
-- A migration afirma o que fez. Uma concessão de permissão errada não aparece
-- em teste de tela: aparece em dinheiro, meses depois.
do $$
declare
  v_adjust int;
  v_reopen int;
  v_total  int;
  v_owner  int;
begin
  select count(*) into v_adjust
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
   where r.name = 'Atendente' and p.code = 'cash.adjust';

  select count(*) into v_reopen
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
   where r.name = 'Atendente' and p.code in ('cash.reopen', 'cash.bypass_session');

  select count(*) into v_total
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
   where r.name = 'Atendente';

  select count(*) into v_owner
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
   where r.name = 'Owner/Admin';

  if v_adjust <> 1 then
    raise exception 'Atendente deveria ter cash.adjust exatamente uma vez, tem %', v_adjust;
  end if;
  if v_reopen <> 0 then
    raise exception 'Atendente nao pode ter cash.reopen nem cash.bypass_session, tem %', v_reopen;
  end if;
  if v_total <> 19 then
    raise exception 'Atendente deveria ficar com 19 permissoes (18 + cash.adjust), tem %', v_total;
  end if;
  if v_owner <> 39 then
    raise exception 'Owner/Admin deveria permanecer com 39 permissoes, tem %', v_owner;
  end if;
end $$;
