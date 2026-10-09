import { describe, expect, it } from "vitest";
import { COLUNAS, renderizarTexto } from "@/domain/pedidos/comanda";
import { montarCupomDeVenda, montarFechamentoDeCaixa } from "@/domain/impressao/cupons";

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

const FECHAMENTO = {
  data: "08/10/2026",
  contado: 500,
  esperado: 510,
  diferenca: -10,
  recebimentos: [
    { metodo: "Dinheiro", total: 300 },
    { metodo: "Pix na maquininha", total: 210 },
  ],
  movimentos: {
    fundoInicial: 100,
    reforcos: 0,
    sangrias: 50,
    despesas: 0,
    entradas: 0,
    estornos: 0,
    diferencasDeMotoboy: 0,
  },
  dinheiroForaDaGaveta: 0,
};

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

describe("fechamento de caixa em texto", () => {
  it("traz contado, esperado, diferença e as formas", () => {
    const t = renderizarTexto(montarFechamentoDeCaixa(FECHAMENTO));
    expect(t).toContain("FECHAMENTO DE CAIXA");
    expect(t).toContain("R$ 500,00");
    expect(t).toContain("R$ 510,00");
    expect(t).toContain("R$ -10,00"); // mesmo formato da tela (formatBRL)
    expect(t).toContain("Pix na maquininha");
  });

  it("diferença de motoboy e dinheiro fora da gaveta só aparecem quando existem", () => {
    expect(renderizarTexto(montarFechamentoDeCaixa(FECHAMENTO))).not.toContain("motoboy");
    const t = renderizarTexto(
      montarFechamentoDeCaixa({
        ...FECHAMENTO,
        movimentos: { ...FECHAMENTO.movimentos, diferencasDeMotoboy: 5 },
        dinheiroForaDaGaveta: 40,
      }),
    );
    expect(t).toContain("Diferenças de motoboy");
    expect(t).toContain("Dinheiro fora da gaveta");
  });

  it("nenhuma linha passa da largura", () => {
    for (const l of montarFechamentoDeCaixa(FECHAMENTO, COLUNAS["58"])) expect(l.texto.length).toBeLessThanOrEqual(32);
  });
});

describe("convite para o app no cupom", () => {
  const CONVITE = {
    url: "https://pizzariashalon.vercel.app/?origem=cupom",
    endereco: "pizzariashalon.vercel.app",
    chamada: "Peça pelo nosso app!",
    instrucao: "Aponte a câmera do celular",
  };

  it("sai no fim: chamada, QR com o endereço completo e o endereço por extenso", () => {
    const linhas = montarCupomDeVenda({ ...VENDA, convite: CONVITE });
    const qr = linhas.findIndex((l) => l.estilo === "qrcode");
    expect(linhas[qr]?.texto).toBe(CONVITE.url);
    expect(linhas[qr - 1]?.texto.trim()).toBe(CONVITE.chamada);
    expect(linhas.at(-1)?.texto.trim()).toBe(CONVITE.endereco);
  });

  it("sem convite, não há QR", () => {
    expect(montarCupomDeVenda(VENDA).some((l) => l.estilo === "qrcode")).toBe(false);
  });
});
