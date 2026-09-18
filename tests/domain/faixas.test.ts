import { describe, expect, it } from "vitest";
import {
  distanciaMaximaAtendida,
  faixaParaDistancia,
  situacaoEntrega,
  type FaixaEntrega,
} from "@/domain/entrega/faixas";

/**
 * 79.2 e RN-ENT-006 a RN-ENT-014.
 *
 * As faixas aqui usam a mesma fronteira da constraint de não sobreposição no
 * banco: (min, max], com a faixa iniciada em 0 cobrindo também a distância 0.
 */
const FAIXAS: FaixaEntrega[] = [
  { id: "a", distanciaMinKm: 0, distanciaMaxKm: 2, taxa: 5, ativa: true },
  { id: "b", distanciaMinKm: 2, distanciaMaxKm: 4, taxa: 8, ativa: true },
  { id: "c", distanciaMinKm: 4, distanciaMaxKm: 8, taxa: 14, ativa: true },
  { id: "d", distanciaMinKm: 8, distanciaMaxKm: 20, taxa: 30, ativa: false },
];

describe("faixaParaDistancia", () => {
  it("encontra a faixa que cobre a distância", () => {
    expect(faixaParaDistancia(FAIXAS, 1)?.id).toBe("a");
    expect(faixaParaDistancia(FAIXAS, 3)?.id).toBe("b");
    expect(faixaParaDistancia(FAIXAS, 7.5)?.id).toBe("c");
  });

  it("na fronteira, o km fechado pertence à faixa que termina nele", () => {
    expect(faixaParaDistancia(FAIXAS, 2)?.id).toBe("a");
    expect(faixaParaDistancia(FAIXAS, 4)?.id).toBe("b");
  });

  it("a distância zero cai na faixa que começa em zero", () => {
    expect(faixaParaDistancia(FAIXAS, 0)?.id).toBe("a");
  });

  it("ignora faixa inativa", () => {
    expect(faixaParaDistancia(FAIXAS, 12)).toBeNull();
  });

  it("recusa distância inválida em vez de escolher qualquer faixa", () => {
    expect(faixaParaDistancia(FAIXAS, -1)).toBeNull();
    expect(faixaParaDistancia(FAIXAS, Number.NaN)).toBeNull();
  });
});

describe("distanciaMaximaAtendida", () => {
  it("deriva da maior faixa ATIVA, não de um campo próprio", () => {
    expect(distanciaMaximaAtendida(FAIXAS)).toBe(8);
  });

  it("sem faixa ativa, nada é atendido", () => {
    expect(distanciaMaximaAtendida(FAIXAS.map((f) => ({ ...f, ativa: false })))).toBe(0);
  });
});

describe("situacaoEntrega", () => {
  const raio = 4;

  it("dentro do raio automático, o pedido segue normalmente", () => {
    const s = situacaoEntrega(FAIXAS, 3, raio);
    expect(s.tipo).toBe("automatica");
    expect(s.tipo === "automatica" && s.faixa.taxa).toBe(8);
  });

  it("acima do raio e dentro do máximo, exige aprovação da Shalon", () => {
    const s = situacaoEntrega(FAIXAS, 6, raio);
    expect(s.tipo).toBe("aprovacao_necessaria");
    expect(s.tipo === "aprovacao_necessaria" && s.faixa.taxa).toBe(14);
  });

  it("além da distância máxima, a entrega é bloqueada", () => {
    expect(situacaoEntrega(FAIXAS, 12, raio).tipo).toBe("fora_de_area");
  });

  it("sem faixa que cubra, o resultado é bloqueio — NUNCA taxa zero", () => {
    // CLAUDE.md §20: "Nunca deixar falha de cálculo produzir taxa R$ 0,00
    // acidental." Um buraco na configuração não pode virar entrega grátis.
    const comBuraco: FaixaEntrega[] = [
      { id: "a", distanciaMinKm: 0, distanciaMaxKm: 2, taxa: 5, ativa: true },
      { id: "c", distanciaMinKm: 6, distanciaMaxKm: 8, taxa: 14, ativa: true },
    ];
    expect(situacaoEntrega(comBuraco, 4, raio).tipo).toBe("fora_de_area");
  });
});
