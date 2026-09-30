import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/infrastructure/supabase/server", () => ({
  getSupabaseServerClient: async () => ({ rpc }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { salvarFuncionario } = await import("@/application/equipe/acoes");

const cadastro = {
  nome: "Maria Silva",
  tipo: "counter" as const,
  entregador: false,
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { ok: true, funcionario_id: "11111111-1111-4111-8111-111111111111" }, error: null });
});

describe("referência salarial no cadastro", () => {
  it("envia base e valor somente quando o salário foi informado", async () => {
    const resultado = await salvarFuncionario({ ...cadastro, salario_valor: 120, salario_base: "daily" });

    expect(resultado).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("salvar_funcionario_com_referencia", {
      p_dados: expect.objectContaining({ salario_valor: 120, salario_base: "daily" }),
    });
  });

  it("preserva referência existente em edição operacional sem campo financeiro", async () => {
    await salvarFuncionario({ ...cadastro, id: "11111111-1111-4111-8111-111111111111" });

    const dados = rpc.mock.calls[0]?.[1]?.p_dados as Record<string, unknown>;
    expect(dados).not.toHaveProperty("salario_valor");
    expect(dados).not.toHaveProperty("salario_base");
  });

  it("recusa referência sem unidade antes de chegar ao banco", async () => {
    const resultado = await salvarFuncionario({ ...cadastro, salario_valor: 200 });

    expect(resultado.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
