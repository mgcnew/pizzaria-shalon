import { describe, expect, it } from "vitest";
import { lerValorBR, lerValorOpcionalBR } from "@/domain/catalogo/dinheiro";

describe("lerValorBR", () => {
  it("lê o formato que a Owner digita", () => {
    expect(lerValorBR("56,90")).toEqual({ ok: true, valor: 56.9 });
    expect(lerValorBR("R$ 56,90")).toEqual({ ok: true, valor: 56.9 });
    expect(lerValorBR("1.234,56")).toEqual({ ok: true, valor: 1234.56 });
    expect(lerValorBR("7")).toEqual({ ok: true, valor: 7 });
    expect(lerValorBR("7.5")).toEqual({ ok: true, valor: 7.5 });
  });

  it("recusa o que não é valor", () => {
    expect(lerValorBR("").ok).toBe(false);
    expect(lerValorBR("   ").ok).toBe(false);
    expect(lerValorBR("grátis").ok).toBe(false);
    expect(lerValorBR("12,,5").ok).toBe(false);
  });

  it("recusa valor negativo", () => {
    // O banco também recusa, por CHECK. Aqui a mensagem chega antes.
    expect(lerValorBR("-10").ok).toBe(false);
  });

  it("arredonda para centavos", () => {
    expect(lerValorBR("10,999")).toEqual({ ok: true, valor: 11 });
  });

  it("no campo opcional, vazio não é erro", () => {
    expect(lerValorOpcionalBR("")).toBeNull();
    expect(lerValorOpcionalBR("  ")).toBeNull();
    expect(lerValorOpcionalBR("12,00")).toEqual({ ok: true, valor: 12 });
  });
});
