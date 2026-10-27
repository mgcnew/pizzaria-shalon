import { describe, expect, it } from "vitest";
import {
  ATALHOS_DE_PERMISSOES,
  GRUPOS_DE_PERMISSOES,
  dependenciasFaltando,
  marcarComDependencias,
  permissao,
  quemDependeDe,
} from "@/domain/equipe/permissoes";

const TODOS = GRUPOS_DE_PERMISSOES.flatMap((g) => g.itens.map((p) => p.codigo));

describe("catálogo de permissões (D-2026-10-27-168)", () => {
  it("cada código aparece uma vez e toda permissão explica o que libera", () => {
    expect(new Set(TODOS).size).toBe(TODOS.length);
    for (const g of GRUPOS_DE_PERMISSOES) for (const p of g.itens) expect(p.explica.length).toBeGreaterThan(10);
  });

  it("dependências e atalhos só citam permissões que existem", () => {
    for (const g of GRUPOS_DE_PERMISSOES)
      for (const p of g.itens) for (const d of p.precisa ?? []) expect(TODOS).toContain(d);
    for (const a of ATALHOS_DE_PERMISSOES) for (const c of a.codigos) expect(TODOS).toContain(c);
  });

  it("ver configurações e ver o financeiro não são pré-requisito de nada do balcão", () => {
    for (const g of GRUPOS_DE_PERMISSOES)
      for (const p of g.itens) {
        if (!p.codigo.startsWith("settings.")) expect(p.precisa ?? []).not.toContain("settings.view");
        if (!p.codigo.startsWith("finance.")) expect(p.precisa ?? []).not.toContain("finance.view");
      }
  });

  it("o atalho Vender no balcão cobre o que o PDV exige para concluir a venda", () => {
    const balcao = ATALHOS_DE_PERMISSOES.find((a) => a.titulo === "Vender no balcão")!;
    for (const c of ["orders.create_manual", "payments.register", "orders.accept", "cash.view"])
      expect(balcao.codigos).toContain(c);
    for (const c of balcao.codigos) expect(dependenciasFaltando(c, balcao.codigos)).toEqual([]);
  });
});

describe("dependências", () => {
  it("aponta o que falta", () => {
    expect(dependenciasFaltando("deliveries.manage", ["deliveries.view"])).toEqual(["payments.register"]);
    expect(dependenciasFaltando("orders.view", [])).toEqual([]);
    expect(dependenciasFaltando("codigo.desconhecido", [])).toEqual([]);
  });

  it("marcar traz junto as dependências em cadeia, sem repetir", () => {
    const r = marcarComDependencias("deliveries.settle", ["orders.view"]);
    expect(r.marcados.sort()).toEqual(
      ["deliveries.manage", "deliveries.settle", "deliveries.view", "orders.view", "payments.register"].sort(),
    );
    expect(r.junto.sort()).toEqual(["deliveries.manage", "deliveries.view", "payments.register"].sort());
  });

  it("diz quem deixa de funcionar ao desmarcar", () => {
    expect(quemDependeDe("payments.register", ["payments.register", "deliveries.manage", "cash.view"]))
      .toEqual(["deliveries.manage"]);
    expect(permissao("payments.register")?.rotulo).toBe("Registrar pagamento recebido");
  });
});
