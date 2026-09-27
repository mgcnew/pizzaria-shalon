import { describe, expect, it } from "vitest";
import {
  decidirAtalho,
  teclasAtivas,
  TECLAS_RESERVADAS,
  type ContextoDoPdv,
  type TeclaPressionada,
} from "@/app/(admin)/admin/pdv/_ui/atalhos";

/**
 * OS ATALHOS DO PDV — Fase 12, Etapa 9.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §3 · CLAUDE.md §38
 *
 * A pergunta central deste arquivo não é "a tecla funciona?". É **em que
 * contexto ela NÃO deve funcionar** — porque é ali que um atalho de balcão
 * estraga dinheiro: mexendo no carrinho enquanto alguém digita uma observação,
 * ou confirmando um pagamento com um Enter distraído.
 *
 * Por isso a maioria dos cenários afirma `null`.
 *
 * O que este arquivo NÃO testa, e não por esquecimento: se o navegador
 * sequestra a tecla. Isso não é decidível em teste unitário — foi medido no
 * navegador, com `cancelable` e `preventDefault`, e está registrado no §3.
 */

/** Contexto neutro: PDV aberto, nada em andamento. Cada teste muda o que importa. */
const PARADO: ContextoDoPdv = {
  focoEmCampo: false,
  focoNaLeitura: false,
  leituraPreenchida: false,
  cedendoAVez: false,
  aba: "receber",
  temItens: false,
  podeSalvar: false,
  temResultados: false,
  configuradorAberto: false,
  vendaSalvaSemReceber: false,
  recebimentoDaVendaAberto: false,
  temPendentes: false,
  pedidoSelecionado: false,
  recebimentoDoPedidoAberto: false,
};

function tecla(key: string, extras: Partial<TeclaPressionada> = {}): TeclaPressionada {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extras };
}

const decidir = (key: string, ctx: Partial<ContextoDoPdv> = {}, extras = {}) =>
  decidirAtalho(tecla(key, extras), { ...PARADO, ...ctx });

// =============================================================================
describe("teclas que o navegador reserva", () => {
  it("nenhuma reservada vira acao, em contexto nenhum", () => {
    const cheio: ContextoDoPdv = {
      ...PARADO,
      temItens: true,
      podeSalvar: true,
      temResultados: true,
      temPendentes: true,
      pedidoSelecionado: true,
      recebimentoDaVendaAberto: true,
    };
    for (const key of TECLAS_RESERVADAS) {
      expect(decidirAtalho(tecla(key), cheio), key).toBeNull();
    }
  });

  it("F11 e F12 estao na lista, que e o que impede alguem as acrescentar", () => {
    expect(TECLAS_RESERVADAS).toContain("F11");
    expect(TECLAS_RESERVADAS).toContain("F12");
  });

  it("F3 e F7 NAO estao reservadas: sao usadas, com preventDefault", () => {
    expect(TECLAS_RESERVADAS).not.toContain("F3");
    expect(TECLAS_RESERVADAS).not.toContain("F7");
  });

  it("Alt nunca age -- Alt+F4 fecha a janela", () => {
    expect(decidir("F4", {}, { altKey: true })).toBeNull();
    expect(decidir("F2", {}, { altKey: true })).toBeNull();
    expect(decidir("Enter", { recebimentoDaVendaAberto: true }, { altKey: true, ctrlKey: true }))
      .toBeNull();
  });

  it("Meta nunca age -- e atalho de sistema", () => {
    expect(decidir("F2", {}, { metaKey: true })).toBeNull();
    expect(decidir("Enter", { recebimentoDaVendaAberto: true }, { metaKey: true, ctrlKey: true }))
      .toBeNull();
  });

  it("Ctrl com qualquer outra tecla e do navegador", () => {
    for (const k of ["t", "w", "n", "f", "r", "p", "s"]) {
      expect(decidir(k, { temItens: true }, { ctrlKey: true }), k).toBeNull();
    }
  });
});

