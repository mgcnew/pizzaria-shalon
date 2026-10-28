import { describe, expect, it } from "vitest";
import { aEntregarNaVolta, comAVolta, VOLTOU } from "@/domain/entrega/voltaDoMotoboy";

const acao = (comando: string, destrutivo = false) => ({ comando, rotulo: comando, exige_motivo: destrutivo, destrutivo });

describe("comAVolta", () => {
  it("troca concluir e falhou por uma ação só, no lugar do primeiro", () => {
    const r = comAVolta([acao("concluir"), acao("registrar_falha_entrega", true), acao("cancelar", true)], { nome: "Erisvan" });
    expect(r.map((a) => a.comando)).toEqual([VOLTOU, "cancelar"]);
    expect(r[0]?.rotulo).toBe("Erisvan voltou");
    expect(r[0]?.destrutivo).toBe(false);
  });

  it("sem motoboy, ou sem concluir, não mexe", () => {
    const acoes = [acao("concluir"), acao("cancelar", true)];
    expect(comAVolta(acoes, null)).toBe(acoes);
    const outras = [acao("marcar_pronto")];
    expect(comAVolta(outras, { nome: "Erisvan" })).toBe(outras);
  });
});

describe("aEntregarNaVolta", () => {
  const pedidos = [
    { pedido_id: "a", dinheiro_com_ele: 45.1 },
    { pedido_id: "b", dinheiro_com_ele: 0 },
    { pedido_id: "c", dinheiro_com_ele: 32.2 },
  ];

  it("soma o dinheiro das entregas e o troco, em centavos", () => {
    expect(aEntregarNaVolta(pedidos, new Set(), 20)).toBe(97.3);
  });

  it("entrega não feita não entra", () => {
    expect(aEntregarNaVolta(pedidos, new Set(["c"]), 0)).toBe(45.1);
  });
});
