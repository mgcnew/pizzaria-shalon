-- 0009 — Restringe a execução das funções | CLAUDE.md §13 · doc 03 §4
--
-- O EXECUTE de uma função é concedido a PUBLIC por padrão. Revogar de anon e
-- authenticated não basta: é preciso revogar de PUBLIC e só então conceder
-- explicitamente a quem deve poder chamar.
revoke all on function public.current_app_user_id() from public, anon, authenticated;
revoke all on function public.current_employee_id() from public, anon, authenticated;
revoke all on function public.is_internal_user() from public, anon, authenticated;
revoke all on function public.has_permission(text) from public, anon, authenticated;
revoke all on function public.log_audit(text, text, uuid, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.tg_audit_generico() from public, anon, authenticated;
revoke all on function public.tg_audit_imutavel() from public, anon, authenticated;
revoke all on function public.tg_set_updated_at() from public, anon, authenticated;

-- Só usuários autenticados podem perguntar sobre a PRÓPRIA identidade e as
-- PRÓPRIAS permissões. Isso alimenta a interface e não concede acesso a dado
-- algum: quem autoriza continua sendo a policy da tabela.
grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.is_internal_user() to authenticated;
grant execute on function public.has_permission(text) to authenticated;

-- log_audit e as trigger functions NÃO são chamáveis por ninguém via API:
-- rodam apenas como SECURITY DEFINER a partir das triggers e do backend, para
-- que nenhum cliente consiga forjar um registro de auditoria.
