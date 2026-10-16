import { describe, expect, it } from "vitest";
import { casaPeloNome } from "@/domain/catalogo/buscaDeSabor";

describe("casaPeloNome", () => {
  it("casa pelo nome do item", () => {
    expect(casaPeloNome("calabresa", ["Calabresa", "Pizzas Salgadas"])).toBe(true);
  });

  it("não casa por ingrediente da descrição (que nem é passada)", () => {
    expect(casaPeloNome("calabresa", ["À Moda", "Pizzas Salgadas"])).toBe(false);
  });

  it("ignora acento e caixa", () => {
    expect(casaPeloNome("A MODA", ["À Moda"])).toBe(true);
    expect(casaPeloNome("brocolis", ["Brócolis"])).toBe(true);
  });

  it("exige todas as palavras e ignora ligação", () => {
    expect(casaPeloNome("moda da casa", ["À Moda da casa"])).toBe(true);
    expect(casaPeloNome("moda pizzaiolo", ["À Moda da casa"])).toBe(false);
  });

  it("aceita buscar pela categoria", () => {
    expect(casaPeloNome("bebidas", ["Coca-Cola", "Bebidas"])).toBe(true);
  });

  it("termo vazio não filtra", () => {
    expect(casaPeloNome("", ["qualquer"])).toBe(true);
  });
});
