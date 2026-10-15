-- 0149 — A dona pode ajustar o que o Atendente enxerga e faz
-- D-2026-10-15-122 · RN-RBAC-005 · CLAUDE.md §14
--
-- `definir_permissoes_do_papel` recusava QUALQUER papel de sistema. Como o
-- Atendente é papel de sistema (não pode ser excluído), as permissões dele
-- ficavam congeladas no seed, e a dona só conseguiria personalizar criando um
-- papel novo — que a tela não oferece.
--
-- Muda uma coisa: papel de sistema PODE ter permissões ajustadas, exceto o
-- Owner/Admin, que continua completo (senão a dona poderia se trancar fora).
-- A regra anti-escalada (conjunto final + o que sai, contra o que o ator
-- possui) e o bloqueio por `for update` permanecem como estavam.

create or replace function public.definir_permissoes_do_papel(
  p_role_id uuid, p_permissoes uuid[], p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_papel record;
  v_ids uuid[] := coalesce(p_permissoes, array[]::uuid[]);
  v_falta text;
  v_antes text;
  v_depois text;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('roles.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para administrar papéis.');
  end if;

  select * into v_papel from public.roles r where r.id = p_role_id for update;
  if v_papel.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Papel não encontrado.');
  end if;
  if v_papel.is_system and v_papel.name = 'Owner/Admin' then
    return jsonb_build_object('ok', false, 'erro',
      'O papel da proprietária sempre tem todas as permissões e não pode ser alterado.');
  end if;

  if (select count(*) from public.permissions p where p.id = any(v_ids)) <> cardinality(v_ids) then
    return jsonb_build_object('ok', false, 'erro', 'Alguma permissão informada não existe.');
  end if;

  select string_agg(distinct p.code, ', ') into v_falta
    from public.permissions p
   where (
           p.id = any(v_ids)
           or p.id in (select rp.permission_id
                         from public.role_permissions rp
                        where rp.role_id = p_role_id
                          and rp.permission_id <> all(v_ids))
         )
     and not public.has_permission(p.code);

  if v_falta is not null then
    return jsonb_build_object('ok', false, 'escalada', true, 'faltam', v_falta,
      'erro', 'Você não pode conceder nem remover permissões que você mesmo não possui.');
  end if;

  select string_agg(p.code, ', ' order by p.code) into v_antes
    from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
   where rp.role_id = p_role_id;

  delete from public.role_permissions rp
   where rp.role_id = p_role_id and rp.permission_id <> all(v_ids);

  insert into public.role_permissions (role_id, permission_id, granted_by)
  select p_role_id, x, v_ator from unnest(v_ids) x
  on conflict (role_id, permission_id) do nothing;

  select string_agg(p.code, ', ' order by p.code) into v_depois
    from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
   where rp.role_id = p_role_id;

  perform public.log_audit('papel_definir_permissoes', 'roles', p_role_id,
    jsonb_build_object('permissoes', v_antes),
    jsonb_build_object('permissoes', v_depois),
    nullif(btrim(coalesce(p_motivo, '')), ''));

  return jsonb_build_object('ok', true, 'permissoes', coalesce(v_depois, ''));
end;
$$;

revoke all on function public.definir_permissoes_do_papel(uuid, uuid[], text) from public, anon;
grant execute on function public.definir_permissoes_do_papel(uuid, uuid[], text) to authenticated;
