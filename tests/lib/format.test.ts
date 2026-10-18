import { describe, it, expect } from "vitest";
import { formatBRL, maskWhatsApp, formatarTelefone } from "@/lib/format";

/**
 * Testes de formatação de apresentação.
 *
 * Os valores esperados foram conferidos contra o design aprovado, que exibe
 * "R$ 62,90" e "(11) 98812-4477".
 */

describe("formatBRL", () => {
  it("formata no padrão brasileiro do design", () => {
    expect(formatBRL(62.9)).toBe("R$ 62,90");
    expect(formatBRL(14)).toBe("R$ 14,00");
    expect(formatBRL(0)).toBe("R$ 0,00");
  });

  it("usa separador de milhar", () => {
    expect(formatBRL(1842.4)).toBe("R$ 1.842,40");
  });

  it("arredonda para duas casas", () => {
    expect(formatBRL(56.899)).toBe("R$ 56,90");
  });
});

describe("maskWhatsApp", () => {
  it("aplica a máscara de celular com 11 dígitos", () => {
    expect(maskWhatsApp("11988124477")).toBe("(11) 98812-4477");
  });

  it("aplica a máscara de fixo com 10 dígitos", () => {
    expect(maskWhatsApp("1140028922")).toBe("(11) 4002-8922");
  });

  it("formata parcialmente enquanto o usuário digita", () => {
    expect(maskWhatsApp("")).toBe("");
    expect(maskWhatsApp("11")).toBe("(11");
    expect(maskWhatsApp("1198")).toBe("(11) 98");
  });

  it("ignora caracteres não numéricos e limita a 11 dígitos", () => {
    expect(maskWhatsApp("(11) 98812-4477999")).toBe("(11) 98812-4477");
  });
});

describe("formatarTelefone", () => {
  it("celular e fixo com DDD", () => {
    expect(formatarTelefone("11988113831")).toBe("(11) 98811-3831");
    expect(formatarTelefone("1163622423")).toBe("(11) 6362-2423");
  });
  it("tira o 55 do país", () => {
    expect(formatarTelefone("+55 11 98811-3831")).toBe("(11) 98811-3831");
  });
  it("formato desconhecido volta como veio", () => {
    expect(formatarTelefone("12345")).toBe("12345");
  });
});
