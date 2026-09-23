import { describe, it, expect } from "vitest";
import {
  LIMITE_DE_MENOR_MOVIMENTACAO,
  recorteDeMenorMovimentacao,
  type ProdutoComparavel,
} from "@/domain/analitico/ranking";

/**
 * RN-REL-005 — o bloco de menor movimentação.
 *
 * O que estes testes protegem é a distância entre duas frases: "vendeu menos
 * que os outros comparáveis" (que o sistema sabe) e "tem pouca demanda" (que
 * ele não sabe). Na prática isso vira três garantias: só entra quem é
 * comparável, quem está no topo da outra lista nunca entra, e a mesma
 * pergunta devolve sempre a mesma lista.
 */

function produto(
  nome: string,
  quantidade: number,
  elegivel = true,
): ProdutoComparavel {
  return {
    produto_id: `id-${nome}`,
    nome,
    quantidade,
    elegivel_para_baixa_venda: elegivel,
  };
}

describe("recorteDeMenorMovimentacao", () => {
  it("só considera produtos elegíveis", () => {
    const r = recorteDeMenorMovimentacao([
      produto("Novidade", 0, false),
      produto("Pausada", 0, false),
      produto("Comparável", 3),
    ]);
    expect(r.map((p) => p.nome)).toEqual(["Comparável"]);
  });

  it("ordena da menor quantidade para a maior", () => {
    const r = recorteDeMenorMovimentacao([
      produto("C", 9),
      produto("A", 1),
      produto("B", 4),
    ]);
    expect(r.map((p) => p.nome)).toEqual(["A", "B", "C"]);
  });

  it("desempata pelo nome, e o resultado não depende da ordem de entrada", () => {
    const entrada = [produto("Zebra", 2), produto("Abacaxi", 2), produto("Melão", 2)];
    const esperado = ["Abacaxi", "Melão", "Zebra"];
    expect(recorteDeMenorMovimentacao(entrada).map((p) => p.nome)).toEqual(esperado);
    expect(
      recorteDeMenorMovimentacao([...entrada].reverse()).map((p) => p.nome),
    ).toEqual(esperado);
  });

  it("nunca repete quem está no grupo de mais vendidos", () => {
    // O caso real: com dois comparáveis, pegar "o fundo da lista" traria o
    // campeão de vendas junto, e a mesma tela diria que o mais vendido está
    // vendendo pouco.
    const campeao = produto("Campeã", 80);
    const parada = produto("Parada", 0);
    const r = recorteDeMenorMovimentacao([campeao, parada], [campeao]);
    expect(r.map((p) => p.nome)).toEqual(["Parada"]);
  });

  it("limita a cinco por padrão", () => {
    const muitos = Array.from({ length: 12 }, (_, i) =>
      produto(`P${String(i).padStart(2, "0")}`, i),
    );
    const r = recorteDeMenorMovimentacao(muitos);
    expect(r).toHaveLength(LIMITE_DE_MENOR_MOVIMENTACAO);
    expect(r.map((p) => p.nome)).toEqual(["P00", "P01", "P02", "P03", "P04"]);
  });

  it("funciona com menos elegíveis que o limite", () => {
    const r = recorteDeMenorMovimentacao([produto("Única", 2), produto("Nova", 0, false)]);
    expect(r.map((p) => p.nome)).toEqual(["Única"]);
  });

  it("devolve lista vazia quando não há nenhum comparável", () => {
    expect(recorteDeMenorMovimentacao([produto("Nova", 0, false)])).toEqual([]);
    expect(recorteDeMenorMovimentacao([])).toEqual([]);
  });

  it("não altera a lista recebida", () => {
    const entrada = [produto("B", 5), produto("A", 1)];
    const copia = entrada.map((p) => p.nome);
    recorteDeMenorMovimentacao(entrada);
    expect(entrada.map((p) => p.nome)).toEqual(copia);
  });
});