// =============================================================================
describe("menu, modal ou drawer aberto: o PDV cede a vez", () => {
  it("nenhuma tecla age, nem as globais", () => {
    for (const k of ["F2", "F3", "F4", "F7", "F8", "F9", "Escape", "/", "+", "Delete"]) {
      expect(decidir(k, { cedendoAVez: true, temItens: true, podeSalvar: true }), k).toBeNull();
    }
  });

  it("nem o Ctrl+Enter, para nao confirmar pagamento atras de um modal", () => {
    expect(
      decidir("Enter", { cedendoAVez: true, recebimentoDaVendaAberto: true }, { ctrlKey: true }),
    ).toBeNull();
  });
});

// =============================================================================
describe("as teclas de funcao", () => {
  it("F2 sempre abre venda nova", () => {
    expect(decidir("F2")).toBe("venda:nova");
    expect(decidir("F2", { focoEmCampo: true })).toBe("venda:nova");
  });

  it("F3 sempre foca a leitura", () => {
    expect(decidir("F3")).toBe("venda:focar-leitura");
  });

  it("F4 e F9 trocam de aba", () => {
    expect(decidir("F4")).toBe("aba:receber");
    expect(decidir("F9")).toBe("aba:caixa");
  });

  it("F7 salva SOMENTE quando o botao salvaria", () => {
    expect(decidir("F7", { podeSalvar: true })).toBe("venda:salvar");
  });

  it("F7 NAO age sem itens", () => {
    expect(decidir("F7")).toBeNull();
  });

  it("F7 NAO age com itens mas sem forma de pagamento escolhida", () => {
    // `podeSalvar` ja embute forma e bandeira. O atalho nao pode driblar isso.
    expect(decidir("F7", { temItens: true, podeSalvar: false })).toBeNull();
  });

  it("F8 abre o recebimento da venda quando ha itens", () => {
    expect(decidir("F8", { temItens: true })).toBe("venda:receber");
  });

  it("F8 abre o recebimento da venda ja salva e ainda nao paga", () => {
    expect(decidir("F8", { vendaSalvaSemReceber: true })).toBe("venda:receber");
  });

  it("F8 cai para o pedido selecionado quando nao ha venda em curso", () => {
    expect(decidir("F8", { pedidoSelecionado: true })).toBe("fila:receber");
  });

  it("F8 prefere a venda ao pedido: e o que o operador esta montando", () => {
    expect(decidir("F8", { temItens: true, pedidoSelecionado: true })).toBe("venda:receber");
  });

  it("F8 NAO age sem venda e sem pedido selecionado", () => {
    expect(decidir("F8")).toBeNull();
  });
});

// =============================================================================
describe("Ctrl+Enter: confirmar e de dois dedos", () => {
  it("confirma o recebimento da venda", () => {
    expect(decidir("Enter", { recebimentoDaVendaAberto: true }, { ctrlKey: true })).toBe(
      "recebimento:confirmar",
    );
  });

  it("confirma o recebimento do pedido da fila", () => {
    expect(decidir("Enter", { recebimentoDoPedidoAberto: true }, { ctrlKey: true })).toBe(
      "recebimento:confirmar",
    );
  });

  it("age ate com foco em campo: o valor foi digitado agora", () => {
    expect(
      decidir("Enter", { recebimentoDaVendaAberto: true, focoEmCampo: true }, { ctrlKey: true }),
    ).toBe("recebimento:confirmar");
  });

  it("ENTER SOZINHO NAO CONFIRMA -- e a regra dos dois dedos", () => {
    expect(decidir("Enter", { recebimentoDaVendaAberto: true })).toBeNull();
  });

  it("Ctrl+Shift+Enter nao confirma", () => {
    expect(
      decidir("Enter", { recebimentoDaVendaAberto: true }, { ctrlKey: true, shiftKey: true }),
    ).toBeNull();
  });

  it("nao confirma sem painel aberto: nada irreversivel com a tela fechada", () => {
    expect(decidir("Enter", { temItens: true }, { ctrlKey: true })).toBeNull();
  });
});

