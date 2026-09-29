/**
 * Tipos e checagem pura de permissão.
 *
 * Sem I/O e sem `server-only`: é lógica pura, testável isoladamente e
 * reutilizável no servidor e no cliente.
 *
 * ATENÇÃO: esconder um botão não é segurança (CLAUDE.md §12, RN-RBAC-003).
 * Isto existe apenas para a interface não oferecer ações que o usuário não
 * pode executar. A autorização real acontece no banco, via RLS.
 */

export type SessaoInterna = {
  appUserId: string;
  employeeId: string;
  nome: string;
  papeis: string[];
  permissoes: string[];
};

/** Verdadeiro somente com correspondência exata do código da permissão. */
export function podeNaUI(sessao: SessaoInterna | null, permissao: string): boolean {
  return sessao?.permissoes.includes(permissao) ?? false;
}

/**
 * A linha de `app_users` como o PostgREST a devolve, com funcionário, papéis
 * e permissões embutidos numa única consulta (`obterSessaoInterna`). Qualquer
 * parte pode vir nula: o RLS de cada tabela embutida esconde o que o usuário
 * não pode ler, e a sessão montada fica sem aquilo, nunca com mais.
 */
export type LinhaDeUsuarioInterno = {
  id: string;
  employee_id: string;
  employees: { full_name: string } | null;
  user_roles:
    | {
        roles: {
          name: string;
          role_permissions: { permissions: { code: string } | null }[] | null;
        } | null;
      }[]
    | null;
};

/**
 * Monta a sessão a partir da linha embutida. Um código concedido por mais de
 * um papel aparece uma vez só, e a lista sai ordenada.
 */
export function montarSessaoInterna(linha: LinhaDeUsuarioInterno): SessaoInterna {
  const papeis: string[] = [];
  const permissoes = new Set<string>();

  for (const vinculo of linha.user_roles ?? []) {
    if (!vinculo.roles) continue;
    papeis.push(vinculo.roles.name);
    for (const rp of vinculo.roles.role_permissions ?? []) {
      if (rp.permissions) permissoes.add(rp.permissions.code);
    }
  }

  return {
    appUserId: linha.id,
    employeeId: linha.employee_id,
    nome: linha.employees?.full_name ?? "",
    papeis,
    permissoes: [...permissoes].sort(),
  };
}
