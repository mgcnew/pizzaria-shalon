import { describe, expect, it } from "vitest";
import { filtrarSabores, palavrasDoTermo } from "@/domain/catalogo/buscaDeSabor";

const sabores = [
  { nome: "Calabresa", descricao: "Calabresa fatiada e cebola" },
  { nome: "Frango com catupiry", descricao: "Frango desfiado e Catupiry" },
  { nome: "Portuguesa", descricao: "Presunto, ovo, cebola e ervilha" },
  { nome: "Atum", descricao: null },
];

const nomes = (lista: { nome: string }[]) => lista.map((s) => s.nome);

describe("palavrasDoTermo", () => {
  it("tira acento, caixa e palavra de ligação", () => {
    expect(palavrasDoTermo("  Frango COM Catupíry ")).toEqual(["frango", "catupiry"]);
  });

  it("se só sobrar ligação, vale o termo inteiro", () => {
    expect(palavrasDoTermo("de")).toEqual(["de"]);
  });

  it("termo vazio não filtra", () => {
    expect(palavrasDoTermo("   ")).toEqual([]);
  });
});

describe("filtrarSabores", () => {
  it("sem termo devolve todos, na mesma ordem", () => {
    expect(nomes(filtrarSabores(sabores, ""))).toEqual(nomes(sabores));
  });

  it("cada palavra precisa aparecer no nome ou na descrição", () => {
    expect(nomes(filtrarSabores(sabores, "cebola"))).toEqual(["Calabresa", "Portuguesa"]);
    expect(nomes(filtrarSabores(sabores, "cebola ovo"))).toEqual(["Portuguesa"]);
  });

  it("ignora acento e ligação", () => {
    expect(nomes(filtrarSabores(sabores, "frango c/ catupíry"))).toEqual(["Frango com catupiry"]);
  });

  it("descrição vazia não quebra", () => {
    expect(nomes(filtrarSabores(sabores, "atum"))).toEqual(["Atum"]);
  });

  it("nada encontrado devolve lista vazia", () => {
    expect(filtrarSabores(sabores, "chocolate")).toEqual([]);
  });
});
