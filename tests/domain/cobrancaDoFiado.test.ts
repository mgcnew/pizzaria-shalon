import { describe, expect, it } from "vitest";
import { linkDoWhatsApp, mensagemDeCobranca } from "@/domain/fiado/cobranca";

const UM = { numero: 29, em_aberto: 46, desde: "2026-10-18T00:46:28Z" };

describe("mensagemDeCobranca", () => {
  it("um pedido: número, data local e valor", () => {
    const m = mensagemDeCobranca("camila souza", [UM]);
    expect(m).toContain("Oi, Camila!");
    expect(m).toContain("pedido #29");
    // 00:46 UTC do dia 18 ainda é dia 17 em São Paulo.
    expect(m).toContain("17/10");
    expect(m).toContain("R$ 46,00");
  });
  it("vários pedidos somam o total", () => {
    const m = mensagemDeCobranca("Ana", [UM, { numero: 31, em_aberto: 20.5, desde: "2026-10-19T20:00:00Z" }]);
    expect(m).toContain("#29");
    expect(m).toContain("#31");
    expect(m).toContain("R$ 66,50");
  });
});

describe("linkDoWhatsApp", () => {
  it("acrescenta o 55 e codifica o texto", () => {
    expect(linkDoWhatsApp("(11) 98045-6447", "oi tudo")).toBe("https://wa.me/5511980456447?text=oi%20tudo");
  });
  it("número curto demais não vira link", () => {
    expect(linkDoWhatsApp("1234", "x")).toBeNull();
  });
});
