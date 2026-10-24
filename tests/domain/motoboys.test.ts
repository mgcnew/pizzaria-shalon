import { describe, expect, it } from "vitest";
import { situacaoDoMotoboy } from "@/domain/entrega/motoboys";

const livre = { ocupado: false, presenca: null } as const;

describe("situação do motoboy (D-2026-10-24-165)", () => {
  it("sem marca e sem corrida: disponível, e diz que a presença não foi marcada", () => {
    const s = situacaoDoMotoboy(livre, undefined);
    expect(s.texto).toBe("Disponível");
    expect(s.recebeEntrega).toBe(true);
    expect(s.detalhe).toContain("não marcada");
  });

  it("veio: disponível", () => {
    const s = situacaoDoMotoboy({ ocupado: false, presenca: "present" }, undefined);
    expect(s.texto).toBe("Disponível");
    expect(s.detalhe).toContain("Veio hoje");
  });

  it("faltou: não recebe entrega e sai da escolha; esquecer de marcar nunca bloqueia", () => {
    const faltou = situacaoDoMotoboy({ ocupado: false, presenca: "absent" }, undefined);
    expect(faltou.texto).toBe("Faltou hoje");
    expect(faltou.recebeEntrega).toBe(false);
    expect(situacaoDoMotoboy(livre, undefined).recebeEntrega).toBe(true);
  });

  it("a corrida em aberto aparece pelo que ela é", () => {
    expect(situacaoDoMotoboy({ ocupado: true, presenca: null }, { status: "open", pedidos: 2 }).texto).toBe("Montando");
    expect(situacaoDoMotoboy({ ocupado: true, presenca: null }, { status: "out", pedidos: 1 }).detalhe).toBe("1 pedido");
    expect(situacaoDoMotoboy({ ocupado: true, presenca: null }, { status: "settling", pedidos: 3 }).texto).toBe("A acertar");
  });

  it("marcado como ausente com corrida já na rua: mostra a corrida e avisa, e não recebe novo pedido", () => {
    const s = situacaoDoMotoboy({ ocupado: true, presenca: "absent" }, { status: "out", pedidos: 2 });
    expect(s.texto).toBe("Na rua");
    expect(s.detalhe).toContain("ausente");
    expect(s.recebeEntrega).toBe(false);
  });

  it("ordena: disponível, montando, na rua, a acertar, faltou", () => {
    const ordens = [
      situacaoDoMotoboy(livre, undefined),
      situacaoDoMotoboy({ ocupado: true, presenca: null }, { status: "open", pedidos: 1 }),
      situacaoDoMotoboy({ ocupado: true, presenca: null }, { status: "out", pedidos: 1 }),
      situacaoDoMotoboy({ ocupado: true, presenca: null }, { status: "settling", pedidos: 1 }),
      situacaoDoMotoboy({ ocupado: false, presenca: "absent" }, undefined),
    ].map((s) => s.ordem);
    expect(ordens).toEqual([...ordens].sort((a, b) => a - b));
  });
});