// =============================================================================
describe("Escape fecha o mais interno, um por vez", () => {
  it("recebimento da venda primeiro", () => {
    expect(
      decidir("Escape", {
        recebimentoDaVendaAberto: true,
        configuradorAberto: true,
        pedidoSelecionado: true,
        leituraPreenchida: true,
      }),
    ).toBe("venda:fechar-recebimento");
  });

  it("depois o configurador", () => {
    expect(
      decidir("Escape", {
        configuradorAberto: true,
        pedidoSelecionado: true,
        leituraPreenchida: true,
      }),
    ).toBe("venda:fechar-configurador");
  });

  it("depois a selecao da fila", () => {
    expect(decidir("Escape", { pedidoSelecionado: true, leituraPreenchida: true })).toBe(
      "fila:desselecionar",
    );
  });

  it("e o recebimento do pedido tambem desseleciona", () => {
    expect(decidir("Escape", { recebimentoDoPedidoAberto: true })).toBe("fila:desselecionar");
  });

  it("por ultimo limpa a leitura", () => {
    expect(decidir("Escape", { leituraPreenchida: true })).toBe("venda:limpar-leitura");
  });

  it("com a tela parada, Escape nao faz nada", () => {
    expect(decidir("Escape")).toBeNull();
  });
});

// =============================================================================
describe("Enter e Tab no campo de leitura", () => {
  it("Enter com conteudo resolve", () => {
    expect(decidir("Enter", { focoNaLeitura: true, focoEmCampo: true, leituraPreenchida: true }))
      .toBe("venda:resolver");
  });

  it("Enter vazio nao resolve: nao ha o que procurar", () => {
    expect(decidir("Enter", { focoNaLeitura: true, focoEmCampo: true })).toBeNull();
  });

  it("TAB COM CONTEUDO equivale a Enter -- alguns leitores terminam com Tab", () => {
    expect(decidir("Tab", { focoNaLeitura: true, focoEmCampo: true, leituraPreenchida: true }))
      .toBe("venda:resolver");
  });

  it("TAB VAZIO navega normalmente -- o campo nao prende o foco (§38)", () => {
    expect(decidir("Tab", { focoNaLeitura: true, focoEmCampo: true })).toBeNull();
  });

  it("Shift+Tab nunca resolve: voltar o foco continua sendo voltar o foco", () => {
    expect(
      decidir(
        "Tab",
        { focoNaLeitura: true, focoEmCampo: true, leituraPreenchida: true },
        { shiftKey: true },
      ),
    ).toBeNull();
  });

  it("COM O CONFIGURADOR ABERTO, Tab volta a navegar -- e assim que se alcanca o botao", () => {
    expect(
      decidir("Tab", {
        focoNaLeitura: true,
        focoEmCampo: true,
        leituraPreenchida: true,
        configuradorAberto: true,
      }),
    ).toBeNull();
  });

  it("e Enter nao reabre a mesma escolha de tamanho em cima dela", () => {
    expect(
      decidir("Enter", {
        focoNaLeitura: true,
        focoEmCampo: true,
        leituraPreenchida: true,
        configuradorAberto: true,
      }),
    ).toBeNull();
  });

  it("Tab em OUTRO campo nunca resolve", () => {
    expect(decidir("Tab", { focoEmCampo: true, leituraPreenchida: true })).toBeNull();
  });
});

// =============================================================================
describe("setas", () => {
  it("na leitura navegam os resultados", () => {
    const ctx = { focoNaLeitura: true, focoEmCampo: true, temResultados: true };
    expect(decidir("ArrowDown", ctx)).toBe("venda:resultado-proximo");
    expect(decidir("ArrowUp", ctx)).toBe("venda:resultado-anterior");
  });

  it("na leitura sem resultados nao fazem nada", () => {
    expect(decidir("ArrowDown", { focoNaLeitura: true, focoEmCampo: true })).toBeNull();
  });

  it("EM OUTRO CAMPO sao do cursor, nunca nossas", () => {
    expect(decidir("ArrowDown", { focoEmCampo: true, temPendentes: true })).toBeNull();
    expect(decidir("ArrowUp", { focoEmCampo: true, temResultados: true })).toBeNull();
  });

  it("fora de campo, com a aba de recebimento a frente, navegam os pendentes", () => {
    expect(decidir("ArrowDown", { temPendentes: true })).toBe("fila:proximo");
    expect(decidir("ArrowUp", { temPendentes: true })).toBe("fila:anterior");
  });

  it("na aba Caixa NAO navegam a fila que nao esta visivel", () => {
    expect(decidir("ArrowDown", { aba: "caixa", temPendentes: true })).toBeNull();
  });

  it("resultados tem precedencia sobre a fila", () => {
    expect(decidir("ArrowDown", { temResultados: true, temPendentes: true })).toBe(
      "venda:resultado-proximo",
    );
  });

  it("sem resultados e sem pendentes, navegam o carrinho", () => {
    expect(decidir("ArrowDown", { temItens: true })).toBe("venda:linha-proxima");
    expect(decidir("ArrowUp", { temItens: true })).toBe("venda:linha-anterior");
  });

  it("com a tela vazia nao fazem nada", () => {
    expect(decidir("ArrowDown")).toBeNull();
  });
});

