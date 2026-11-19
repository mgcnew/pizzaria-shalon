import { describe, expect, it } from "vitest";
import { ehMarco, mensagemDoMarco, seloDoSabor } from "@/domain/clientes/valorizacao";

describe("marcos do cliente que volta", () => {
  it("comemora 1, 5, 10, 25, 50, 100 e depois a cada 50", () => {
    const marcos = Array.from({ length: 300 }, (_, i) => i + 1).filter(ehMarco);
    expect(marcos).toEqual([1, 5, 10, 25, 50, 100, 150, 200, 250, 300]);
  });

  it("número inválido não é marco", () => {
    expect(ehMarco(0)).toBe(false);
    expect(ehMarco(-5)).toBe(false);
    expect(ehMarco(5.5)).toBe(false);
  });

  it("o primeiro pedido tem boas-vindas, os outros o número", () => {
    expect(mensagemDoMarco(1)?.titulo).toContain("primeiro pedido");
    expect(mensagemDoMarco(10)?.titulo).toBe("Este é o seu 10º pedido por aqui");
    expect(mensagemDoMarco(7)).toBeNull();
  });
});

describe("selo do sabor favorito", () => {
  it("só a partir de 3 pedidos", () => {
    expect(seloDoSabor({ nome: "Calabresa", vezes: 2 })).toBeNull();
    expect(seloDoSabor({ nome: "Calabresa", vezes: 3 })).toBe("Fã de Calabresa");
  });

  it("sem sabor, sem selo", () => {
    expect(seloDoSabor(null)).toBeNull();
    expect(seloDoSabor({ nome: "  ", vezes: 9 })).toBeNull();
  });
});
