-- 0107 — `definir_papeis` trava o papel que está validando
-- 04-REGRAS-NEGOCIO.md RN-RBAC-005 · CLAUDE.md §34
--
-- A 0106 fechou a escrita direta em `role_permissions` e criou
-- `definir_permissoes_do_papel`, que trava a linha de `roles` com
-- `for update`. Falta o outro lado da janela.
--
-- O CENÁRIO QUE ISTO FECHA (TOCTOU):
--
--   transação A (definir_papeis)          transação B (definir_permissoes)
--   ------------------------------------  --------------------------------
--   lê role_permissions do papel P
--   conclui: P só concede o que eu tenho
--                                         acrescenta finance.reverse a P
--                                         commit
--   insere user_roles (usuário ← P)
--   commit
--
--   → o usuário terminou com `finance.reverse` sem que A jamais a tenha
--     validado, e sem que B tenha atribuído papel a ninguém.
--
-- Com `for share` aqui e `for update` lá, as duas transações passam a
-- disputar as MESMAS linhas: B espera A terminar, e então a validação de A
-- e a atribuição de A são um bloco indivisível sobre o mesmo estado.
--
-- `for share` e não `for update` porque `definir_papeis` não altera `roles`
-- — ela só precisa que ninguém altere as permissões do papel enquanto ela
-- decide. Duas atribuições simultâneas de papéis diferentes continuam
-- podendo rodar em paralelo.
--
-- ÚNICA ALTERAÇÃO: as três linhas do bloqueio. O resto do corpo é byte a
-- byte o que a 0090 aplicou.

create or replace function public.definir_papeis(p_app_user_id uuid, p_papeis uuid[], p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_usuario record;
  v_papeis uuid[] := coalesce(p_papeis, array[]::uuid[]);
  v_antes text;
  v_depois text;
  v_falta text;
  v_inativo text;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('roles.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para administrar papéis.');
  end if;

  select * into v_usuario from public.app_users a where a.id = p_app_user_id for update;
  if v_usuario.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Acesso não encontrado.');
  end if;

  -- A-21/TOCTOU: trava os papéis que estão sendo validados. Quem quiser
  -- mudar as permissões deles (`definir_permissoes_do_papel`, `for update`)
  -- espera esta transação terminar.
  perform 1 from public.roles r where r.id = any(v_papeis) for share;

  -- Papel inativo não se atribui.
  select string_agg(r.name, ', ' order by r.name) into v_inativo
    from public.roles r where r.id = any(v_papeis) and not r.is_active;
  if v_inativo is not null then
    return jsonb_build_object('ok', false, 'erro',
      format('Papel inativo: %s.', v_inativo));
  end if;
  if (select count(*) from public.roles r where r.id = any(v_papeis)) <> cardinality(v_papeis) then
    return jsonb_build_object('ok', false, 'erro', 'Algum papel informado não existe.');
  end if;

  -- RN-RBAC-005: o que os papéis pedidos concedem e o ator NÃO possui.
  select string_agg(distinct p.code, ', ') into v_falta
    from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
   where rp.role_id = any(v_papeis)
     and not public.has_permission(p.code);

  if v_falta is not null then
    return jsonb_build_object('ok', false, 'escalada', true, 'faltam', v_falta,
      'erro', 'Você não pode conceder permissões que você mesmo não possui.');
  end if;

  select string_agg(r.name, ', ' order by r.name) into v_antes
    from public.user_roles ur join public.roles r on r.id = ur.role_id
   where ur.app_user_id = p_app_user_id;

  delete from public.user_roles where app_user_id = p_app_user_id;

  insert into public.user_roles (app_user_id, role_id, assigned_by)
  select p_app_user_id, r.id, v_ator from public.roles r where r.id = any(v_papeis);

  select string_agg(r.name, ', ' order by r.name) into v_depois
    from public.user_roles ur join public.roles r on r.id = ur.role_id
   where ur.app_user_id = p_app_user_id;

  perform public.log_audit('acesso_definir_papeis', 'app_users', p_app_user_id,
    jsonb_build_object('papeis', v_antes),
    jsonb_build_object('papeis', v_depois),
    nullif(btrim(coalesce(p_motivo, '')), ''));

  return jsonb_build_object('ok', true, 'papeis', coalesce(v_depois, ''));
end;
$$;
