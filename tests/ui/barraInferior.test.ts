import { describe, expect, it } from "vitest";
import { barraInferiorOculta } from "@/ui/navegacao";

describe("barra inferior do celular (D-2026-10-30-178)", () => {
  it("some nas telas com rodapé próprio", () => {
    expect(barraInferiorOculta("/admin/pedidos/novo")).toBe(true);
    expect(barraInferiorOculta("/admin/pdv")).toBe(true);
  });

  it("fica nas demais, inclusive a fila e o detalhe do pedido", () => {
    expect(barraInferiorOculta("/admin")).toBe(false);
    expect(barraInferiorOculta("/admin/pedidos")).toBe(false);
    expect(barraInferiorOculta("/admin/pedidos/abc")).toBe(false);
  });
});
