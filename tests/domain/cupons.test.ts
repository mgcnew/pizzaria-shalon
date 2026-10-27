import { describe, expect, it } from "vitest";
import { COLUNAS, renderizarTexto } from "@/domain/pedidos/comanda";
import { montarCupomDeVenda, montarFechamentoDeCaixa } from "@/domain/impressao/cupons";
import { montarRelatorioDeFechamento, type EntradaDoRelatorio } from "@/domain/caixa/relatorioDeFechamento";

const VENDA = {
  numero: 1042,
  itens: [
    { quantidade: 2, nome: "Calabresa Grande", total: 100 },
    {
      quantidade: 1,
      nome: "Pizza meio a meio Portuguesa com Frango Catupiry Especial da Casa",
      total: 1234.5,
      detalhes: ["Borda de cheddar"],
    },
  ],
  total: 1334.5,
  pagamento: "Dinheiro",
  recebido: 1400,
  troco: 65.5,
};

/** Uma sessão com movimento de verdade: fundo, vendas, reforço, sangria e despesa. */
const ENTRADA: EntradaDoRelatorio = {
  recebimentos: [
    { metodo: "Dinheiro", familia: "cash", total: 340 },
    { metodo: "Cartão de crédito", familia: "credit", total: 520 },
    { metodo: "Cartão de débito", familia: "debit", total: 100 },
    { metodo: "Pix na maquininha", familia: "pix_machine", total: 180.5 },
    { metodo: "Pix antecipado", familia: "pix_key", total: 50 },
  ],
  totalRecebido: 1190.5,
  fundoInicial: 100,
  movimentos: [
    { tipo: "sale_receipt", sentido: "in", total: 340 },
    { tipo: "supply", sentido: "in", total: 104 },
    { tipo: "withdrawal", sentido: "out", total: 150 },
    { tipo: "expense", sentido: "out", total: 20 },
  ],
  entrou: 444,
  saiu: 170,
  contado: 374,
  esperado: 374,
  diferenca: 0,
  dinheiroForaDaGaveta: 0,
};

const FECHAMENTO = { data: "08/10/2026", ...montarRelatorioDeFechamento(ENTRADA) };

describe("cupom do PDV em texto (D-2026-10-08-116)", () => {
  it("nenhuma linha passa da largura, nas duas larguras", () => {
    for (const largura of [COLUNAS["58"], COLUNAS["80"]]) {
      for (const l of montarCupomDeVenda(VENDA, largura)) expect(l.texto.length).toBeLessThanOrEqual(largura);
    }
  });

  it("diz que não é fiscal e traz número, itens, total, pagamento e troco", () => {
    const t = renderizarTexto(montarCupomDeVenda(VENDA));
    expect(t).toContain("COMPROVANTE NAO FISCAL");
    expect(t).toContain("VENDA #1042");
    expect(t).toContain("2x Calabresa Grande");
    expect(t).toContain("R$ 1.334,50");
    expect(t).toContain("Dinheiro");
    expect(t).toContain("R$ 65,50");
  });

  it("nome comprido quebra, mas o valor do item não é cortado", () => {
    const linhas = montarCupomDeVenda(VENDA).map((l) => l.texto);
    expect(linhas.some((l) => l.trimEnd().endsWith("R$ 1.234,50"))).toBe(true);
  });

  it("segunda via e estorno aparecem em destaque; sem eles, não aparecem", () => {
    const via = montarCupomDeVenda({ ...VENDA, segundaVia: true, estornado: true, cliente: "" });
    expect(via.find((l) => l.texto.includes("SEGUNDA VIA"))?.estilo).toBe("destaque");
    expect(via.find((l) => l.texto.includes("ESTORNADO"))?.estilo).toBe("destaque");
    expect(renderizarTexto(via)).toContain("Balcão");
    expect(renderizarTexto(montarCupomDeVenda(VENDA))).not.toContain("SEGUNDA VIA");
  });
});

