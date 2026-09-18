import { describe, expect, it } from "vitest";
import { gerarSlug, slugValido } from "@/domain/catalogo/slug";

describe("gerarSlug", () => {
  it("remove acento, caixa e pontuação", () => {
    expect(gerarSlug("Pizza Calabresa Especial!")).toBe("pizza-calabresa-especial");
    expect(gerarSlug("Fogazza de Frango c/ Catupiry")).toBe("fogazza-de-frango-c-catupiry");
    expect(gerarSlug("PIZZA À MODA")).toBe("pizza-a-moda");
  });

  it("não deixa hífen sobrando nas pontas nem repetido", () => {
    expect(gerarSlug("  Coca-Cola 2L  ")).toBe("coca-cola-2l");
    expect(gerarSlug("!!! Promoção !!!")).toBe("promocao");
  });

  it("gera sempre algo que o banco aceita", () => {
    // A constraint em `categories.slug` e `products.slug` é a autoridade;
    // esta função existe para nunca esbarrar nela.
    for (const nome of [
      "Pizza Quatro Queijos",
      "Brotinho — Doce de Leite",
      "Refrigerante 350ml (lata)",
      "Combo Família nº 1",
    ]) {
      expect(slugValido(gerarSlug(nome))).toBe(true);
    }
  });
});
