import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AS PORTAS DO CAIXA, USADAS PELO PDV — Fase 12, Etapa 8
 *
 * A suíte `pdv_etapa8_fase12.sql` prova as regras no banco: fundo, sangria
 * maior que a gaveta, Pix fora do esperado, diferença de fechamento,
 * permissões. Nada disso se repete aqui.
 *
 * Este arquivo responde só o que é da camada de aplicação — e a pergunta
 * central é sempre a mesma: a aplicação está CALCULANDO alguma coisa que
 * deveria ser do servidor?
 *
 * - o esperado em caixa sobe daqui? (não pode)
 * - a diferença do fechamento é calculada aqui? (não pode)
 * - a chave de tentativa sobe como veio, para o duplo clique no balcão virar
 *   repetição e não segundo reforço?
 * - as recusas do servidor chegam com a bandeira que a tela usa?
 */

type Resposta = { data: unknown; error: unknown };

let chamadas: { nome: string; args: Record<string, unknown> }[];
let resposta: Resposta;

vi.mock("@/infrastructure/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      return resposta;
    },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const {
  abrirCaixa,
  movimentarCaixa,
  fecharCaixa,
  iniciarFechamentoCego,
} = await import("@/application/caixa/acoes");

const CHAVE = "55555555-5555-4555-8555-555555555555";

function enviado() {
  return chamadas[0]?.args["p_dados"] as Record<string, unknown>;
}

beforeEach(() => {
  chamadas = [];
  resposta = { data: { ok: true }, error: null };
});

