import { describe, expect, it } from "vitest";
import { descreverEstado, type EstadoDoPedido } from "@/domain/pedidos/estados";

const TODOS: EstadoDoPedido[] = [
  "waiting_pix_confirmation",
  "waiting_delivery_approval",
  "waiting_store_confirmation",
  "change_requested_waiting_customer",
  "confirmed",
  "in_production",
  "ready_for_pickup",
  "ready_for_delivery",
  "out_for_delivery",
  "delivery_failed",
  "completed",
  "rejected",
  "cancelled",
];

describe("descrição dos estados do pedido", () => {
  it("descreve todos os estados aceitos pelo banco", () => {
    for (const estado of TODOS) {
      const d = descreverEstado(estado);
      expect(d.titulo.length).toBeGreaterThan(0);
      expect(d.detalhe.length).toBeGreaterThan(0);
    }
  });

  it("trata pedido enviado como NÃO aceito (RN-CHK-003)", () => {
    const d = descreverEstado("waiting_store_confirmation");
    expect(d.emAberto).toBe(true);
    expect(d.titulo).not.toMatch(/confirmado|aceito/i);
  });

  it("encerra apenas concluído, recusado e cancelado", () => {
    const encerrados = TODOS.filter((e) => !descreverEstado(e).emAberto);
    expect(encerrados).toEqual(["completed", "rejected", "cancelled"]);
  });

  it("não expõe o código técnico de um estado desconhecido", () => {
    const d = descreverEstado("estado_que_nao_existe");
    expect(d.titulo).not.toContain("estado_que_nao_existe");
    expect(d.emAberto).toBe(true);
  });
});