describe("fechamento de caixa em texto (D-2026-10-23-163)", () => {
  const texto = (e: Partial<EntradaDoRelatorio> = {}, largura?: number) =>
    renderizarTexto(montarFechamentoDeCaixa({ data: "08/10/2026", ...montarRelatorioDeFechamento({ ...ENTRADA, ...e }) }, largura));

  it("traz o recebido por forma, o movimento da gaveta, o esperado e a conferência", () => {
    const t = texto();
    expect(t).toContain("FECHAMENTO DE CAIXA");
    expect(t).toContain("RECEBIDO POR FORMA");
    expect(t).toContain("GAVETA (DINHEIRO)");
    expect(t).toContain("Esperado");
    expect(t).toContain("CONFERENCIA");
    expect(t).toContain("Contado");
  });

  it("imprime quantas pizzas, fogazzas e bebidas saíram, só as que tiveram venda", () => {
    const t = texto({ itensVendidos: { pizzas: 25, fogazzas: 0, bebidas: 7 } });
    expect(t).toContain("VENDIDO");
    expect(t).toContain("Pizzas");
    expect(t).toContain("25");
    expect(t).toContain("Bebidas");
    expect(t).not.toContain("Fogazzas");
    expect(texto()).not.toContain("VENDIDO");
  });

  it("soma o que entrou e o que saiu, e a conta fecha (fundo + entrou − saiu = esperado)", () => {
    const t = texto();
    expect(t).toContain("Total entrou");
    expect(t).toContain("R$ 444,00");
    expect(t).toContain("Total saiu");
    expect(t).toContain("R$ 170,00");
    expect(t).toContain("Total"); // total recebido
    expect(t).toContain("R$ 1.190,50");
    expect(ENTRADA.fundoInicial + 444 - 170).toBe(ENTRADA.esperado);
  });

  it("só aparece o que teve movimento: sem sangria, não há linha de sangria", () => {
    const t = texto({
      movimentos: [{ tipo: "sale_receipt", sentido: "in", total: 340 }],
      entrou: 340,
      saiu: 0,
      esperado: 440,
      contado: 440,
    });
    expect(t).not.toContain("Sangrias");
    expect(t).not.toContain("Despesas");
    expect(t).not.toContain("Saiu"); // nem o bloco, nem o total
    expect(t).not.toContain("Total saiu");
    expect(t).toContain("Vendas");
  });

  it("fundo zerado não aparece; fundo com valor aparece", () => {
    expect(texto({ fundoInicial: 0 })).not.toContain("Fundo");
    expect(texto({ fundoInicial: 100 })).toContain("Fundo");
  });

  it("formas com nome curto: Crédito, Débito e Pix", () => {
    const t = texto();
    for (const nome of ["Dinheiro", "Crédito", "Débito", "Pix"]) expect(t).toContain(nome);
    for (const longo of ["Cartão de", "Pix na maquininha", "Pix antecipado", "Pix máquina", "Pix chave"])
      expect(t).not.toContain(longo);
  });

  it("os Pix somam numa linha, com a origem recuada logo abaixo (D-2026-10-27-170)", () => {
    const linhas = texto().split("\n");
    const i = linhas.findIndex((l) => /^Pix\b/.test(l));
    expect(linhas[i]).toContain("230,50");
    expect(linhas[i + 1]).toMatch(/^ {2}máquina .*180,50$/);
    expect(linhas[i + 2]).toMatch(/^ {2}antecipado .*50,00$/);
  });

  it("pedidos sem recebimento saem com número e valor", () => {
    const t = texto({
      semRecebimento: [{ pedido_id: "x", numero: 140, cliente: "Ana", modalidade: "delivery",
        status: "completed", total: 89.9, pago_fora_do_caixa: false, fiado: false }],
    });
    expect(t).toContain("SEM RECEBIMENTO");
    expect(t).toMatch(/#140 .*89,90/);
    expect(texto()).not.toContain("SEM RECEBIMENTO");
  });

  it("adiantamento a funcionário e outras saídas aparecem quando existem", () => {
    const t = texto({
      movimentos: [
        { tipo: "sale_receipt", sentido: "in", total: 340 },
        { tipo: "employee_advance", sentido: "out", total: 50 },
        { tipo: "other", sentido: "out", total: 10 },
      ],
      entrou: 340,
      saiu: 60,
    });
    expect(t).toContain("Adiantamento");
    expect(t).toContain("Outros");
  });

  it("sobra e falta de motoboy entram no lado certo", () => {
    const t = texto({
      movimentos: [
        { tipo: "driver_difference", sentido: "in", total: 5 },
        { tipo: "driver_difference", sentido: "out", total: 3 },
      ],
      entrou: 5,
      saiu: 3,
    });
    expect(t).toContain("Sobra moto");
    expect(t).toContain("Falta moto");
  });

  it("dinheiro fora da gaveta só aparece quando existe", () => {
    expect(texto()).not.toContain("Fora gaveta");
    expect(texto({ dinheiroForaDaGaveta: 40 })).toContain("Fora gaveta");
  });

  it("servidor sem os totais novos: o relatório sai, sem as linhas de total", () => {
    const t = renderizarTexto(
      montarFechamentoDeCaixa({
        data: "08/10/2026",
        ...montarRelatorioDeFechamento({
          recebimentos: [{ metodo: "Dinheiro", familia: "cash", total: 340 }],
          fundoInicial: 100,
          legado: {
            recebidoEmDinheiro: 340,
            reforcos: 0,
            sangrias: 150,
            despesas: 0,
            entradas: 0,
            estornos: 0,
            diferencasDeMotoboy: 0,
          },
          contado: 290,
          esperado: 290,
          diferenca: 0,
          dinheiroForaDaGaveta: 0,
        }),
      }),
    );
    expect(t).toContain("Sangrias");
    expect(t).not.toContain("Reforços"); // zerado, escondido
    expect(t).not.toContain("Total entrou");
    expect(t).not.toContain("Total saiu");
  });

  it("nenhuma linha passa da largura, e NADA quebra nem no papel de 58 mm real (25 colunas)", () => {
    // 58 mm: a área útil de 48 mm comporta 25 colunas com a letra fixa.
    for (const largura of [25, COLUNAS["58"], COLUNAS["80"]]) {
      const linhas = montarFechamentoDeCaixa(FECHAMENTO, largura);
      for (const l of linhas) expect(l.texto.length).toBeLessThanOrEqual(largura);
      // Sem quebra: toda linha com valor tem rótulo e valor na MESMA linha.
      const comValor = linhas.filter((l) => /R\$ /.test(l.texto));
      for (const l of comValor) expect(l.texto.trim()).toMatch(/^\S.*\S$/);
    }
    // E nenhum rótulo sozinho numa linha por causa de quebra: o número de linhas
    // com "R$" é o de linhas de valor esperado (cada uma tem o seu).
    const linhas = montarFechamentoDeCaixa(FECHAMENTO, 25);
    const rotulosPartidos = linhas.filter(
      (l, i) => !/R\$ /.test(l.texto) && /R\$ /.test(linhas[i + 1]?.texto ?? "") && l.estilo === "normal" && l.texto.trim() !== "",
    );
    expect(rotulosPartidos).toEqual([]);
  });
});
