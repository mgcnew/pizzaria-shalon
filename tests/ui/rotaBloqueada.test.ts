import { describe, expect, it } from "vitest";
import { rotaBloqueada } from "@/ui/navegacao";

describe("rotaBloqueada", () => {
  const atendente = ["orders.view", "customers.view", "cash.view", "finance.view"];

  it("bloqueia o módulo sem a permissão, inclusive as páginas dentro dele", () => {
    expect(rotaBloqueada("/admin/remarketing", atendente)).toBe(true);
    expect(rotaBloqueada("/admin/relatorios/vendas", atendente)).toBe(true);
  });

  it("libera quando tem a permissão", () => {
    expect(rotaBloqueada("/admin/pedidos", atendente)).toBe(false);
    expect(rotaBloqueada("/admin/pedidos/abc", atendente)).toBe(false);
  });

  it("aceita qualquer uma das permissões do módulo (PDV)", () => {
    expect(rotaBloqueada("/admin/pdv", ["cash.view"])).toBe(false);
    expect(rotaBloqueada("/admin/pdv", ["orders.create_manual"])).toBe(false);
    expect(rotaBloqueada("/admin/pdv", ["orders.view"])).toBe(true);
  });

  it("painel e perfil são de todos", () => {
    expect(rotaBloqueada("/admin", [])).toBe(false);
    expect(rotaBloqueada("/admin/perfil", [])).toBe(false);
  });

  it("não confunde prefixo parecido", () => {
    expect(rotaBloqueada("/admin/pedidosx", [])).toBe(false);
  });
});
