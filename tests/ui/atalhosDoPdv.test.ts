import { describe, expect, it } from "vitest";
import {
  decidirAtalho,
  teclasAtivas,
  TECLAS_RESERVADAS,
  type ContextoDoPdv,
  type TeclaPressionada,
} from "@/app/(admin)/admin/pdv/_ui/atalhos";

const PARADO: ContextoDoPdv = {
  focoEmCampo: false,
  focoNaLeitura: false,
  leituraPreenchida: false,
  cedendoAVez: false,
  temItens: false,
  podeSalvar: false,
  temResultados: false,
  configuradorAberto: false,
  podeMovimentarCaixa: true,
};

function tecla(key: string, extras: Partial<TeclaPressionada> = {}): TeclaPressionada {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extras };
}

function decidir(key: string, ctx: Partial<ContextoDoPdv> = {}, extras = {}) {
  return decidirAtalho(tecla(key, extras), { ...PARADO, ...ctx });
}

describe("atalhos globais do PDV", () => {
  it("preserva atalhos reservados, Alt, Meta e Ctrl", () => {
    for (const key of TECLAS_RESERVADAS) expect(decidir(key)).toBeNull();
    expect(decidir("F4", {}, { altKey: true })).toBeNull();
    expect(decidir("F9", {}, { metaKey: true })).toBeNull();
    expect(decidir("s", {}, { ctrlKey: true })).toBeNull();
  });

  it("cede todas as teclas quando existe modal ou menu aberto", () => {
    for (const key of ["F2", "F3", "F4", "F7", "F9", "+", "Delete", "Escape"]) {
      expect(decidir(key, { cedendoAVez: true, temItens: true, podeSalvar: true })).toBeNull();
    }
  });

  it("mantém nova venda e busca e abre as operações de caixa", () => {
    expect(decidir("F2")).toBe("venda:nova");
    expect(decidir("F3")).toBe("venda:focar-leitura");
    expect(decidir("F4")).toBe("caixa:reforco");
    expect(decidir("F9")).toBe("caixa:sangria");
  });

  it("não anuncia nem abre operações sem caixa aberto ou permissão", () => {
    expect(decidir("F4", { podeMovimentarCaixa: false })).toBeNull();
    expect(decidir("F9", { podeMovimentarCaixa: false })).toBeNull();
    expect(teclasAtivas({ ...PARADO, podeMovimentarCaixa: false }).map((item) => item.tecla))
      .not.toContain("F4");
  });

  it("F7 salva somente quando o botão também está habilitado", () => {
    expect(decidir("F7", { temItens: true, podeSalvar: true })).toBe("venda:salvar");
    expect(decidir("F7", { temItens: true })).toBeNull();
  });
});

describe("busca e configurador", () => {
  it("Enter e Tab resolvem uma leitura preenchida", () => {
    const ctx = { focoEmCampo: true, focoNaLeitura: true, leituraPreenchida: true };
    expect(decidir("Enter", ctx)).toBe("venda:resolver");
    expect(decidir("Tab", ctx)).toBe("venda:resolver");
  });

  it("não prende Tab vazio nem reabre busca sob o configurador", () => {
    expect(decidir("Tab", { focoEmCampo: true, focoNaLeitura: true })).toBeNull();
    expect(decidir("Enter", {
      focoEmCampo: true,
      focoNaLeitura: true,
      leituraPreenchida: true,
      configuradorAberto: true,
    })).toBeNull();
  });

  it("Escape fecha o configurador antes de limpar a leitura", () => {
    expect(decidir("Escape", { configuradorAberto: true, leituraPreenchida: true }))
      .toBe("venda:fechar-configurador");
    expect(decidir("Escape", { leituraPreenchida: true })).toBe("venda:limpar-leitura");
  });

  it("setas navegam resultados e Enter escolhe", () => {
    expect(decidir("ArrowDown", { temResultados: true })).toBe("venda:resultado-proximo");
    expect(decidir("ArrowUp", { temResultados: true })).toBe("venda:resultado-anterior");
    expect(decidir("Enter", { temResultados: true })).toBe("venda:escolher-resultado");
  });
});

describe("carrinho", () => {
  it("navega, altera quantidade e remove a linha ativa", () => {
    expect(decidir("ArrowDown", { temItens: true })).toBe("venda:linha-proxima");
    expect(decidir("ArrowUp", { temItens: true })).toBe("venda:linha-anterior");
    expect(decidir("+", { temItens: true })).toBe("venda:mais");
    expect(decidir("-", { temItens: true })).toBe("venda:menos");
    expect(decidir("Delete", { temItens: true })).toBe("venda:remover");
  });

  it("não rouba caracteres quando a pessoa está digitando", () => {
    for (const key of ["+", "-", "/", "*", "Delete", "ArrowDown"]) {
      expect(decidir(key, { focoEmCampo: true, temItens: true })).toBeNull();
    }
  });

  it("permite atalhos do carrinho no campo de leitura vazio", () => {
    const ctx = { focoEmCampo: true, focoNaLeitura: true, temItens: true };
    expect(decidir("+", ctx)).toBe("venda:mais");
    expect(decidir("Delete", ctx)).toBe("venda:remover");
  });
});

describe("faixa de ajuda", () => {
  it("anuncia as novas ações fixas e omite cobrança", () => {
    const faixa = teclasAtivas(PARADO);
    expect(faixa).toContainEqual({ tecla: "F4", rotulo: "reforço" });
    expect(faixa).toContainEqual({ tecla: "F9", rotulo: "sangria" });
    expect(faixa.some((item) => item.rotulo === "receber")).toBe(false);
    expect(faixa.some((item) => item.rotulo === "pendentes")).toBe(false);
  });

  it("fica vazia quando a tela cede a vez", () => {
    expect(teclasAtivas({ ...PARADO, cedendoAVez: true })).toHaveLength(0);
  });
});