// =============================================================================
describe("Enter fora do campo escolhe o resultado em destaque", () => {
  it("com resultados, escolhe", () => {
    expect(decidir("Enter", { temResultados: true })).toBe("venda:escolher-resultado");
  });

  it("na fila NAO duplica: o item e <button> e o Enter nativo ja age", () => {
    expect(decidir("Enter", { temPendentes: true })).toBeNull();
  });
});

// =============================================================================
describe("A GUARDA QUE IMPORTA: caractere digitavel com foco em campo", () => {
  const digitaveis = ["+", "=", "-", "_", "/", "*", "Delete"];

  it("nenhum age com foco em campo, mesmo com tudo aberto", () => {
    const ctx = {
      focoEmCampo: true,
      temItens: true,
      recebimentoDaVendaAberto: true,
      recebimentoDoPedidoAberto: true,
    };
    for (const k of digitaveis) {
      expect(decidir(k, ctx), k).toBeNull();
    }
  });

  it("nem no campo de leitura COM CONTEUDO -- bipar codigo com hifen nao mexe no carrinho", () => {
    expect(
      decidir("-", {
        focoNaLeitura: true,
        focoEmCampo: true,
        leituraPreenchida: true,
        temItens: true,
      }),
    ).toBeNull();
  });

  it("MAS no campo de leitura VAZIO eles agem: nao ha texto para roubar", () => {
    // O campo de leitura é o foco padrão da tela. Exigir foco fora de qualquer
    // campo deixaria `+`, `−` e Delete mortos no estado normal do balcão.
    const vazio = { focoNaLeitura: true, focoEmCampo: true, temItens: true };
    expect(decidir("+", vazio)).toBe("venda:mais");
    expect(decidir("-", vazio)).toBe("venda:menos");
    expect(decidir("Delete", vazio)).toBe("venda:remover");
  });

  it("e as setas tambem, caindo para o carrinho quando nao ha resultados", () => {
    expect(
      decidir("ArrowDown", { focoNaLeitura: true, focoEmCampo: true, temItens: true }),
    ).toBe("venda:linha-proxima");
  });

  it("a excecao NAO vale para outro campo vazio", () => {
    // `focoNaLeitura` falso: é um campo de valor, de motivo, de observação.
    expect(decidir("+", { focoEmCampo: true, temItens: true })).toBeNull();
    expect(decidir("Delete", { focoEmCampo: true, temItens: true })).toBeNull();
  });

  it("'1/2 calabresa' numa observacao nao adiciona forma de pagamento", () => {
    expect(
      decidir("/", { focoEmCampo: true, recebimentoDaVendaAberto: true }),
    ).toBeNull();
  });
});

// =============================================================================
describe("carrinho", () => {
  it("+ e = aumentam", () => {
    expect(decidir("+", { temItens: true })).toBe("venda:mais");
    expect(decidir("=", { temItens: true })).toBe("venda:mais");
  });

  it("- diminui", () => {
    expect(decidir("-", { temItens: true })).toBe("venda:menos");
  });

  it("teclado numerico tambem", () => {
    expect(decidir("Add", { temItens: true })).toBe("venda:mais");
    expect(decidir("Subtract", { temItens: true })).toBe("venda:menos");
  });

  it("Delete remove a linha", () => {
    expect(decidir("Delete", { temItens: true })).toBe("venda:remover");
  });

  it("nada disso age com o carrinho vazio", () => {
    for (const k of ["+", "-", "Delete", "Add"]) {
      expect(decidir(k), k).toBeNull();
    }
  });

  it("Backspace NAO remove: e a tecla de apagar texto, e voltar pagina em alguns casos", () => {
    expect(decidir("Backspace", { temItens: true })).toBeNull();
  });
});

