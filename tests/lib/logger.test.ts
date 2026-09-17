import { describe, it, expect } from "vitest";
import { logger } from "@/lib/logger";

/**
 * 03-RLS-RBAC-SEGURANCA.md §31 proíbe registrar dados sensíveis em log.
 * Este teste protege essa fronteira contra regressão.
 */

describe("logger — redação de dados sensíveis", () => {
  it("redige campos sensíveis por nome", () => {
    const saida = logger._redigir({
      pedido: "1054",
      whatsapp: "(11) 98812-4477",
      tracking_token: "abc123",
      salario: 2100,
    }) as Record<string, unknown>;

    expect(saida.pedido).toBe("1054");
    expect(saida.whatsapp).toBe("[redigido]");
    expect(saida.tracking_token).toBe("[redigido]");
    expect(saida.salario).toBe("[redigido]");
  });

  it("redige em profundidade", () => {
    const saida = logger._redigir({
      cliente: { nome: "Marina", telefone: "11988124477" },
    }) as { cliente: Record<string, unknown> };

    expect(saida.cliente.nome).toBe("Marina");
    expect(saida.cliente.telefone).toBe("[redigido]");
  });

  it("preserva arrays e valores primitivos", () => {
    expect(logger._redigir([1, "a", null])).toEqual([1, "a", null]);
    expect(logger._redigir("texto")).toBe("texto");
  });
});
