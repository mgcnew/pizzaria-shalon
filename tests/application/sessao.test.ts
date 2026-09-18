import { describe, it, expect } from "vitest";
import { podeNaUI } from "@/application/auth/permissoes";
import type { SessaoInterna } from "@/application/auth/permissoes";

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
