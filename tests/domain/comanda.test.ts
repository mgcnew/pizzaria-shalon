import { describe, expect, it } from "vitest";
import {
  COLUNAS,
  LARGURA,
  ladoALado,
  montarAlteracao,
  montarComanda,
  quebrar,
  renderizarTexto,
  type ItemDaComanda,
  type PedidoDaComanda,
  montarAcrescimo,
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

  it("entrega paga em parte diz quanto já foi pago e quanto cobrar", () => {
    const texto = renderizarTexto(
      montarComanda({ ...PEDIDO, pagoEmParte: 50, valores: { subtotal: 63, taxa: 6, total: 69 } }),
    );
    expect(texto).toContain("Ja pago: R$ 50,00");
    expect(texto).toContain("COBRAR R$ 19,00");
    expect(texto).not.toContain("PAGO - NAO COBRAR");
  });

  it("entrega no fiado sai como FIADO, sem troco nem cobrança", () => {
    const texto = renderizarTexto(montarComanda({ ...PEDIDO, fiado: true }));
    expect(texto).toContain("FIADO - NAO COBRAR");
    expect(texto).not.toContain("TROCO");
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

describe("papel de 80 mm (D-2026-10-08-116)", () => {
  const alteracao = {
    numero: 1042,
    horario: "19/09 20:40",
    motivo: "Acabou a calabresa",
    itensAntes: [{ quantidade: 2, nome: "Calabresa" }],
    itensDepois: [{ quantidade: 1, nome: "Mussarela", tamanho: "Tradicional" }],
  };

  it("58 mm continua em 32 colunas e é o padrão", () => {
    expect(COLUNAS["58"]).toBe(32);
    expect(LARGURA).toBe(32);
    expect(renderizarTexto(montarComanda(PEDIDO, COLUNAS["58"]))).toBe(
      renderizarTexto(montarComanda(PEDIDO)),
    );
  });

  it("80 mm usa 42 colunas e nenhuma linha passa disso", () => {
    expect(COLUNAS["80"]).toBe(42);
    for (const linha of montarComanda(PEDIDO, COLUNAS["80"])) {
      expect(linha.texto.length).toBeLessThanOrEqual(42);
    }
    for (const linha of montarAlteracao(alteracao, COLUNAS["80"])) {
      expect(linha.texto.length).toBeLessThanOrEqual(42);
    }
  });

  it("separadores ocupam a largura inteira do papel", () => {
    const linhas = montarComanda(PEDIDO, COLUNAS["80"]);
    expect(linhas.some((l) => l.estilo === "separador" && l.texto === "-".repeat(42))).toBe(true);
    const alt = montarAlteracao(alteracao, COLUNAS["80"]);
    expect(alt[0]?.texto).toBe("*".repeat(42));
  });

  it("o conteúdo é o mesmo nas duas larguras; muda só a quebra", () => {
    const palavras = (t: string) => t.replace(/[-*]{3,}/g, "").split(/\s+/).filter(Boolean);
    expect(palavras(renderizarTexto(montarComanda(PEDIDO, COLUNAS["80"])))).toEqual(
      palavras(renderizarTexto(montarComanda(PEDIDO, COLUNAS["58"]))),
    );
  });
});

describe("valores na comanda (D-2026-10-17-147)", () => {
  const base = {
    numero: 24,
    horario: "16/10, 22:21",
    cliente: "Micael",
    itens: [{ quantidade: 1, nome: "Calabresa" }],
  };

  it("entrega: subtotal, taxa de entrega e TOTAL (texto comum, o negrito é dos itens)", () => {
    const linhas = montarComanda({
      ...base,
      modalidade: "delivery",
      endereco: { logradouro: "Rua X", numero: "1", bairro: "B" },
      valores: { subtotal: 37, taxa: 5, total: 42 },
    });
    const textos = linhas.map((l) => l.texto);
    expect(textos.some((t) => t.startsWith("Subtotal") && t.endsWith("R$ 37,00"))).toBe(true);
    expect(textos.some((t) => t.startsWith("Taxa de entrega") && t.endsWith("R$ 5,00"))).toBe(true);
    const total = linhas.find((l) => l.texto.startsWith("TOTAL"));
    expect(total?.texto.endsWith("R$ 42,00")).toBe(true);
    expect(total?.estilo).toBe("normal");
  });

  it("retirada: sem linha de taxa", () => {
    const linhas = montarComanda({ ...base, modalidade: "pickup", valores: { subtotal: 37, taxa: 0, total: 37 } });
    expect(linhas.some((l) => l.texto.startsWith("Taxa de entrega"))).toBe(false);
    expect(linhas.some((l) => l.texto.startsWith("TOTAL"))).toBe(true);
  });
});

describe("montarAcrescimo", () => {
  it("diz que a comanda anterior continua valendo e lista só os itens novos", () => {
    const texto = renderizarTexto(
      montarAcrescimo({
        numero: 48,
        horario: "17/10 21:30",
        motivo: "Acréscimo pedido pelo cliente (WhatsApp)",
        itensNovos: [{ quantidade: 1, nome: "Coca 2L", tamanho: null, borda: null, sabores: null, adicionais: null, combo: null, observacao: null }],
      }),
    );
    expect(texto).toContain("*** ACRESCIMO ***");
    expect(texto).toContain("PEDIDO #48");
    expect(texto).toContain("CONTINUA valendo");
    expect(texto).toContain("Coca 2L");
    expect(texto).not.toContain("NAO vale mais");
  });
});

describe("negrito só nos itens e nas observações (D-2026-10-23-161)", () => {
  /** Tudo o que sai em negrito, em qualquer um dos dois transportes. */
  const emNegrito = (linhas: { texto: string; estilo: string }[]) =>
    linhas.filter((l) => ["forte", "titulo", "destaque"].includes(l.estilo)).map((l) => l.texto.trim());

  it("a comanda só tem negrito no item e nas observações", () => {
    const linhas = montarComanda({
      ...PEDIDO,
      valores: { subtotal: 37, taxa: 5, total: 42 },
      itens: [PIZZA, { quantidade: 2, nome: "Coca-Cola 600ml" }],
    });
    expect(emNegrito(linhas)).toEqual([
      "1x Calabresa / Mussarela", // a pizza
      ">> Sem cebola", // observação do item
      "2x Coca-Cola 600ml", // o outro item
      "Interfone quebrado", // observação do pedido
    ]);
  });

  it("cabeçalho, ENTREGA/RETIRADA, MEIO A MEIO, total e cobrança saem em texto comum", () => {
    const linhas = montarComanda({ ...PEDIDO, valores: { subtotal: 37, taxa: 5, total: 42 } });
    for (const trecho of ["PIZZARIA SHALON", "PEDIDO #1042", ">>> ENTREGA <<<", "MEIO A MEIO", "TOTAL", "TROCO PARA", "Levar"]) {
      const linha = linhas.find((l) => l.texto.includes(trecho));
      expect(linha, trecho).toBeDefined();
      expect(linha?.estilo, trecho).not.toMatch(/forte|titulo|destaque/);
    }
  });

  it("o rótulo 'OBSERVACAO DO PEDIDO' é comum e só o texto da observação vai em negrito", () => {
    const linhas = montarComanda(PEDIDO);
    expect(linhas.find((l) => l.texto === "OBSERVACAO DO PEDIDO")?.estilo).toBe("normal");
    expect(linhas.find((l) => l.texto === "Interfone quebrado")?.estilo).toBe("forte");
  });

  it("a ALTERAÇÃO continua claramente identificada: o cabeçalho segue em negrito (§32)", () => {
    const linhas = montarAlteracao({
      numero: 1042,
      horario: "19/09 20:15",
      motivo: "Cliente trocou o sabor",
      itensAntes: [{ quantidade: 1, nome: "Calabresa" }],
      itensDepois: [PIZZA],
    });
    const fortes = emNegrito(linhas);
    expect(fortes).toContain("*** ALTERACAO ***");
    expect(fortes).toContain("PEDIDO #1042");
    // A frase quebra em duas linhas nas 32 colunas; as duas saem em negrito.
    expect(fortes.join(" ")).toContain("NAO vale mais.");
    // Os itens novos e a observação deles também.
    expect(fortes).toContain("1x Calabresa / Mussarela");
    expect(fortes).toContain(">> Sem cebola");
    // As etiquetas de seção não.
    expect(fortes).not.toContain("ERA");
    expect(fortes).not.toContain("PASSA A SER");
  });

  it("o ACRÉSCIMO também mantém o cabeçalho em negrito e os itens novos", () => {
    const linhas = montarAcrescimo({ numero: 7, horario: "19/09 20:15", motivo: "Mais uma pizza", itensNovos: [PIZZA] });
    const fortes = emNegrito(linhas);
    expect(fortes).toContain("*** ACRESCIMO ***");
    expect(fortes).toContain("1x Calabresa / Mussarela");
    expect(fortes).not.toContain("ACRESCENTAR");
  });
});
