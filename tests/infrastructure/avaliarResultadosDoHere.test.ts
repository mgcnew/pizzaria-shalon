import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { avaliarResultadosDoHere } = await import("@/infrastructure/rotas/here");

const casa = (nota: number, lat = -23.69, lng = -46.64, cep = "04474160") => ({
  resultType: "houseNumber",
  houseNumberType: "PA",
  position: { lat, lng },
  address: { label: "x", postalCode: cep },
  scoring: { queryScore: nota },
});

describe("avaliarResultadosDoHere", () => {
  it("aceita o número da casa com nota alta", () => {
    expect(avaliarResultadosDoHere([casa(0.97)], "04474160")).toMatchObject({ ok: true, confianca: "exata" });
  });

  it("recusa resultado de nota baixa (o HERE chutou outra rua)", () => {
    expect(avaliarResultadosDoHere([casa(0.56)], "04474150")).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("aceita só a rua quando o CEP do resultado é o digitado", () => {
    const rua = {
      resultType: "street",
      position: { lat: -23.696, lng: -46.643 },
      address: { label: "Rua dos Dourados", postalCode: "04474-160" },
      scoring: { queryScore: 0.95 },
    };
    expect(avaliarResultadosDoHere([rua], "04474-160")).toMatchObject({ ok: true, confianca: "aproximada" });
    // Sem CEP, ou CEP diferente, a rua sozinha continua recusada.
    expect(avaliarResultadosDoHere([rua], null)).toEqual({ ok: false, motivo: "ambiguo" });
    expect(avaliarResultadosDoHere([rua], "04474150")).toEqual({ ok: false, motivo: "ambiguo" });
  });

  it("segundo resultado fraco ou no mesmo lugar não torna ambíguo", () => {
    expect(avaliarResultadosDoHere([casa(0.95), casa(0.6, -23.5, -46.5)], null).ok).toBe(true);
    expect(avaliarResultadosDoHere([casa(0.95), casa(0.95, -23.6901, -46.6401)], null).ok).toBe(true);
  });

  it("segundo resultado que concorre, em outro lugar, é ambíguo", () => {
    expect(avaliarResultadosDoHere([casa(0.95), casa(0.93, -23.5, -46.5)], null)).toEqual({
      ok: false,
      motivo: "ambiguo",
    });
  });

  it("sem resultado é não encontrado", () => {
    expect(avaliarResultadosDoHere([], null)).toEqual({ ok: false, motivo: "nao_encontrado" });
  });
});
