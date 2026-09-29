import "server-only";
import { cache } from "react";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { montarSessaoInterna, type LinhaDeUsuarioInterno, type SessaoInterna } from "./permissoes";

/**
 * Caso de uso: identidade e permissões da sessão interna.
 *
 * O frontend NUNCA decide autorização. Esta camada apenas PERGUNTA ao banco
 * quem é o usuário e o que ele pode, para que a interface esconda o que não
 * se aplica. Toda leitura ou escrita continua barrada pelo RLS, mesmo que
 * alguém contorne a interface (CLAUDE.md §12, RN-RBAC-003).
 */

/**
 * Retorna a sessão interna, ou null quando não há usuário interno ativo.
 *
 * `cache` é somente da renderização corrente do React: layout, página e modal
 * compartilham a mesma promessa, mas uma nova requisição consulta tudo de
 * novo. Não há cache de permissão entre usuários ou entre navegações.
 */
export const obterSessaoInterna = cache(async (): Promise<SessaoInterna | null> => {
  const supabase = await getSupabaseServerClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const authUserId = claimsData?.claims.sub;
  if (typeof authUserId !== "string") return null;

  // Usuário, papéis e permissões numa só ida ao banco: o PostgREST embute as
  // tabelas e aplica o RLS de cada uma, como nas duas consultas em fila que
  // havia antes. Sem usuário interno ativo, não vem nada. A dica
  // `!user_roles_app_user_id_fkey` é obrigatória: `user_roles` também aponta
  // para `app_users` por `assigned_by`, e sem ela o PostgREST recusa o embed
  // por ambiguidade (PGRST201).
  const { data: appUser } = await supabase
    .from("app_users")
    .select(
      "id, employee_id, employees(full_name), user_roles!user_roles_app_user_id_fkey(roles(name, role_permissions(permissions(code))))",
    )
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (!appUser) return null;

  return montarSessaoInterna(appUser as unknown as LinhaDeUsuarioInterno);
});

export type { SessaoInterna };
export { podeNaUI } from "./permissoes";
