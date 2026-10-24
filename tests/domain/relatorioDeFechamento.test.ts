import { describe, expect, it } from "vitest";
import { montarRelatorioDeFechamento, nomeCurtoDaForma } from "@/domain/caixa/relatorioDeFechamento";

const base = {
  recebimentos: [],
  fundoInicial: 0,
  contado: 0,
  esperado: 0,
  diferenca: 0,
  dinheiroForaDaGaveta: 0,
};

describe("nome curto das formas de pagamento (D-2026-10-23-163)", () => {
  it("vem pela família, então não muda se renomearem a forma no painel", () => {
    expect(nomeCurtoDaForma("Qualquer nome", "credit")).toBe("Crédito");
    expect(nomeCurtoDaForma("Cartão de débito", "debit")).toBe("Débito");
    expect(nomeCurtoDaForma("Pix na maquininha", "pix_machine")).toBe("Pix máquina");
    expect(nomeCurtoDaForma("Pix antecipado", "pix_key")).toBe("Pix chave");
    expect(nomeCurtoDaForma("Dinheiro", "cash")).toBe("Dinheiro");
    expect(nomeCurtoDaForma("Vale refeição X", "other")).toBe("Vale refeição X");
  });

  it("todo nome curto cabe em 12 caracteres, para caber com o valor no papel de 58 mm", () => {
    for (const familia of ["cash", "credit", "debit", "pix_machine", "pix_key", "voucher"]) {
      expect(nomeCurtoDaForma("x", familia).length).toBeLessThanOrEqual(12);
    }
  });
});

describe("relatório do fechamento", () => {
  it("só traz o que teve movimento e esconde recebimento zerado", () => {
    const r = montarRelatorioDeFechamento({
      ...base,
      recebimentos: [
        { metodo: "Dinheiro", familia: "cash", total: 100 },
        { metodo: "Voucher", familia: "voucher", total: 0 },
      ],
      movimentos: [
        { tipo: "sale_receipt", sentido: "in", total: 100 },
        { tipo: "withdrawal", sentido: "out", total: 0 },
      ],
    });
    expect(r.recebidos).toEqual([{ rotulo: "Dinheiro", valor: 100 }]);
    expect(r.entradas).toEqual([{ rotulo: "Vendas", valor: 100 }]);
    expect(r.saidas).toEqual([]);
  });

  it("ordena entradas e saídas sempre na mesma ordem", () => {
    const r = montarRelatorioDeFechamento({
      ...base,
      movimentos: [
        { tipo: "supply", sentido: "in", total: 10 },
        { tipo: "sale_receipt", sentido: "in", total: 50 },
        { tipo: "refund", sentido: "out", total: 5 },
        { tipo: "withdrawal", sentido: "out", total: 20 },
      ],
    });
    expect(r.entradas.map((l) => l.rotulo)).toEqual(["Vendas", "Reforços"]);
    expect(r.saidas.map((l) => l.rotulo)).toEqual(["Sangrias", "Estornos"]);
  });

  it("usa os totais do servidor e não soma nada por conta própria", () => {
    const r = montarRelatorioDeFechamento({
      ...base,
      movimentos: [{ tipo: "sale_receipt", sentido: "in", total: 50 }],
      entrou: 999, // de propósito diferente: o relatório repete o que o servidor mandou
      saiu: 7,
      totalRecebido: 123,
    });
    expect(r.totalEntrou).toBe(999);
    expect(r.totalSaiu).toBe(7);
    expect(r.totalRecebido).toBe(123);
  });

  it("sem os totais do servidor, eles ficam nulos (a linha não sai)", () => {
    const r = montarRelatorioDeFechamento({ ...base, movimentos: [] });
    expect(r.totalEntrou).toBeNull();
    expect(r.totalSaiu).toBeNull();
    expect(r.totalRecebido).toBeNull();
  });

  it("todo rótulo de movimento cabe em 12 caracteres", () => {
    const tipos = ["sale_receipt", "supply", "other", "adjustment", "driver_difference", "withdrawal", "expense", "employee_advance", "refund"];
    const r = montarRelatorioDeFechamento({
      ...base,
      movimentos: tipos.flatMap((tipo) => [
        { tipo, sentido: "in" as const, total: 1 },
        { tipo, sentido: "out" as const, total: 1 },
      ]),
    });
    for (const l of [...r.entradas, ...r.saidas]) expect(l.rotulo.length).toBeLessThanOrEqual(12);
  });

  it("tipo de movimento desconhecido não some: aparece com o nome do tipo", () => {
    const r = montarRelatorioDeFechamento({ ...base, movimentos: [{ tipo: "novo_tipo", sentido: "out", total: 9 }] });
    expect(r.saidas).toEqual([{ rotulo: "novo_tipo", valor: 9 }]);
  });
});

describe("itens vendidos no fechamento (D-2026-10-24-166)", () => {
  it("traz pizzas, fogazzas e bebidas, nessa ordem", () => {
    const r = montarRelatorioDeFechamento({ ...base, itensVendidos: { pizzas: 25, fogazzas: 3, bebidas: 7 } });
    expect(r.vendidos).toEqual([
      { rotulo: "Pizzas", quantidade: 25 },
      { rotulo: "Fogazzas", quantidade: 3 },
      { rotulo: "Bebidas", quantidade: 7 },
    ]);
  });

  it("não mostra o que não vendeu", () => {
    const r = montarRelatorioDeFechamento({ ...base, itensVendidos: { pizzas: 4, fogazzas: 0, bebidas: 0 } });
    expect(r.vendidos).toEqual([{ rotulo: "Pizzas", quantidade: 4 }]);
  });

  it("servidor sem a contagem: a seção simplesmente não sai", () => {
    expect(montarRelatorioDeFechamento(base).vendidos).toEqual([]);
    expect(montarRelatorioDeFechamento({ ...base, itensVendidos: { pizzas: 0, fogazzas: 0, bebidas: 0 } }).vendidos).toEqual([]);
  });
});
