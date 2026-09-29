import { describe, it, expect } from "vitest";
import { montarSessaoInterna, podeNaUI } from "@/application/auth/permissoes";
import type { LinhaDeUsuarioInterno, SessaoInterna } from "@/application/auth/permissoes";

/**
 * A checagem de permissão da interface NÃO é segurança — quem autoriza é o
 * RLS (CLAUDE.md §12, RN-RBAC-003). Estes testes garantem que ela ao menos não
 * mente: nada de "permitir por padrão" quando a sessão não existe.
 *
 * A autorização de verdade é testada em supabase/tests/rls_fase2.sql, contra
 * um Postgres real, com 48 cenários positivos e negativos.
 */

const atendente: SessaoInterna = {
  appUserId: "u1",
  employeeId: "e1",
  nome: "Rafaela",
  papeis: ["Atendente"],
  permissoes: ["orders.view", "employees.view", "cash.open"],
};

describe("podeNaUI", () => {
  it("reconhece permissão concedida", () => {
    expect(podeNaUI(atendente, "orders.view")).toBe(true);
    expect(podeNaUI(atendente, "cash.open")).toBe(true);
  });

  it("nega permissão não concedida", () => {
    expect(podeNaUI(atendente, "employees.finance.view")).toBe(false);
    expect(podeNaUI(atendente, "roles.manage")).toBe(false);
    expect(podeNaUI(atendente, "audit.view")).toBe(false);
  });

  it("nega tudo quando não há sessão", () => {
    expect(podeNaUI(null, "orders.view")).toBe(false);
    expect(podeNaUI(null, "employees.view")).toBe(false);
  });

  it("não faz correspondência parcial de código", () => {
    // 'employees.view' não pode conceder 'employees.finance.view'.
    expect(podeNaUI(atendente, "employees")).toBe(false);
    expect(podeNaUI(atendente, "orders")).toBe(false);
  });
});

/**
 * A sessão vem de UMA consulta com papéis e permissões embutidos
 * (D-2026-09-29-88). O RLS de cada tabela embutida pode devolver nulo no
 * lugar do que o usuário não lê; a sessão montada fica sem aquilo, nunca com
 * mais.
 */
describe("montarSessaoInterna", () => {
  const papel = (name: string, codes: (string | null)[]) => ({
    roles: {
      name,
      role_permissions: codes.map((code) => ({ permissions: code === null ? null : { code } })),
    },
  });

  const linha = (user_roles: LinhaDeUsuarioInterno["user_roles"]): LinhaDeUsuarioInterno => ({
    id: "u1",
    employee_id: "e1",
    employees: { full_name: "Rafaela" },
    user_roles,
  });

  it("junta papéis e permissões, sem repetir código e em ordem", () => {
    const sessao = montarSessaoInterna(
      linha([
        papel("Atendente", ["orders.view", "cash.open"]),
        papel("Caixa", ["cash.open", "cash.adjust"]),
      ]),
    );
    expect(sessao).toEqual({
      appUserId: "u1",
      employeeId: "e1",
      nome: "Rafaela",
      papeis: ["Atendente", "Caixa"],
      permissoes: ["cash.adjust", "cash.open", "orders.view"],
    });
  });

  it("ignora papel e permissão que o RLS não devolveu", () => {
    const sessao = montarSessaoInterna(
      linha([{ roles: null }, papel("Atendente", ["orders.view", null])]),
    );
    expect(sessao.papeis).toEqual(["Atendente"]);
    expect(sessao.permissoes).toEqual(["orders.view"]);
  });

  it("sem vínculos, a sessão existe mas não pode nada", () => {
    for (const vinculos of [null, []]) {
      const sessao = montarSessaoInterna(linha(vinculos));
      expect(sessao.papeis).toEqual([]);
      expect(sessao.permissoes).toEqual([]);
      expect(podeNaUI(sessao, "orders.view")).toBe(false);
    }
  });

  it("papel sem lista de permissões não concede nada", () => {
    const sessao = montarSessaoInterna(
      linha([{ roles: { name: "Novo", role_permissions: null } }]),
    );
    expect(sessao.papeis).toEqual(["Novo"]);
    expect(sessao.permissoes).toEqual([]);
  });

  it("sem funcionário visível, o nome fica vazio", () => {
    expect(montarSessaoInterna({ ...linha([]), employees: null }).nome).toBe("");
  });
});
