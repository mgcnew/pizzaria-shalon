import { describe, expect, it } from "vitest";
import {
  alternarFavorito,
  ehFavorito,
  lerFavoritos,
  SEM_FAVORITOS,
} from "@/domain/carrinho/favoritos";

describe("favoritos (RN-FAV-001)", () => {
  it("adiciona e remove", () => {
    let f = alternarFavorito(SEM_FAVORITOS, "p1");
    expect(ehFavorito(f, "p1")).toBe(true);
    f = alternarFavorito(f, "p1");
    expect(ehFavorito(f, "p1")).toBe(false);
  });

  it("guarda só ids, sem preço nem disponibilidade", () => {
    const f = alternarFavorito(SEM_FAVORITOS, "p1");
    expect(f).toEqual(["p1"]);
  });

  it("trata o armazenamento local como entrada não confiável", () => {
    expect(lerFavoritos(null)).toEqual([]);
    expect(lerFavoritos("p1")).toEqual([]);
    expect(lerFavoritos(["p1", 42, "", "p2", "p1"])).toEqual(["p1", "p2"]);
  });

  it("tem teto de tamanho", () => {
    const muitos = Array.from({ length: 400 }, (_, i) => `p${i}`);
    expect(lerFavoritos(muitos)).toHaveLength(300);
  });
});
