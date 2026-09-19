import { describe, expect, it } from "vitest";
import {
  adicionarItem,
  alterarQuantidade,
  CARRINHO_VAZIO,
  chaveDaConfiguracao,
  expirado,
  lerCarrinho,
  paraRevalidacao,
  removerItem,
  subtotalVisto,
  totalDeItens,
  TTL_MS,
  type Carrinho,
  type ItemCarrinho,
} from "@/domain/carrinho/carrinho";

const AGORA = 1_800_000_000_000;

function item(over: Partial<Omit<ItemCarrinho, "linha">> = {}): Omit<ItemCarrinho, "linha"> {
  return {
    produtoId: "p1",
    produtoSlug: "calabresa",
    nome: "Calabresa",
    variacaoId: "v-trad",
    sabores: ["v-trad"],
    bordaId: null,
    adicionais: [],
    observacao: "",
    quantidade: 1,
    precoUnitario: 50,
    rotulos: ["Tradicional"],
    limite: null,
    ...over,
  };
}

describe("chaveDaConfiguracao (RN-CART-004)", () => {
  it("não depende da ordem dos sabores nem dos adicionais", () => {
    const a = chaveDaConfiguracao(item({ sabores: ["x", "y"], adicionais: ["b", "a"] }));
    const b = chaveDaConfiguracao(item({ sabores: ["y", "x"], adicionais: ["a", "b"] }));
    expect(a).toBe(b);
  });

  it("separa por tamanho, borda, adicional e observação", () => {
    const base = chaveDaConfiguracao(item());
    expect(chaveDaConfiguracao(item({ variacaoId: "v-broto" }))).not.toBe(base);
    expect(chaveDaConfiguracao(item({ bordaId: "catupiry" }))).not.toBe(base);
    expect(chaveDaConfiguracao(item({ adicionais: ["bacon"] }))).not.toBe(base);
    expect(chaveDaConfiguracao(item({ observacao: "sem cebola" }))).not.toBe(base);
  });

  it("espaço a mais na observação não cria linha nova", () => {
    expect(chaveDaConfiguracao(item({ observacao: "  Sem   Cebola " }))).toBe(
      chaveDaConfiguracao(item({ observacao: "sem cebola" })),
    );
  });
});

describe("adicionarItem", () => {
  it("agrupa configuração idêntica na mesma linha", () => {
    let c = adicionarItem(CARRINHO_VAZIO, item(), AGORA);
    c = adicionarItem(c, item({ quantidade: 2 }), AGORA);
    expect(c.itens).toHaveLength(1);
    expect(c.itens[0]?.quantidade).toBe(3);
  });

  it("mantém linhas separadas quando a configuração difere", () => {
    let c = adicionarItem(CARRINHO_VAZIO, item(), AGORA);
    c = adicionarItem(c, item({ bordaId: "catupiry", precoUnitario: 58 }), AGORA);
    c = adicionarItem(c, item({ observacao: "bem assada" }), AGORA);
    expect(c.itens).toHaveLength(3);
  });

  it("respeita o limite por pedido ao agrupar (RN-CART-005)", () => {
    let c = adicionarItem(CARRINHO_VAZIO, item({ quantidade: 2, limite: 3 }), AGORA);
    c = adicionarItem(c, item({ quantidade: 5, limite: 3 }), AGORA);
    expect(c.itens[0]?.quantidade).toBe(3);
  });
});

describe("alterarQuantidade e removerItem", () => {
  it("quantidade zero remove a linha", () => {
    const c = adicionarItem(CARRINHO_VAZIO, item(), AGORA);
    const linha = c.itens[0]!.linha;
    expect(alterarQuantidade(c, linha, 0, AGORA).itens).toHaveLength(0);
  });

  it("não ultrapassa o limite", () => {
    const c = adicionarItem(CARRINHO_VAZIO, item({ limite: 2 }), AGORA);
    const linha = c.itens[0]!.linha;
    expect(alterarQuantidade(c, linha, 9, AGORA).itens[0]?.quantidade).toBe(2);
  });

  it("remover mexe só na linha indicada", () => {
    let c = adicionarItem(CARRINHO_VAZIO, item(), AGORA);
    c = adicionarItem(c, item({ bordaId: "b" }), AGORA);
    const alvo = c.itens[0]!.linha;
    const depois = removerItem(c, alvo, AGORA);
    expect(depois.itens).toHaveLength(1);
    expect(depois.itens[0]?.linha).not.toBe(alvo);
  });
});