describe("abrir caixa", () => {
  it("manda o fundo e nada mais", async () => {
    const r = await abrirCaixa({ fundo: 150 });

    expect(r.ok).toBe(true);
    expect(chamadas[0]?.nome).toBe("abrir_caixa");
    expect(enviado()).toEqual({ fundo: 150 });
  });

  it("fundo zero e valido, e nao vira 'sem fundo'", async () => {
    // RN-CAIXA-002: comecar sem troco na gaveta e uma decisao da casa, nao
    // um erro de preenchimento.
    const r = await abrirCaixa({ fundo: 0 });

    expect(r.ok).toBe(true);
    expect(enviado()["fundo"]).toBe(0);
  });

  it("fundo negativo nem chega ao servidor", async () => {
    const r = await abrirCaixa({ fundo: -10 });

    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("a recusa de segunda abertura chega da forma que o servidor escreveu", async () => {
    resposta = { data: { ok: false, erro: "Já existe um caixa aberto." }, error: null };

    const r = await abrirCaixa({ fundo: 100 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toContain("Já existe");
  });
});

describe("suprimento e sangria", () => {
  it("o tipo e o valor sobem como vieram", async () => {
    await movimentarCaixa({ tipo: "supply", valor: 100, motivo: "troco", tentativa: CHAVE });

    expect(chamadas[0]?.nome).toBe("movimentar_caixa");
    expect(enviado()).toMatchObject({ tipo: "supply", valor: 100, motivo: "troco" });
  });

  it("a chave de tentativa sobe como veio", async () => {
    await movimentarCaixa({ tipo: "withdrawal", valor: 50, tentativa: CHAVE });

    // É ela que faz o duplo clique virar repetição, e não uma segunda sangria
    // de R$ 50 que ninguém tirou da gaveta (CLAUDE.md §34).
    expect(enviado()["idempotency_key"]).toBe(CHAVE);
  });

  it("valor zero nao passa da fronteira", async () => {
    const r = await movimentarCaixa({ tipo: "supply", valor: 0, tentativa: CHAVE });

    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("a aplicacao NAO confere o saldo antes de mandar", async () => {
    // Quem sabe quanto há na gaveta é `esperado_em_caixa`, no servidor, dentro
    // da transação. Conferir aqui seria uma segunda regra, e ela erraria no
    // instante em que outro terminal recebesse um pagamento.
    resposta = {
      data: { ok: false, erro: "O valor é maior que o dinheiro esperado em caixa." },
      error: null,
    };

    const r = await movimentarCaixa({ tipo: "withdrawal", valor: 999999, tentativa: CHAVE });

    // Chegou ao servidor: a recusa é DELE.
    expect(chamadas).toHaveLength(1);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toContain("maior que o dinheiro");
  });
});

describe("fechamento", () => {
  it("a primeira confirmação manda apenas o contado, sem revelar nem aceitar o esperado", async () => {
    resposta = {
      data: { ok: true, esperado: 90, contado: 90, diferenca: 0 },
      error: null,
    };

    const r = await iniciarFechamentoCego({ contado: 90 });

    expect(enviado()).toEqual({ contado: 90, justificativa: null });
    expect(r).toMatchObject({ ok: true, fechado: true, esperado: 90, diferenca: 0 });
    // Primeiro envia a contagem; a action só então busca os totais por forma.
    expect(chamadas.map((c) => c.nome)).toEqual(["fechar_caixa", "resumo_do_fechamento"]);
  });

  it("com diferença mantém a contagem e só então devolve a conferência", async () => {
    resposta = {
      data: {
        ok: false,
        exige_justificativa: true,
        esperado: 100,
        contado: 90,
        diferenca: -10,
        erro: "Há diferença no caixa.",
      },
      error: null,
    };

    const r = await iniciarFechamentoCego({ contado: 90 });

    expect(r).toEqual({ ok: true, fechado: false, esperado: 100, contado: 90, diferenca: -10, resumo: null });
  });

  it("não consulta o servidor quando a contagem cega é inválida", async () => {
    const r = await iniciarFechamentoCego({ contado: -1 });

    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("manda o CONTADO, e nunca o esperado nem a diferenca", async () => {
    await fecharCaixa({ contado: 90 });

    expect(chamadas[0]?.nome).toBe("fechar_caixa");
    expect(enviado()["contado"]).toBe(90);
    // O esperado é do servidor (03 §16.4) e a diferença é derivada dele.
    // Mandar qualquer um dos dois daqui seria deixar a tela opinar sobre
    // quanto deveria haver na gaveta.
    expect(enviado()["esperado"]).toBeUndefined();
    expect(enviado()["diferenca"]).toBeUndefined();
  });

  it("a exigencia de justificativa chega com bandeira propria", async () => {
    resposta = {
      data: {
        ok: false, exige_justificativa: true, esperado: 100, contado: 90, diferenca: -10,
        erro: "Há diferença no caixa. Informe a justificativa para fechar.",
      },
      error: null,
    };

    const r = await fecharCaixa({ contado: 90 });

    expect(r.ok).toBe(false);
    // A tela precisa distinguir "faltou justificativa" de erro genérico para
    // pedir o campo em vez de mandar tentar de novo.
    expect(r.ok === false && r.exigeJustificativa).toBe(true);
  });

  it("com justificativa, ela acompanha o contado", async () => {
    await fecharCaixa({ contado: 90, justificativa: "faltou troco" });

    expect(enviado()).toMatchObject({ contado: 90, justificativa: "faltou troco" });
  });

  it("contado negativo nem chega ao servidor", async () => {
    // O banco tem `cash_sessions_contado`, mas gastar uma ida para descobrir
    // isso seria desperdício — e a mensagem daqui é mais direta.
    const r = await fecharCaixa({ contado: -1 });

    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("falha de rede vira recusa legivel", async () => {
    resposta = { data: null, error: { code: "08006" } };

    const r = await fecharCaixa({ contado: 90 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro.length > 0).toBe(true);
  });

  it("carrega as modalidades somente depois da contagem cega", async () => {
    resposta = {
      data: {
        ok: true, esperado: 90, contado: 90, diferenca: 0,
        sessao_id: "66666666-6666-4666-8666-666666666666",
        status: "closed",
        data_operacional: "2026-09-28",
        aberta_em: "2026-09-28T10:00:00Z",
        fechada_em: "2026-09-28T20:00:00Z",
        fundo_inicial: 50,
        recebimentos_por_metodo: [
          { metodo: "Crédito", familia: "card", total: 120 },
          { metodo: "Pix", familia: "pix", total: 80 },
        ],
        recebido_em_dinheiro: 40,
        reforcos: 0,
        sangrias: 0,
        despesas_pelo_caixa: 0,
        entradas_pelo_caixa: 0,
        estornos: 0,
        esperado_em_dinheiro: 90,
        justificativa: null,
        dinheiro_fora_da_gaveta: 0,
        correcoes: [],
      },
      error: null,
    };

    const r = await iniciarFechamentoCego({ contado: 90 });

    expect(chamadas[1]).toEqual({
      nome: "resumo_do_fechamento",
      args: { p_sessao: "66666666-6666-4666-8666-666666666666" },
    });
    expect(r.ok && r.resumo?.recebimentos_por_metodo).toHaveLength(2);
  });
});
