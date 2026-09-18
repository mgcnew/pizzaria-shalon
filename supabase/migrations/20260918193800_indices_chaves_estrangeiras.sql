-- 0010 — Índices de cobertura para FKs de autoria
-- Apontados pelo advisor de performance do Supabase. Sem eles, remover um
-- app_user faz varredura sequencial nas tabelas que o referenciam.
create index audit_logs_ator_employee_idx on public.audit_logs (actor_employee_id);
create index employee_financial_updated_by_idx on public.employee_financial_profiles (updated_by);
create index role_permissions_granted_by_idx on public.role_permissions (granted_by);
create index user_roles_assigned_by_idx on public.user_roles (assigned_by);
