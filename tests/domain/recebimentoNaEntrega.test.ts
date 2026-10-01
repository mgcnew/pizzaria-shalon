import { describe, expect, it } from "vitest";
import {
  dinheiroNaGavetaPorPadrao,
  momentoDoRecebimento,
} from "@/domain/pedidos/recebimentoNaEntrega";

describe("momentoDoRecebimento", () => {
  it("retirada recebe agora, em qualquer estado", () => {
    expect(momentoDoRecebimento("pickup", "in_production")).toBe("agora");
    expect(momentoDoRecebimento("pickup", "ready_for_pickup")).toBe("agora");
  });

  it("entrega que ainda não saiu abre em receber na entrega", () => {
    for (const status of ["waiting_store_confirmation", "confirmed", "in_production", "ready_for_delivery"]) {
      expect(momentoDoRecebimento("delivery", status)).toBe("antes_da_entrega");
    }
  });

  it("entrega que saiu ou foi entregue registra o que o motoboy recebeu", () => {
    expect(momentoDoRecebimento("delivery", "out_for_delivery")).toBe("depois_da_saida");
    expect(momentoDoRecebimento("delivery", "completed")).toBe("depois_da_saida");
  });
});

describe("dinheiroNaGavetaPorPadrao", () => {
  it("só fica fora da gaveta quando está com o motoboy", () => {
    expect(dinheiroNaGavetaPorPadrao("agora")).toBe(true);
    expect(dinheiroNaGavetaPorPadrao("antes_da_entrega")).toBe(true);
    expect(dinheiroNaGavetaPorPadrao("depois_da_saida")).toBe(false);
  });
});
