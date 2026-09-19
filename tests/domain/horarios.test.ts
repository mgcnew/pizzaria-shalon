import { describe, expect, it } from "vitest";
import {
  fechamentoDaJanelaAtual,
  proximaAbertura,
  rotuloDeHorario,
  type JanelaDia,
} from "@/domain/loja/horarios";

/** Domingo fechado; segunda 18h–23h; terça 18h–02h (vira a meia-noite). */
const HORARIOS: JanelaDia[] = [
  { diaSemana: 0, fechado: true, abre: null, fecha: null },
  { diaSemana: 1, fechado: false, abre: "18:00:00", fecha: "23:00:00" },
  { diaSemana: 2, fechado: false, abre: "18:00:00", fecha: "02:00:00" },
];

const em = (diaSemana: number, hora: number, min = 0) => ({
  diaSemana,
  minutos: hora * 60 + min,
});

describe("fechamentoDaJanelaAtual", () => {
  it("encontra o fim da janela normal", () => {
    expect(fechamentoDaJanelaAtual(HORARIOS, em(1, 20))).toBe("23:00");
  });

  it("fora da janela, não devolve fechamento", () => {
    expect(fechamentoDaJanelaAtual(HORARIOS, em(1, 15))).toBeNull();
    expect(fechamentoDaJanelaAtual(HORARIOS, em(1, 23, 30))).toBeNull();
  });

  it("antes da meia-noite, janela que vira o dia", () => {
    expect(fechamentoDaJanelaAtual(HORARIOS, em(2, 23))).toBe("02:00");
  });

  it("depois da meia-noite, a janela é a do dia anterior", () => {
    // 01h de quarta ainda pertence à terça.
    expect(fechamentoDaJanelaAtual(HORARIOS, em(3, 1))).toBe("02:00");
  });

  it("passada a virada, não há janela", () => {
    expect(fechamentoDaJanelaAtual(HORARIOS, em(3, 3))).toBeNull();
  });

  it("dia fechado não tem janela", () => {
    expect(fechamentoDaJanelaAtual(HORARIOS, em(0, 20))).toBeNull();
  });
});

describe("proximaAbertura", () => {
  it("indica hoje quando a abertura ainda vai acontecer", () => {
    expect(proximaAbertura(HORARIOS, em(1, 10))).toEqual({
      diaSemana: 1,
      hora: "18:00",
      hoje: true,
    });
  });

  it("passa para o próximo dia aberto quando a de hoje já começou", () => {
    expect(proximaAbertura(HORARIOS, em(1, 20))).toEqual({
      diaSemana: 2,
      hora: "18:00",
      hoje: false,
    });
  });

  it("pula os dias fechados e dá a volta na semana", () => {
    // Quarta a sábado não estão cadastrados; a próxima é segunda.
    expect(proximaAbertura(HORARIOS, em(3, 12))?.diaSemana).toBe(1);
  });

  it("sem dia aberto algum, devolve nulo em vez de inventar", () => {
    expect(proximaAbertura([{ diaSemana: 0, fechado: true, abre: null, fecha: null }], em(0, 12)))
      .toBeNull();
  });
});

describe("rotuloDeHorario", () => {
  it("aberta mostra até que horas dá para pedir", () => {
    expect(rotuloDeHorario(HORARIOS, em(1, 20), true)).toBe("Pedidos até 23:00");
  });

  it("fechada diz quando reabre", () => {
    expect(rotuloDeHorario(HORARIOS, em(1, 10), false)).toBe("Abre hoje às 18:00");
    expect(rotuloDeHorario(HORARIOS, em(1, 23, 30), false)).toBe("Abre terça às 18:00");
  });

  it("loja sem horário cadastrado não inventa nada", () => {
    expect(rotuloDeHorario([], em(1, 20), false)).toBe("Horário não configurado");
  });

  it("aberta por fechamento manual resolvido, sem janela, ainda diz que está aberta", () => {
    expect(rotuloDeHorario(HORARIOS, em(4, 20), true)).toBe("Aberta agora");
  });
});
