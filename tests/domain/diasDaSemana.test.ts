import { describe, expect, it } from "vitest";
import { descreverDias } from "@/domain/catalogo/diasDaSemana";

describe("descreverDias", () => {
  it("sequência vira intervalo", () => {
    expect(descreverDias([2, 3, 4])).toBe("Terça a quinta");
    expect(descreverDias([1, 2, 3, 4, 5])).toBe("Segunda a sexta");
  });
  it("dois dias seguidos listam os dois", () => {
    expect(descreverDias([6, 7])).toBe("Sábado e domingo");
    expect(descreverDias([2, 3])).toBe("Terça e quarta");
  });
  it("dia isolado", () => {
    expect(descreverDias([2])).toBe("Toda terça");
  });
  it("dias soltos", () => {
    expect(descreverDias([1, 3, 5])).toBe("Segunda, quarta e sexta");
  });
  it("todos os dias ou nulo não dizem nada", () => {
    expect(descreverDias(null)).toBeNull();
    expect(descreverDias([1, 2, 3, 4, 5, 6, 7])).toBeNull();
  });
  it("ignora ordem e repetição", () => {
    expect(descreverDias([4, 2, 3, 3])).toBe("Terça a quinta");
  });
});
