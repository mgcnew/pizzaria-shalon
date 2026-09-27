import { describe, expect, it } from "vitest";
import { formatarEspera, minutosDesde } from "@/lib/format";
import { rotuloDeModalidade, rotuloDeOrigem } from "@/domain/pedidos/estados";

/**
 * A coluna "Espera" da fila de Pedidos e o rótulo de idade do PDV.
 *
 * As duas telas passaram a usar a MESMA função. O PDV tinha uma `idade()`
 * privada, e estes casos primeiro provam que o texto dele não mudou — só
 * depois medem o que é novo.
 */
describe("formatarEspera — o texto que o PDV já mostrava", () => {
  it("abaixo de um minuto não vira '0 min'", () => {
    expect(formatarEspera(0)).toBe("agora");
    expect(formatarEspera(0.9)).toBe("agora");
  });

  it("minutos soltos até a primeira hora", () => {
    expect(formatarEspera(1)).toBe("1 min");
    expect(formatarEspera(38)).toBe("38 min");
    expect(formatarEspera(59)).toBe("59 min");
  });

  it("hora redonda não arrasta '0 min' atrás", () => {
    expect(formatarEspera(60)).toBe("1 h");
    expect(formatarEspera(120)).toBe("2 h");
  });

  it("hora com resto mostra os dois", () => {
    expect(formatarEspera(61)).toBe("1 h 1 min");
    expect(formatarEspera(135)).toBe("2 h 15 min");
    // O #33628 real do DEV, que os cartões mostravam como "20:41".
    expect(formatarEspera(2297)).toBe("38 h 17 min");
  });

  it("relógio adiantado vira 'agora', e nunca um tempo negativo", () => {
    expect(formatarEspera(-1)).toBe("agora");
    expect(formatarEspera(-999)).toBe("agora");
  });

  it("fração não vaza para a tela", () => {
    expect(formatarEspera(38.7)).toBe("38 min");
    expect(formatarEspera(60.9)).toBe("1 h");
  });

  it("entrada inválida não quebra a linha da tabela", () => {
    expect(formatarEspera(Number.NaN)).toBe("agora");
    expect(formatarEspera(Number.POSITIVE_INFINITY)).toBe("agora");
  });
});

describe("minutosDesde — o 'agora' vem de fora, nunca do relógio interno", () => {
  const criado = "2026-09-27T10:00:00.000Z";
  const emPontoDasDez = Date.parse(criado);

  it("mede o intervalo a partir da âncora recebida", () => {
    expect(minutosDesde(criado, emPontoDasDez)).toBe(0);
    expect(minutosDesde(criado, emPontoDasDez + 60_000)).toBe(1);
    expect(minutosDesde(criado, emPontoDasDez + 90 * 60_000)).toBe(90);
  });

  it("é pura: a mesma âncora devolve sempre o mesmo número", () => {
    const a = minutosDesde(criado, emPontoDasDez + 5 * 60_000);
    const b = minutosDesde(criado, emPontoDasDez + 5 * 60_000);
    expect(a).toBe(b);
    expect(a).toBe(5);
  });

  it("data ilegível devolve zero em vez de NaN na tela", () => {
    expect(minutosDesde("nao é data", emPontoDasDez)).toBe(0);
  });

  it("servidor e navegador combinados dão o texto da coluna", () => {
    const agora = emPontoDasDez + 2297 * 60_000;
    expect(formatarEspera(minutosDesde(criado, agora))).toBe("38 h 17 min");
  });
});

describe("a ordem da fila em aberto", () => {
  /** O mesmo comparador do `CentralDePedidos`. */
  const porIdade = (a: { criado_em: string }, b: { criado_em: string }) =>
    new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();

  it("põe quem espera há mais tempo em primeiro", () => {
    const fila = [
      { id: "novo", criado_em: "2026-09-27T10:19:00.000Z" },
      { id: "antigo", criado_em: "2026-09-25T20:41:00.000Z" },
      { id: "meio", criado_em: "2026-09-26T01:55:00.000Z" },
    ];
    expect([...fila].sort(porIdade).map((p) => p.id)).toEqual(["antigo", "meio", "novo"]);
  });

  it("pedido que chega vai para o FIM, sem empurrar as linhas existentes", () => {
    const fila = [
      { id: "a", criado_em: "2026-09-27T10:00:00.000Z" },
      { id: "b", criado_em: "2026-09-27T10:05:00.000Z" },
    ].sort(porIdade);

    const comNovo = [...fila, { id: "c", criado_em: "2026-09-27T10:09:00.000Z" }].sort(porIdade);

    // As posições de quem já estava não mudaram: é isso que impede o alvo de
    // fugir do cursor quando alguém está clicando numa ação.
    expect(comNovo.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(comNovo.indexOf(comNovo[0]!)).toBe(fila.indexOf(fila[0]!));
    expect(comNovo.indexOf(comNovo[1]!)).toBe(fila.indexOf(fila[1]!));
  });
});

describe("rótulos de origem e modalidade — uma tradução para as duas telas", () => {
  it("traduz o que a fila mostrava cru", () => {
    expect(rotuloDeOrigem("counter")).toBe("Balcão");
    expect(rotuloDeOrigem("whatsapp")).toBe("WhatsApp");
    expect(rotuloDeOrigem("shalon_link")).toBe("Link Shalon");
    expect(rotuloDeModalidade("pickup")).toBe("Retirada");
    expect(rotuloDeModalidade("delivery")).toBe("Entrega");
  });

  it("valor desconhecido aparece como veio, e não em branco", () => {
    expect(rotuloDeOrigem("marketplace_novo")).toBe("marketplace_novo");
    expect(rotuloDeModalidade("dine_in")).toBe("dine_in");
  });

  it("origem e modalidade são eixos separados e não se confundem", () => {
    // Um pedido de WhatsApp para retirada: os dois preenchidos e diferentes.
    expect(rotuloDeOrigem("whatsapp")).not.toBe(rotuloDeModalidade("pickup"));
    // "Balcão" é origem; não existe modalidade "Balcão".
    expect(rotuloDeModalidade("counter")).toBe("counter");
  });
});