// =============================================================================
describe("recebimento", () => {
  it("/ divide em outra forma", () => {
    expect(decidir("/", { recebimentoDaVendaAberto: true })).toBe("recebimento:dividir");
    expect(decidir("/", { recebimentoDoPedidoAberto: true })).toBe("recebimento:dividir");
  });

  it("* preenche o valor exato", () => {
    expect(decidir("*", { recebimentoDaVendaAberto: true })).toBe("recebimento:exato");
  });

  it("nenhum dos dois age sem painel aberto", () => {
    expect(decidir("/", { temItens: true })).toBeNull();
    expect(decidir("*", { temItens: true })).toBeNull();
  });

  it("o painel aberto tem precedencia sobre o carrinho para o mesmo caractere", () => {
    // `-` continua do carrinho; `/` e `*` sao do painel. Nao colidem.
    expect(decidir("-", { temItens: true, recebimentoDaVendaAberto: true })).toBe("venda:menos");
  });
});

// =============================================================================
describe("a faixa inferior sai da MESMA tabela", () => {
  it("com a tela parada mostra so o que age", () => {
    const f = teclasAtivas(PARADO).map((t) => t.tecla);
    expect(f).toContain("F2");
    expect(f).toContain("F3");
    expect(f).toContain("F4");
    expect(f).toContain("F9");
    expect(f).not.toContain("F7");
    expect(f).not.toContain("F8");
    expect(f).not.toContain("Esc");
  });

  it("nunca anuncia uma tecla que a tabela recusaria", () => {
    const contextos: Partial<ContextoDoPdv>[] = [
      {},
      { temItens: true },
      { temItens: true, podeSalvar: true },
      { recebimentoDaVendaAberto: true },
      { pedidoSelecionado: true, temPendentes: true },
      { aba: "caixa" },
      { focoEmCampo: true, focoNaLeitura: true, leituraPreenchida: true },
      { cedendoAVez: true },
    ];

    const teclaParaEvento: Record<string, TeclaPressionada> = {
      F2: tecla("F2"),
      F3: tecla("F3"),
      F4: tecla("F4"),
      F7: tecla("F7"),
      F8: tecla("F8"),
      F9: tecla("F9"),
      "/": tecla("/"),
      "*": tecla("*"),
      "+ −": tecla("+"),
      Del: tecla("Delete"),
      "↑ ↓": tecla("ArrowDown"),
      "Ctrl+Enter": tecla("Enter", { ctrlKey: true }),
      Esc: tecla("Escape"),
    };

    for (const parcial of contextos) {
      const ctx = { ...PARADO, ...parcial };
      for (const { tecla: rotulo } of teclasAtivas(ctx)) {
        const evento = teclaParaEvento[rotulo];
        // Rótulo sem evento correspondente seria faixa anunciando o que a
        // tabela não conhece — falha tão real quanto a outra.
        expect(evento, `rotulo sem evento: ${rotulo}`).toBeDefined();
        expect(
          decidirAtalho(evento as TeclaPressionada, ctx),
          `${rotulo} em ${JSON.stringify(parcial)}`,
        ).not.toBeNull();
      }
    }
  });

  it("cedendo a vez, a faixa fica vazia", () => {
    expect(teclasAtivas({ ...PARADO, cedendoAVez: true, temItens: true })).toHaveLength(0);
  });

  it("com recebimento aberto anuncia dividir, exato e confirmar", () => {
    const f = teclasAtivas({ ...PARADO, recebimentoDaVendaAberto: true }).map((t) => t.tecla);
    expect(f).toContain("/");
    expect(f).toContain("*");
    expect(f).toContain("Ctrl+Enter");
    expect(f).toContain("Esc");
  });
});
