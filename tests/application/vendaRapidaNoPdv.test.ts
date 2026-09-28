import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/infrastructure/supabase/server", () => ({
  getSupabaseServerClient: async () => ({ rpc }),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/application/pdv/consultas", () => ({
  resolverCodigoDeBarras: vi.fn(),
  buscarCatalogoPdv: vi.fn(),
}));
vi.mock("@/application/caixa/consultas", () => ({
  obterPagamentoDoPedido: vi.fn(),
}));

const { finalizarVendaRapida } = await import("@/application/pdv/acoes");

const entrada = {
  idempotency_key: "00000000-0000-4000-8000-000000000001",
  itens: [{
    linha: "produto-1",
    produto_id: "11111111-1111-4111-8111-111111111111",
    variacao_id: null,
    sabores: [],
    borda_id: null,
    adicionais: [],
    observacao: "",
    quantidade: 2,
  }],
  pagamento: {
    forma_id: "22222222-2222-4222-8222-222222222222",
    bandeira_id: null,
    recebido: 50,
  },
};

beforeEach(() => {
  rpc.mockReset();
  revalidatePath.mockReset();
  rpc.mockResolvedValue({
    data: {
      ok: true,
      pedido_id: "33333333-3333-4333-8333-333333333333",
      numero: 321,
      total: 32,
      forma: "Dinheiro",
      recebido: 50,
      troco: 18,
    },
    error: null,
  });
});

describe("venda rápida concluída no PDV", () => {
  it("usa uma única RPC transacional para criação, recebimento e conclusão", async () => {
    const resultado = await finalizarVendaRapida(entrada);

    expect(resultado).toEqual({
      ok: true,
      pedido_id: "33333333-3333-4333-8333-333333333333",
      numero: 321,
      total: 32,
      forma: "Dinheiro",
      recebido: 50,
      troco: 18,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("finalizar_venda_rapida_pdv", expect.objectContaining({
      p_pedido: expect.objectContaining({
        origem: "counter",
        modalidade: "pickup",
        cliente: {},
        idempotency_key: entrada.idempotency_key,
      }),
      p_pagamento: {
        forma_id: entrada.pagamento.forma_id,
        bandeira_id: null,
        recebido: 50,
      },
    }));
  });

  it("mantém o carrinho recuperável quando o banco recusa", async () => {
    rpc.mockResolvedValue({
      data: { ok: false, erro: "Esta venda contém item que exige produção." },
      error: null,
    });

    await expect(finalizarVendaRapida(entrada)).resolves.toEqual({
      ok: false,
      erro: "Esta venda contém item que exige produção.",
    });
  });

  it("não chama o banco com pagamento incompleto", async () => {
    const resultado = await finalizarVendaRapida({ ...entrada, pagamento: { forma_id: "x" } });

    expect(resultado.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
