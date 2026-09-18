-- 0007 — Catálogo de permissões e papéis iniciais
-- 03-RLS-RBAC-SEGURANCA.md §3.2 (catálogo) e §32 (matriz) · RN-RBAC-001
--
-- Isto é ESTRUTURA, não dado de demonstração: sem o catálogo nenhuma policy
-- funciona. Nenhum funcionário, usuário ou credencial de exemplo é criado.
insert into public.permissions (code, module, action, description) values
  ('orders.view','orders','view','Visualizar pedidos'),
  ('orders.create_manual','orders','create','Registrar pedido manual'),
  ('orders.accept','orders','accept','Aceitar pedido'),
  ('orders.request_change','orders','change','Solicitar alteracao de pedido'),
  ('orders.cancel','orders','cancel','Cancelar ou rejeitar pedido'),
  ('orders.override_delivery_fee','orders','override','Alterar manualmente a taxa de entrega'),
  ('orders.reprint','orders','reprint','Reimprimir comanda'),
  ('cash.view','cash','view','Visualizar caixa'),
  ('cash.open','cash','open','Abrir sessao de caixa'),
  ('cash.close','cash','close','Fechar sessao de caixa'),
  ('cash.adjust','cash','adjust','Registrar sangria, reforco ou ajuste'),
  ('cash.reopen','cash','reopen','Reabrir ou corrigir caixa fechado'),
  ('catalog.view','catalog','view','Visualizar catalogo'),
  ('catalog.manage','catalog','manage','Gerenciar catalogo e disponibilidade'),
  ('customers.view','customers','view','Visualizar clientes'),
  ('customers.block','customers','block','Bloquear ou desbloquear cliente'),
  ('remarketing.view','remarketing','view','Visualizar remarketing'),
  ('remarketing.contact','remarketing','contact','Registrar contato de remarketing'),
  ('finance.view','finance','view','Visualizar financeiro'),
  ('finance.create','finance','create','Registrar movimentacao financeira'),
  ('finance.reverse','finance','reverse','Estornar movimentacao financeira'),
  ('employees.view','employees','view','Visualizar dados operacionais de funcionarios'),
  ('employees.manage','employees','manage','Gerenciar funcionarios e acessos'),
  ('employees.finance.view','employees','finance_view','Visualizar dados financeiros sensiveis de funcionarios'),
  ('employees.finance.manage','employees','finance_manage','Gerenciar dados financeiros sensiveis de funcionarios'),
  ('deliveries.view','deliveries','view','Visualizar entregas'),
  ('deliveries.manage','deliveries','manage','Gerenciar saidas de entrega e acertos'),
  ('reports.view','reports','view','Visualizar relatorios'),
  ('reports.export','reports','export','Exportar relatorios'),
  ('settings.view','settings','view','Visualizar configuracoes'),
  ('settings.manage','settings','manage','Alterar configuracoes criticas'),
  ('roles.manage','roles','manage','Gerenciar papeis e permissoes'),
  ('audit.view','audit','view','Visualizar auditoria');

-- RN-RBAC-001: Owner/Admin e Atendente são os papéis iniciais; o Owner pode
-- criar papéis personalizados depois. is_system impede exclusão.
insert into public.roles (name, description, is_system, is_active) values
  ('Owner/Admin', 'Acesso administrativo completo conforme permissoes.', true, true),
  ('Atendente', 'Operacao diaria: pedidos, atendimento, impressao e caixa conforme autorizacao.', true, true);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name = 'Owner/Admin';

-- Atendente: subconjunto de §32. Deliberadamente AUSENTES (coluna "Atendente
-- padrão" marca ✗): orders.override_delivery_fee · orders.cancel · cash.adjust
-- cash.reopen · finance.create · finance.reverse · customers.block
-- roles.manage · settings.manage · audit.view · catalog.manage
-- employees.manage · employees.finance.view · employees.finance.manage
-- remarketing.* · reports.*
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.code in (
  'orders.view','orders.create_manual','orders.accept','orders.request_change','orders.reprint',
  'cash.view','cash.open','cash.close',
  'catalog.view','customers.view','finance.view','employees.view',
  'deliveries.view','deliveries.manage','settings.view'
)
where r.name = 'Atendente';
