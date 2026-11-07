import { describe, expect, it } from "vitest";
import { opcoesDeTamanho, saboresQueFaltam } from "@/domain/catalogo/opcoesDeTamanho";

const tradicional = { variacao_id: "t", max_sabores: 2, min_sabores: 1, meio_a_meio_separado: true };
const broto = { variacao_id: "b", max_sabores: 2, min_sabores: 1, meio_a_meio_separado: false };
const especial = { variacao_id: "e", max_sabores: 3, min_sabores: 3, meio_a_meio_separado: false };

describe("opções de tamanho (D-2026-11-06-184)", () => {
  const opcoes = opcoesDeTamanho([tradicional, broto, especial]);

  it("fica Tradicional, Meio a meio, Broto e Especial", () => {
    expect(opcoes.map((o) => o.chave)).toEqual(["t", "t:meio", "b", "e"]);
  });

  it("Tradicional é 1 sabor e Meio a meio exige 2, no mesmo tamanho", () => {
    expect(opcoes[0]).toMatchObject({ meio: false, minimo: 1, maximo: 1 });
    expect(opcoes[1]).toMatchObject({ meio: true, minimo: 2, maximo: 2, tamanho: tradicional });
  });

  it("Broto continua com o 2º sabor opcional e Especial exige 3", () => {
    expect(opcoes[2]).toMatchObject({ minimo: 1, maximo: 2 });
    expect(opcoes[3]).toMatchObject({ minimo: 3, maximo: 3 });
  });

  it("sem os campos novos, o tamanho segue como antes", () => {
    expect(opcoesDeTamanho([{ variacao_id: "x", max_sabores: 2 }])).toEqual([
      { chave: "x", tamanho: { variacao_id: "x", max_sabores: 2 }, meio: false, minimo: 1, maximo: 2 },
    ]);
  });

  it("conta quantos sabores ainda faltam", () => {
    expect(saboresQueFaltam(opcoes[3]!, 1)).toBe(2);
    expect(saboresQueFaltam(opcoes[1]!, 2)).toBe(0);
    expect(saboresQueFaltam(null, 0)).toBe(0);
  });
});
