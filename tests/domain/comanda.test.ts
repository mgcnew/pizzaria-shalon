import { describe, expect, it } from "vitest";
import {
  LARGURA,
  ladoALado,
  montarAlteracao,
  montarComanda,
  quebrar,
  renderizarTexto,
  type ItemDaComanda,
  type PedidoDaComanda,
} from "@/domain/pedidos/comanda";

const PIZZA: ItemDaComanda = {
  quantidade: 1,
  nome: "Calabresa",
  tamanho: "Tradicional",
  borda: "Catupiry",
  sabores: ["Calabresa", "Mussarela"],
  adicionais: ["Bacon"],
  observacao: "Sem cebola",
};

const PEDIDO: PedidoDaComanda = {
  numero: 1042,
  modalidade: "delivery",
  horario: "19/09 20:15",
  cliente: "Maria Aparecida de Souza",
  itens: [PIZZA],
  observacao: "Interfone quebrado",
  endereco: {
    logradouro: "Rua das Flores",
    numero: "123",
    complemento: "Ap 42",
    bairro: "Centro",
    referencia: "Perto da padaria",
  },
  trocoPara: 150,
  trocoEsperado: 42,
  formaPagamento: "Dinheiro",
};

describe("quebra de linha em 32 colunas", () => {
  it("nunca passa da largura", () => {
    const texto =
      "Pizza Tradicional meio a meio de Calabresa com Catupiry e Mussarela especial";
    for (const linha of quebrar(texto)) {
      expect(linha.length).toBeLessThanOrEqual(LARGURA);
    }
  });

  it("quebra entre palavras quando elas cabem", () => {
    expect(quebrar("um dois tres", 8)).toEqual(["um dois", "tres"]);
  });

  it("parte a palavra só quando ela sozinha não cabe", () => {
    expect(quebrar("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("texto vazio não vira linha", () => {
    expect(quebrar("   ")).toEqual([]);
  });

  it("alinha esquerda e direita na mesma linha", () => {
    const linha = ladoALado("Total", "R$ 10,00");
    expect(linha.length).toBe(LARGURA);
    expect(linha.startsWith("Total")).toBe(true);
    expect(linha.endsWith("R$ 10,00")).toBe(true);
  });
});

describe("comanda de produção", () => {
  it("é determinística: mesma entrada, mesmo texto", () => {
    expect(renderizarTexto(montarComanda(PEDIDO))).toBe(
      renderizarTexto(montarComanda(PEDIDO)),
    );
  });

  it("respeita a largura em todas as linhas", () => {
    for (const linha of montarComanda(PEDIDO)) {
      expect(linha.texto.length).toBeLessThanOrEqual(LARGURA);
    }
  });

  it("declara que não é documento fiscal (CLAUDE.md §32)", () => {
    expect(renderizarTexto(montarComanda(PEDIDO))).toContain("NAO E DOCUMENTO FISCAL");
  });

  it("destaca ENTREGA e RETIRADA (RN-PRINT-003)", () => {
    expect(renderizarTexto(montarComanda(PEDIDO))).toContain(">>> ENTREGA <<<");
    expect(
      renderizarTexto(montarComanda({ ...PEDIDO, modalidade: "pickup", endereco: null })),
    ).toContain(">>> RETIRADA <<<");
  });

  it("traz o que a cozinha precisa: sabores, tamanho, borda, adicionais e observação", () => {
    const texto = renderizarTexto(montarComanda(PEDIDO));
    expect(texto).toContain("Calabresa / Mussarela");
    expect(texto).toContain("MEIO A MEIO");
    expect(texto).toContain("Tradicional");
    expect(texto).toContain("Catupiry");
    expect(texto).toContain("Bacon");
    expect(texto).toContain("Sem cebola");
    expect(texto).toContain("Interfone quebrado");
  });

  it("NÃO vira fechamento financeiro: sem subtotal, taxa ou total", () => {
    const texto = renderizarTexto(montarComanda(PEDIDO));
    expect(texto).not.toMatch(/subtotal/i);
    expect(texto).not.toMatch(/taxa/i);
    expect(texto).not.toMatch(/\btotal\b/i);
  });

  it("leva o troco só na entrega, porque quem sai com a moto precisa dele", () => {
    expect(renderizarTexto(montarComanda(PEDIDO))).toContain("TROCO PARA R$ 150,00");
    expect(renderizarTexto(montarComanda(PEDIDO))).toContain("Levar R$ 42,00");

    const retirada = renderizarTexto(
      montarComanda({ ...PEDIDO, modalidade: "pickup", endereco: null }),
    );
    expect(retirada).not.toContain("TROCO");
  });

  it("entrega já paga na loja sai como PAGO, sem troco nem cobrança", () => {
    const texto = renderizarTexto(montarComanda({ ...PEDIDO, pago: true }));
    expect(texto).toContain("PAGO - NAO COBRAR");
    expect(texto).not.toContain("TROCO");
    expect(texto).not.toContain("Levar");
    expect(texto).not.toContain("Pagamento:");
  });

  it("entrega ainda não paga continua dizendo como cobrar", () => {
    const texto = renderizarTexto(montarComanda({ ...PEDIDO, pago: false }));
    expect(texto).not.toContain("PAGO");
    expect(texto).toContain("TROCO PARA R$ 150,00");
  });

  it("não imprime endereço na retirada", () => {
    const retirada = renderizarTexto(
      montarComanda({ ...PEDIDO, modalidade: "pickup", endereco: null }),
    );
    expect(retirada).not.toContain("Rua das Flores");
  });

  it("imprime o endereço completo na entrega, com referência", () => {
    const texto = renderizarTexto(montarComanda(PEDIDO));
    expect(texto).toContain("Rua das Flores, 123");
    expect(texto).toContain("Ap 42");
    expect(texto).toContain("Perto da padaria");
  });

  it("mostra os componentes do combo", () => {
    const texto = renderizarTexto(
      montarComanda({
        ...PEDIDO,
        itens: [
          {
            quantidade: 1,
            nome: "Combo Família",
            combo: [{ nome: "Pizza Grande", tamanho: "Grande", quantidade: 1 }],
          },
        ],
      }),
    );
    expect(texto).toContain("Combo Família");
    expect(texto).toContain("1x Pizza Grande");
  });
});

describe("documento de ALTERAÇÃO (RN-PRINT-005)", () => {
  const alteracao = montarAlteracao({
    numero: 1042,
    horario: "19/09 20:40",
    motivo: "Acabou a calabresa",
    itensAntes: [{ quantidade: 2, nome: "Calabresa" }],
    itensDepois: [{ quantidade: 1, nome: "Mussarela", tamanho: "Tradicional" }],
  });

  it("é visualmente distinto e diz o que é logo no topo", () => {
    const texto = renderizarTexto(alteracao);
    expect(texto).toContain("*** ALTERACAO ***");
    expect(texto.indexOf("ALTERACAO")).toBeLessThan(texto.indexOf("Motivo"));
  });

  it("avisa que a comanda anterior não vale mais", () => {
    expect(renderizarTexto(alteracao)).toContain("NAO vale mais");
  });

  it("mostra o que era e o que passa a ser", () => {
    const texto = renderizarTexto(alteracao);
    expect(texto).toContain("ERA");
    expect(texto).toContain("2x Calabresa");
    expect(texto).toContain("PASSA A SER");
    expect(texto).toContain("1x Mussarela");
  });

  it("respeita a largura", () => {
    for (const linha of alteracao) {
      expect(linha.texto.length).toBeLessThanOrEqual(LARGURA);
    }
  });
});
