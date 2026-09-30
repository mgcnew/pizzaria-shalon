import { describe, expect, it } from "vitest";
import { calcularPrevisaoDePagamento } from "@/domain/equipe/conferencia";

const lancamentos = [
  { id: "vale", valor: 75.10 },
  { id: "consumo", valor: 12.35 },
];

describe("conferência salarial", () => {
  it("mantém o combinado integral quando nenhum lançamento é escolhido", () => {
    expect(calcularPrevisaoDePagamento({
      valorReferencia: 2500,
      base: "monthly",
      diarias: 0,
      lancamentos,
      selecionados: [],
    })).toEqual({ base: 2500, abatimentos: 0, previsao: 2500 });
  });

  it("usa as diárias informadas e abate somente os lançamentos selecionados", () => {
    expect(calcularPrevisaoDePagamento({
      valorReferencia: 120.50,
      base: "daily",
      diarias: 3,
      lancamentos,
      selecionados: ["vale"],
    })).toEqual({ base: 361.5, abatimentos: 75.1, previsao: 286.4 });
  });
});
