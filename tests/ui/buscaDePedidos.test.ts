import { describe, expect, it } from "vitest";
import { filtrarPedidosPorBusca } from "@/app/(admin)/admin/pedidos/_ui/buscaDePedidos";

const fila = [
  { numero: 33886, cliente: "José Antônio" },
  { numero: 33901, cliente: "Maria Joana" },
  { numero: 1205, cliente: "Balcão" },
];

describe("busca na fila de pedidos", () => {
  it("vazio devolve tudo, na mesma ordem", () => {
    expect(filtrarPedidosPorBusca(fila, "  ")).toEqual(fila);
  });

  it("algarismos casam o começo do número, com ou sem #", () => {
    expect(filtrarPedidosPorBusca(fila, "338").map((p) => p.numero)).toEqual([33886]);
    expect(filtrarPedidosPorBusca(fila, "#339").map((p) => p.numero)).toEqual([33901]);
    expect(filtrarPedidosPorBusca(fila, "3").map((p) => p.numero)).toEqual([33886, 33901]);
  });

  it("número não casa no meio: 886 não acha o #33886", () => {
    expect(filtrarPedidosPorBusca(fila, "886")).toEqual([]);
  });

  it("nome sem acento e sem caixa, cada palavra precisa aparecer", () => {
    expect(filtrarPedidosPorBusca(fila, "jose").map((p) => p.numero)).toEqual([33886]);
    expect(filtrarPedidosPorBusca(fila, "JO").map((p) => p.numero)).toEqual([33886, 33901]);
    expect(filtrarPedidosPorBusca(fila, "maria ana").map((p) => p.numero)).toEqual([33901]);
    expect(filtrarPedidosPorBusca(fila, "maria jose")).toEqual([]);
  });
});
