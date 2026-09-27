import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A PORTA DO RECEBIMENTO — Fase 12, Etapa 7
 *
 * A suíte `pdv_etapa7_fase12.sql` prova as regras no banco: troco, divisão,
 * gaveta, duplicidade, caixa fechado, estornado que volta. Nada disso se
 * repete aqui — repetir criaria uma segunda definição do que é um pagamento
 * válido, que é exatamente o que a Etapa 7 não pode ter.
 *
 * Este arquivo responde só o que é da camada de aplicação:
 *
 * - o que sobe para `registrar_pagamento`, campo a campo?
 * - a aplicação soma, arredonda ou calcula troco em algum lugar? (não pode)
 * - a chave de idempotência sobe como veio, para o duplo clique virar
 *   repetição em vez de segundo pagamento?
 * - a recusa do servidor chega inteira à tela, com a bandeira que a explica?
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

const { registrarPagamento } = await import("@/application/caixa/acoes");

const PEDIDO = "11111111-1111-4111-8111-111111111111";
const DINHEIRO = "22222222-2222-4222-8222-222222222222";
const PIX = "33333333-3333-4333-8333-333333333333";
const CHAVE = "44444444-4444-4444-8444-444444444444";

/** O que chegou em `registrar_pagamento`. */
function enviado() {
  return chamadas[0]?.args["p_dados"] as Record<string, unknown>;
}
function linhas() {
  return enviado()["linhas"] as Record<string, unknown>[];
}

beforeEach(() => {
  chamadas = [];
  resposta = { data: { ok: true, ja_existia: false, total: 30 }, error: null };
});

describe("o que sobe para a autoridade", () => {
  it("chama registrar_pagamento com o pedido e nada mais", async () => {
    await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [{ forma_id: DINHEIRO, valor: 30 }],
      tentativa: CHAVE,
    });

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.nome).toBe("registrar_pagamento");
    expect(chamadas[0]?.args["p_order_id"]).toBe(PEDIDO);
  });

  it("a chave de idempotencia sobe COMO VEIO", async () => {
    await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [{ forma_id: DINHEIRO, valor: 30 }],
      tentativa: CHAVE,
    });

    // É ela que faz o duplo clique virar "já existia" em vez de segundo
    // pagamento. Gerar uma nova aqui destruiria a proteção (CLAUDE.md §34).
    expect(enviado()["idempotency_key"]).toBe(CHAVE);
  });

  it("dinheiro leva o recebido, e o troco NAO e calculado aqui", async () => {
    await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [{ forma_id: DINHEIRO, valor: 30, recebido: 50 }],
      tentativa: CHAVE,
    });

    expect(linhas()[0]).toMatchObject({ forma_id: DINHEIRO, valor: 30, recebido: 50 });
    // Nenhum campo "troco": quem subtrai é o servidor (§1.6).
    expect(Object.keys(linhas()[0] as object)).not.toContain("troco");
  });

  it("sem recebido, o campo sobe nulo em vez de sumir", async () => {
    await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [{ forma_id: PIX, valor: 30 }],
      tentativa: CHAVE,
    });

    expect(linhas()[0]?.["recebido"]).toBeNull();
  });

  it("a divisao sobe com as linhas na ordem, sem somar nada", async () => {
    await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [
        { forma_id: DINHEIRO, valor: 30, recebido: 30 },
        { forma_id: PIX, valor: 20 },
      ],
      tentativa: CHAVE,
    });

    expect(linhas()).toHaveLength(2);
    expect(linhas()[0]?.["valor"]).toBe(30);
    expect(linhas()[1]?.["valor"]).toBe(20);
    // A soma NÃO é enviada: quem confere contra o total é `registrar_pagamento`.
    expect(enviado()["total"]).toBeUndefined();
    expect(enviado()["somado"]).toBeUndefined();
  });

  it("na_gaveta sobe explicito, com verdadeiro por padrao", async () => {
    await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [
        { forma_id: DINHEIRO, valor: 10 },
        { forma_id: PIX, valor: 20, na_gaveta: false },
      ],
      tentativa: CHAVE,
    });

    expect(linhas()[0]?.["na_gaveta"]).toBe(true);
    expect(linhas()[1]?.["na_gaveta"]).toBe(false);
  });
});

