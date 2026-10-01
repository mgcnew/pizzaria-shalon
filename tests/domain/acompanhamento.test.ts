import { describe, expect, it } from "vitest";
import { acompanhamentoEncerrado, assinaturaDoPedido } from "@/domain/pedidos/acompanhamento";

const base = {
  status: "waiting_store_confirmation",
  total: 58,
  aguarda_aprovacao_entrega: false,
  pagamento: { pix_status: null },
};

describe("assinaturaDoPedido", () => {
  it("é estável para o mesmo pedido", () => {
    expect(assinaturaDoPedido(base)).toBe(assinaturaDoPedido({ ...base }));
  });

  it("muda quando muda o que o cliente vê", () => {
    const a = assinaturaDoPedido(base);
    expect(assinaturaDoPedido({ ...base, status: "confirmed" })).not.toBe(a);
    expect(assinaturaDoPedido({ ...base, total: 61 })).not.toBe(a);
    expect(assinaturaDoPedido({ ...base, aguarda_aprovacao_entrega: true })).not.toBe(a);
    expect(assinaturaDoPedido({ ...base, pagamento: { pix_status: "confirmed" } })).not.toBe(a);
  });
});

describe("acompanhamentoEncerrado", () => {
  it("para nos estados finais e segue nos demais", () => {
    expect(acompanhamentoEncerrado("completed")).toBe(true);
    expect(acompanhamentoEncerrado("rejected")).toBe(true);
    expect(acompanhamentoEncerrado("cancelled")).toBe(true);
    expect(acompanhamentoEncerrado("out_for_delivery")).toBe(false);
    expect(acompanhamentoEncerrado("ready_for_pickup")).toBe(false);
  });
});
