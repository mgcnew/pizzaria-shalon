import "server-only";
import { cache } from "react";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import type { SessaoInterna } from "./permissoes";

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

  // O RLS já limita o que volta: sem usuário interno ativo, não vem nada.
  const { data: appUser } = await supabase
    .from("app_users")
    .select("id, employee_id, employees(full_name)")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (!appUser) return null;

  const { data: vinculos } = await supabase
    .from("user_roles")
    .select("roles(name, role_permissions(permissions(code)))")
    .eq("app_user_id", appUser.id);

  const papeis: string[] = [];
  const permissoes = new Set<string>();

  type Vinculo = {
    roles: {
      name: string;
      role_permissions: { permissions: { code: string } | null }[] | null;
    } | null;
  };

  for (const v of (vinculos ?? []) as unknown as Vinculo[]) {
    if (!v.roles) continue;
    papeis.push(v.roles.name);
    for (const rp of v.roles.role_permissions ?? []) {
      if (rp.permissions) permissoes.add(rp.permissions.code);
    }
  }

  const employee = (appUser as unknown as { employees: { full_name: string } | null })
    .employees;

  return {
    appUserId: appUser.id as string,
    employeeId: appUser.employee_id as string,
    nome: employee?.full_name ?? "",
    papeis,
    permissoes: [...permissoes].sort(),
  };
});

export type { SessaoInterna };
export { podeNaUI } from "./permissoes";
