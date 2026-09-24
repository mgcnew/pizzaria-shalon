-- 0106 — A-21: ninguém concede permissão que não possui, nem por papel
-- 03-RLS-RBAC-SEGURANCA.md §19.7 · 04-REGRAS-NEGOCIO.md RN-RBAC-005/006
-- CLAUDE.md §14, §33, §34
--
-- A ESCALADA, REPRODUZIDA ANTES DESTA MIGRATION.
--
-- Ator: papel customizado com `roles.manage` + `orders.view`, SEM
-- `finance.view` e SEM `finance.reverse`. Vítima: usuário já vinculado a um
-- papel aparentemente inofensivo.
--
--   1/3. insert direto de `finance.view` em role_permissions   FUNCIONOU
--   4.   delete direto em role_permissions                     FUNCIONOU
--   2.   criar papel ponte e pôr `finance.reverse` nele        FUNCIONOU
--   5.   definir_papeis(vítima, [ponte])                       bloqueado
--   6.   definir_papeis(si próprio, [ponte])                   bloqueado
--   RETROATIVO: pôr `finance.reverse` no papel JÁ atribuído    FUNCIONOU
--
-- E o que importa não é a linha inserida, é o poder: ao final, a vítima
-- tinha `finance.view = true` e `finance.reverse = true` — duas permissões
-- que o ator NUNCA possuiu.
--
-- POR QUE `definir_papeis` NÃO BASTAVA. Ela implementa RN-RBAC-005 e
-- recusa corretamente atribuir papel que conceda o que o ator não tem — os
-- ataques 5 e 6 morrem nela. Mas ela valida no INSTANTE DA ATRIBUIÇÃO. O
-- caminho retroativo não passa por ela: o papel é atribuído inofensivo e
-- engorda depois, por escrita direta.
--
-- A CORREÇÃO, em duas partes.
--
-- PARTE 1 — `role_permissions` deixa de ser CRUD genérico. As policies de
-- INSERT e DELETE exigiam apenas `roles.manage`, e `roles.manage` não é, nem
-- nunca foi, "poder absoluto". A leitura continua aberta a usuário interno:
-- a sessão precisa dela para montar as permissões efetivas.
--
-- Fechar não tira função de ninguém: a aplicação NUNCA escreveu nessas
-- tabelas — ela lê `roles(name, role_permissions(permissions(code)))` na
-- sessão e usa `papeis_atribuiveis` e `definir_papeis`. A composição dos dois
-- papéis de sistema veio do seed, por migration.
--
-- PARTE 2 — o comando de domínio que passa a ser a única porta.
-- `definir_permissoes_do_papel` valida o CONJUNTO FINAL, não o delta: se o
-- papel terminaria com `{A,B,X}` e o ator não tem `X`, recusa — mesmo que a
-- operação estivesse apenas acrescentando `B`. É o que impede escalada por
-- construção incremental.
--
-- Também exige que o ator possua o que está REMOVENDO. Não é
-- anti-escalada — é a leitura conservadora de "administrar um papel": quem
-- não pode conceder `finance.reverse` também não deveria poder arrancá-la de
-- um papel que a Owner concedeu. Na dúvida entre poder demais e poder de
-- menos, esta migration escolhe de menos.
--
-- TOCTOU. As duas portas passam a travar as MESMAS linhas de `roles`:
-- `definir_permissoes_do_papel` com `for update`, `definir_papeis` com
-- `for share`. Assim "valida o conjunto → outra transação engorda o papel →
-- atribui" deixa de ser possível: a segunda transação espera a primeira.
--
-- OWNER. Nenhum bypass novo. A Owner passa por exatamente a mesma regra —
-- ela administra qualquer papel porque POSSUI todas as permissões
-- cadastradas, o que é fato do seed e continua verificável em
-- `role_permissions`, não um `if owner then`.

-- ============================================================ PARTE 1
drop policy if exists role_permissions_insert on public.role_permissions;
drop policy if exists role_permissions_delete on public.role_permissions;

comment on table public.role_permissions is
  'Quais permissoes cada papel concede. Alteracoes sao auditadas. Escrita SOMENTE por definir_permissoes_do_papel (A-21, migration 0106): policy de INSERT/DELETE foi removida porque exigia apenas roles.manage e permitia conceder permissao que o ator nao possui.';

-- ============================================================ PARTE 2
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

  -- Trava a linha do papel: serializa contra outra edição E contra
  -- `definir_papeis`, que trava as mesmas linhas em modo compartilhado.
  select * into v_papel from public.roles r where r.id = p_role_id for update;
  if v_papel.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Papel não encontrado.');
  end if;
  if v_papel.is_system then
    return jsonb_build_object('ok', false, 'erro',
      'Papel de sistema não pode ter as permissões alteradas.');
  end if;

  if (select count(*) from public.permissions p where p.id = any(v_ids)) <> cardinality(v_ids) then
    return jsonb_build_object('ok', false, 'erro', 'Alguma permissão informada não existe.');
  end if;

  -- A REGRA. O conjunto examinado é o FINAL pretendido somado ao que está
  -- saindo — nunca apenas o que está entrando agora.
  select string_agg(distinct p.code, ', ') into v_falta
    from public.permissions p
   where (
           p.id = any(v_ids)                                   -- vai ficar
           or p.id in (select rp.permission_id                 -- vai sair
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

comment on function public.definir_permissoes_do_papel is
  'Unica porta de escrita em role_permissions. Valida o conjunto FINAL contra as permissoes do ator (A-21).';

revoke all on function public.definir_permissoes_do_papel(uuid, uuid[], text) from public, anon;
grant execute on function public.definir_permissoes_do_papel(uuid, uuid[], text) to authenticated;
