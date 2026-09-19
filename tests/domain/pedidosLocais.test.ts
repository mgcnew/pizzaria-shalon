import { describe, expect, it } from "vitest";
import {
  ehTokenValido,
  lerPedidosLocais,
  MAXIMO_GUARDADO,
  registrarPedidoLocal,
} from "@/domain/pedidos/locais";

const token = (n: number) => n.toString(16).padStart(64, "0");

describe("pedidos guardados no navegador", () => {
  it("aceita apenas token no formato esperado", () => {
    expect(ehTokenValido(token(1))).toBe(true);
    expect(ehTokenValido("ABC")).toBe(false);
    expect(ehTokenValido("Z".repeat(64))).toBe(false);
    expect(ehTokenValido(null)).toBe(false);
    expect(ehTokenValido(123)).toBe(false);
  });

  it("descarta conteúdo malformado do armazenamento local", () => {
    expect(lerPedidosLocais(null)).toEqual([]);
    expect(lerPedidosLocais("nada")).toEqual([]);
    expect(
      lerPedidosLocais([
        { token: "curto", numero: 1, criadoEm: 1 },
        { token: token(2), numero: 0, criadoEm: 1 },
        { token: token(3), numero: 5, criadoEm: "ontem" },
        { token: token(4), numero: 7, criadoEm: 10 },
      ]),
    ).toEqual([{ token: token(4), numero: 7, criadoEm: 10 }]);
  });

  it("ordena do mais recente para o mais antigo", () => {
    const lista = lerPedidosLocais([
      { token: token(1), numero: 1, criadoEm: 100 },
      { token: token(2), numero: 2, criadoEm: 300 },
      { token: token(3), numero: 3, criadoEm: 200 },
    ]);
    expect(lista.map((p) => p.numero)).toEqual([2, 3, 1]);
  });

  it("não duplica quando a mesma tentativa é registrada de novo", () => {
    // O token vem do HMAC da chave de idempotência: reenviar devolve o mesmo.
    const um = registrarPedidoLocal([], { token: token(9), numero: 1000, criadoEm: 1 });
    const dois = registrarPedidoLocal(um, { token: token(9), numero: 1000, criadoEm: 2 });
    expect(dois).toHaveLength(1);
    expect(dois[0]?.criadoEm).toBe(2);
  });

  it("guarda no máximo os mais recentes", () => {
    let lista = lerPedidosLocais([]);
    for (let i = 1; i <= MAXIMO_GUARDADO + 5; i += 1) {
      lista = registrarPedidoLocal(lista, { token: token(i), numero: i, criadoEm: i });
    }
    expect(lista).toHaveLength(MAXIMO_GUARDADO);
    expect(lista[0]?.numero).toBe(MAXIMO_GUARDADO + 5);
  });

  it("ignora token inválido em vez de guardar lixo", () => {
    expect(registrarPedidoLocal([], { token: "x", numero: 1, criadoEm: 1 })).toEqual([]);
  });
});
