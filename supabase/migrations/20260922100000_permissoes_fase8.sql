-- 0072 — Três permissões que a Fase 8 exige e que ainda não existiam
-- 03-RLS-RBAC-SEGURANCA.md §18.2, §19.3, §20 e §32 · CLAUDE.md §14
-- 04-REGRAS-NEGOCIO.md RN-RUN-006, RN-CONS-001, RN-FUNC-003
--
-- Três, e cada uma sai de uma LINHA PRÓPRIA da matriz de §32 — não de
-- conveniência de implementação.
--
-- 1. `deliveries.settle` — fazer o acerto do motoboy. A matriz tem
--    "Gerenciar entregas" e "Fazer acerto motoboy" como linhas separadas, com
--    respostas diferentes para o Atendente ("✓" contra "✓ se autorizado").
--    São atos diferentes: despachar é operação; acertar mexe em dinheiro que
--    entra na gaveta.
--
-- 2. `internal.view` e 3. `internal.register` — cortesia, consumo e perda.
--    A matriz tem "Registrar consumo funcionário | ✓ | ✓". Uma permissão só
--    para os três porque são o mesmo ato — tirar produto sem vender — e a
--    diferença entre eles é o TIPO do movimento, não quem pode registrá-lo.
--
-- O QUE DELIBERADAMENTE **NÃO** GANHOU PERMISSÃO NOVA:
--
-- · lançar no histórico financeiro do funcionário continua exigindo
--   `employees.finance.manage`. RN-RUN-006 e §18.2 são explícitos: registrar
--   um consumo NÃO dá acesso ao financeiro do funcionário, e transformar uma
--   diferença em lançamento é decisão separada, de quem tem essa permissão;
--
-- · estornar continua em `finance.reverse`. Reverter lançamento de
--   funcionário é reverter movimentação financeira — o mesmo ato que a Fase 7
--   já nomeou.

insert into public.permissions (code, module, action, description) values
  ('deliveries.settle','deliveries','settle','Conciliar acerto do motoboy'),
  ('internal.view','internal','view','Visualizar cortesias, consumo interno e perdas'),
  ('internal.register','internal','create','Registrar cortesia, consumo interno ou perda');

-- Owner/Admin recebe tudo (03 §32).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p
    on p.code in ('deliveries.settle', 'internal.view', 'internal.register')
 where r.name = 'Owner/Admin';

-- Atendente: registra consumo e enxerga os movimentos, porque é ele quem
-- atende o funcionário no balcão. O ACERTO fica de fora por padrão — "✓ se
-- autorizado" é concessão, não padrão, e ele move dinheiro para a gaveta.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.code in ('internal.view', 'internal.register')
 where r.name = 'Atendente';
