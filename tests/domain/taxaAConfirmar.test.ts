import { describe, expect, it } from "vitest";
import { tetoDaTaxaAConfirmar } from "@/domain/pedidos/taxaAConfirmar";

describe("tetoDaTaxaAConfirmar", () => {
  it("devolve o teto enquanto a taxa não foi definida", () => {
    expect(tetoDaTaxaAConfirmar({ taxa_a_confirmar: true, taxa_teto: 12 })).toBe(12);
  });
  it("some depois que a loja define a taxa", () => {
    expect(tetoDaTaxaAConfirmar({ taxa_a_confirmar: true, taxa_teto: 12, taxa_definida: 6 })).toBeNull();
  });
  it("taxa definida em zero também conta como definida", () => {
    expect(tetoDaTaxaAConfirmar({ taxa_a_confirmar: true, taxa_teto: 12, taxa_definida: 0 })).toBeNull();
  });
  it("pedido normal ou retirada não tem teto", () => {
    expect(tetoDaTaxaAConfirmar({ taxa_a_confirmar: false, taxa_teto: null })).toBeNull();
    expect(tetoDaTaxaAConfirmar({ logradouro: "Rua A" })).toBeNull();
    expect(tetoDaTaxaAConfirmar(null)).toBeNull();
  });
});
