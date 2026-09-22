-- 0063 — Duas permissões que a Fase 7 exige e que ainda não existiam
-- 03-RLS-RBAC-SEGURANCA.md §16.2 e §32 · 04-REGRAS-NEGOCIO.md RN-CAIXA-003
-- 01-DOCUMENTO-MESTRE.md §79.18 · CLAUDE.md §14
--
-- Só duas, e nenhuma por comodidade.
--
-- 1. `payments.register` — registrar o pagamento REALIZADO. Não existia
--    porque até a Fase 6 o sistema só conhecia a intenção do checkout. 03
--    §16.2 diz que o Atendente pode receber permissão para "registrar
--    movimentos operacionais", e 01 §79.18 põe na mão dele a confirmação do
--    pagamento na retirada e no retorno do motoboy. Então vai para os dois
--    papéis, como `cash.open` e `cash.close`.
--
-- 2. `cash.bypass_session` — RN-CAIXA-003: "Exceção à exigência de caixa
--    depende de permissão específica". A regra EXIGE uma permissão própria e
--    ela não existia; criá-la é cumprir a regra, não ampliá-la. Owner apenas,
--    e deliberadamente fora do Atendente: se o Atendente a tivesse por
--    padrão, a exigência de caixa aberto deixaria de existir na prática.
--
-- NÃO criei `payments.reverse`. Estornar pagamento é estornar movimentação
-- financeira, que é exatamente o que `finance.reverse` já descreve (03
-- §17.2). Uma permissão a mais para o mesmo ato só criaria a chance de
-- alguém ter uma e não a outra.

insert into public.permissions (code, module, action, description) values
  ('payments.register','payments','create','Registrar pagamento efetivamente recebido'),
  ('cash.bypass_session','cash','bypass','Registrar recebimento sem sessao de caixa aberta');

-- Owner/Admin recebe tudo (03 §32). O seed da Fase 2 fez isso por cross
-- join no momento da criação; permissão nova precisa ser ligada aqui.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.code in ('payments.register', 'cash.bypass_session')
 where r.name = 'Owner/Admin';

-- Atendente recebe SOMENTE `payments.register`.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.code = 'payments.register'
 where r.name = 'Atendente';
