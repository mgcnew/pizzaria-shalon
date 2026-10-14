import { describe, expect, it } from "vitest";
import { colunasNaLargura, LARGURA_DO_CARACTERE_MM } from "@/ui/impressao/imprimir";

describe("letra fixa, colunas calculadas (13/10/2026)", () => {
  it("80 mm: menos colunas a cada margem, sem encolher a letra", () => {
    expect(colunasNaLargura(72)).toBe(37);
    expect(colunasNaLargura(72 - 2 * 4)).toBe(33);
    expect(colunasNaLargura(72 - 2 * 6)).toBe(31);
  });

  it("as colunas sempre cabem na largura com a letra fixa", () => {
    for (const largura of [48, 60, 64, 68, 72]) {
      expect(colunasNaLargura(largura) * LARGURA_DO_CARACTERE_MM).toBeLessThanOrEqual(Math.max(largura, 24 * LARGURA_DO_CARACTERE_MM));
    }
  });

  it("nunca menos de 24 colunas", () => {
    expect(colunasNaLargura(30)).toBe(24);
  });
});
