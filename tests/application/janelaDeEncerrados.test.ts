import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  descreverJanela,
  diasDaUrl,
  horarioDosEncerrados,
} from "@/application/pedidos/janelaDeEncerrados";
import type { JanelaDeEncerrados, PedidoNaFila } from "@/application/pedidos/tipos";

/**
 * Aba Encerrados por janela (D-2026-09-29-93). A janela é escolhida no banco;
 * aqui se testa a leitura da URL e o que a tela diz sobre ela, no fuso da loja.
 */

const FUSO = "America/Sao_Paulo";

describe("diasDaUrl", () => {
  it("aceita inteiro positivo", () => {
    expect(diasDaUrl("7")).toBe(7);
    expect(diasDaUrl("14")).toBe(14);
  });

  it("ausente, vazio, zero, negativo ou lixo viram 0", () => {
    for (const v of [undefined, "", "0", "-7", "abc", "NaN"]) expect(diasDaUrl(v)).toBe(0);
  });

  it("tem teto de 3650", () => {
    expect(diasDaUrl("999999")).toBe(3650);
  });
});

describe("apresentação da janela", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 29/09/2026 20:00 em São Paulo (23:00 UTC).
    vi.setSystemTime(new Date("2026-09-29T23:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const pedido = (id: string, criadoEm: string) => ({ id, criado_em: criadoEm }) as PedidoNaFila;

  it("pedido de hoje mostra só a hora; de outro dia, data e hora", () => {
    const hora = horarioDosEncerrados(
      [pedido("a", "2026-09-29T21:14:00Z"), pedido("b", "2026-09-27T00:30:00Z")],
      FUSO,
    );
    expect(hora.a).toBe("18:14");
    // 00:30 UTC do dia 27 é 21:30 do dia 26 em São Paulo.
    expect(hora.b).toBe("26/09 21:30");
  });

  it("vira o dia pelo fuso da loja, não pelo UTC", () => {
    // 02:00 UTC do dia 30 ainda é 23:00 do dia 29 em São Paulo: é hoje.
    vi.setSystemTime(new Date("2026-09-30T02:30:00Z"));
    expect(horarioDosEncerrados([pedido("a", "2026-09-30T02:00:00Z")], FUSO).a).toBe("23:00");
  });

  const janela = (j: Partial<JanelaDeEncerrados>): JanelaDeEncerrados => ({
    desde: "2026-09-29T21:02:00Z",
    origem: "caixa",
    diasAnteriores: 0,
    haMais: false,
    pedidos: [],
    ...j,
  });

  it("caixa aberto hoje", () => {
    expect(descreverJanela(janela({}), FUSO)).toBe("Desde a abertura do caixa, às 18:02.");
  });

  it("caixa aberto em outro dia diz a data", () => {
    expect(descreverJanela(janela({ desde: "2026-09-28T21:02:00Z" }), FUSO)).toBe(
      "Desde a abertura do caixa, em 28/09 às 18:02.",
    );
  });

  it("sem caixa: hoje, ou desde uma data ao carregar dias", () => {
    expect(descreverJanela(janela({ origem: "dia", desde: "2026-09-29T03:00:00Z" }), FUSO)).toBe(
      "Encerrados de hoje.",
    );
    expect(
      descreverJanela(janela({ origem: "dia", diasAnteriores: 7, desde: "2026-09-22T03:00:00Z" }), FUSO),
    ).toBe("Encerrados desde 22/09.");
  });

  it("consulta que falhou diz isso, em vez de uma janela", () => {
    expect(descreverJanela(janela({ desde: null }), FUSO)).toBe(
      "Não foi possível carregar os pedidos encerrados.",
    );
  });
});