describe("totais", () => {
  it("soma em centavos para não acumular erro de ponto flutuante", () => {
    let c = adicionarItem(CARRINHO_VAZIO, item({ precoUnitario: 10.1, quantidade: 3 }), AGORA);
    c = adicionarItem(c, item({ precoUnitario: 0.2, bordaId: "b", quantidade: 3 }), AGORA);
    expect(subtotalVisto(c)).toBe(30.9);
    expect(totalDeItens(c)).toBe(6);
  });
});

describe("TTL de 24 horas (RN-CART-001 e RN-CART-002)", () => {
  it("não expira antes das 24h", () => {
    const c = adicionarItem(CARRINHO_VAZIO, item(), AGORA);
    expect(expirado(c, AGORA + TTL_MS - 1)).toBe(false);
  });

  it("expira em 24h", () => {
    const c = adicionarItem(CARRINHO_VAZIO, item(), AGORA);
    expect(expirado(c, AGORA + TTL_MS)).toBe(true);
  });

  it("alteração relevante renova o prazo", () => {
    let c = adicionarItem(CARRINHO_VAZIO, item(), AGORA);
    const quase = AGORA + TTL_MS - 1000;
    c = alterarQuantidade(c, c.itens[0]!.linha, 2, quase);
    expect(expirado(c, quase + TTL_MS - 1)).toBe(false);
  });

  it("carrinho vazio não expira — não há o que descartar", () => {
    expect(expirado(CARRINHO_VAZIO, AGORA + TTL_MS * 10)).toBe(false);
  });

  it("ao ler algo expirado, devolve vazio de forma previsível", () => {
    const c = adicionarItem(CARRINHO_VAZIO, item(), AGORA);
    expect(lerCarrinho(c, AGORA + TTL_MS).itens).toHaveLength(0);
    expect(lerCarrinho(c, AGORA + 1000).itens).toHaveLength(1);
  });
});

describe("lerCarrinho trata o armazenamento local como entrada não confiável", () => {
  it("aceita só o que tem formato válido", () => {
    expect(lerCarrinho(null, AGORA)).toEqual(CARRINHO_VAZIO);
    expect(lerCarrinho("[]", AGORA)).toEqual(CARRINHO_VAZIO);
    expect(lerCarrinho({ itens: "nao e lista" }, AGORA)).toEqual(CARRINHO_VAZIO);
  });

  it("descarta item corrompido e mantém o resto", () => {
    const guardado = {
      atualizadoEm: AGORA,
      itens: [
        { ...item(), linha: "x" },
        { produtoId: "p2" },
        { ...item({ produtoId: "p3", precoUnitario: -5 }), linha: "y" },
        { ...item({ produtoId: "p4", quantidade: 0 }), linha: "z" },
      ],
    };
    const lido = lerCarrinho(guardado, AGORA);
    expect(lido.itens).toHaveLength(1);
    expect(lido.itens[0]?.produtoId).toBe("p1");
  });

  it("recalcula a linha a partir da configuração, ignorando a chave guardada", () => {
    const guardado: Carrinho = {
      atualizadoEm: AGORA,
      itens: [{ ...item(), linha: "mentira" }],
    };
    expect(lerCarrinho(guardado, AGORA).itens[0]?.linha).toBe(chaveDaConfiguracao(item()));
  });
});

describe("paraRevalidacao", () => {
  it("envia escolhas e o preço apenas como valor VISTO", () => {
    const c = adicionarItem(CARRINHO_VAZIO, item({ precoUnitario: 50 }), AGORA);
    const payload = paraRevalidacao(c);
    expect(payload[0]).toMatchObject({
      produto_id: "p1",
      variacao_id: "v-trad",
      quantidade: 1,
      preco_unitario_visto: 50,
    });
    // O servidor nunca recebe um campo chamado "preço": recebe o que foi visto.
    expect(Object.keys(payload[0]!)).not.toContain("preco_unitario");
  });
});