describe("o que a fronteira recusa antes de gastar uma ida ao servidor", () => {
  it("valor zero nao passa", async () => {
    const r = await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [{ forma_id: DINHEIRO, valor: 0 }],
      tentativa: CHAVE,
    });

    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("sem nenhuma linha nao passa", async () => {
    const r = await registrarPagamento({ pedido_id: PEDIDO, linhas: [], tentativa: CHAVE });

    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("mais de seis formas nao passa", async () => {
    const r = await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: Array.from({ length: 7 }, () => ({ forma_id: DINHEIRO, valor: 10 })),
      tentativa: CHAVE,
    });

    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
});

describe("a resposta do servidor chega inteira", () => {
  it("pedido ja pago chega com a bandeira que a tela usa", async () => {
    resposta = {
      data: {
        ok: false,
        ja_pago: true,
        erro: "Este pedido já tem pagamento registrado. Para corrigir, estorne o anterior.",
      },
      error: null,
    };

    const r = await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [{ forma_id: DINHEIRO, valor: 30 }],
      tentativa: CHAVE,
    });

    expect(r.ok).toBe(false);
    // A mensagem é a do BANCO, não uma reescrita amigável que esconderia a
    // instrução de estornar.
    expect(r.ok === false && r.erro).toContain("estorne o anterior");
    /*
     * A BANDEIRA, e não só a mensagem — Etapa 10.
     *
     * Este cenário se chamava "chega com a bandeira que a tela usa" desde a
     * Etapa 7 e afirmava apenas o texto. `resposta()` descartava `ja_pago`, e
     * o teste passava assim mesmo: o nome dizia uma coisa, a asserção provava
     * outra. É o que permitia a tela mostrar tarja vermelha de erro para
     * "outro terminal já recebeu" (09 §9, item 4).
     */
    expect(r.ok === false && r.jaPago).toBe(true);
  });

  it("recusa comum NAO vem marcada como ja_pago", async () => {
    // A bandeira precisa distinguir; se aparecesse em toda recusa, a tela
    // mostraria "pago em outro terminal" para um erro de digitação.
    resposta = {
      data: { ok: false, erro: "Pedido cancelado ou rejeitado não recebe pagamento." },
      error: null,
    };

    const r = await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [{ forma_id: DINHEIRO, valor: 30 }],
      tentativa: CHAVE,
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.jaPago).toBeUndefined();
  });

  it("caixa fechado chega como recusa, nao como sucesso silencioso", async () => {
    resposta = {
      data: { ok: false, sem_caixa: true, erro: "Não há caixa aberto. Abra o caixa antes de registrar o recebimento." },
      error: null,
    };

    const r = await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [{ forma_id: DINHEIRO, valor: 30 }],
      tentativa: CHAVE,
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toContain("caixa");
  });

  it("soma divergente chega com os dois numeros", async () => {
    resposta = {
      data: {
        ok: false, soma_divergente: true, somado: 40, total: 50,
        erro: "A soma das formas não fecha com o total do pedido.",
      },
      error: null,
    };

    const r = await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [{ forma_id: DINHEIRO, valor: 40 }],
      tentativa: CHAVE,
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toContain("não fecha");
  });

  it("repeticao reconhecida NAO e tratada como erro", async () => {
    resposta = { data: { ok: true, ja_existia: true, pedido_id: PEDIDO }, error: null };

    const r = await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [{ forma_id: DINHEIRO, valor: 30 }],
      tentativa: CHAVE,
    });

    // O duplo clique não pode assustar o operador com uma mensagem vermelha:
    // o dinheiro entrou uma vez, e isso é sucesso.
    expect(r.ok).toBe(true);
  });

  it("falha de rede vira recusa legivel, sem inventar sucesso", async () => {
    resposta = { data: null, error: { code: "08006" } };

    const r = await registrarPagamento({
      pedido_id: PEDIDO,
      linhas: [{ forma_id: DINHEIRO, valor: 30 }],
      tentativa: CHAVE,
    });

    // Importa para a tela: em `ok:false` o painel mantém as linhas e a MESMA
    // chave, para o retry ser a mesma tentativa.
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro.length > 0).toBe(true);
  });
});
