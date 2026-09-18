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
