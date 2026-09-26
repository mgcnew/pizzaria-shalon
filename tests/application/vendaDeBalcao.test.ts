import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A VENDA DE BALCÃO PELA PORTA EXISTENTE — Fase 12, Etapa 6
 *
 * A suíte `pdv_etapa6_fase12.sql` prova as regras no banco: as quatro condições
 * do ramo anônimo, o preço do servidor, o caixa fechado, a idempotência. Este
 * arquivo responde o que só a camada de aplicação responde:
 *
 * - a venda de balcão passa pela MESMA porta de `/admin/pedidos/novo`, ou
 *   alguém criou um segundo caminho de criação?
 * - o que sobe quando não há cliente: objeto vazio, ou um cliente inventado?
 * - cliente PELA METADE continua sendo recusado antes mesmo do servidor?
 * - a venda vai como `counter` + `pickup`, sem endereço e sem troco?
 * - alguma coisa aqui chama `registrar_pagamento`?
 *
 * O QUE ESTE ARQUIVO NÃO TESTA: se um pedido sem cliente PODE existir. Isso é
 * decisão de `criar_pedido`, e duplicá-la aqui criaria a segunda autoridade que
 * a decisão D-2026-09-26-81 evitou.
 */

type Resposta = { data: unknown; error: unknown };

let chamadas: { nome: string; args: Record<string, unknown> }[];
let resposta: Resposta;

function reiniciar() {
  chamadas = [];
  resposta = {
    data: { ok: true, pedido_id: "11111111-1111-1111-1111-111111111111",
            numero: 150, status: "confirmed", total: 31 },
    error: null,
  };
}

vi.mock("@/infrastructure/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      return resposta;
    },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { criarPedidoManual } = await import("@/application/pedidos/acoes");

/** A venda como o PDV a manda: balcão, retirada, sem bloco `cliente`. */
function venda(extra: Record<string, unknown> = {}) {
  return {
    idempotency_key: "00000000-0000-4000-8000-000000000001",
    origem: "counter",
    modalidade: "pickup",
    endereco: null,
    itens: [
      {
        linha: "linha-1",
        produto_id: "22222222-2222-4222-8222-222222222222",
        variacao_id: null,
        sabores: [],
        borda_id: null,
        adicionais: [],
        observacao: "",
        quantidade: 1,
      },
    ],
    pagamento: {
      forma_id: "33333333-3333-4333-8333-333333333333",
      bandeira_id: null,
      precisa_troco: false,
      troco_para: null,
    },
    ...extra,
  };
}

/** O payload que chegou em `criar_pedido`. */
function payload() {
  return chamadas[0]?.args["p_pedido"] as Record<string, unknown>;
}

beforeEach(reiniciar);

describe("a venda de balcão usa a autoridade que já existe", () => {
  it("chama criar_pedido, e só ela", async () => {
    const r = await criarPedidoManual(venda());

    expect(r.ok).toBe(true);
    expect(chamadas.map((c) => c.nome)).toEqual(["criar_pedido"]);
  });

  it("nao chama registrar_pagamento em momento nenhum", async () => {
    await criarPedidoManual(venda());
    // Salvar não é receber (§1.2). Se um dia isto falhar, a venda passou a
    // criar dinheiro junto com o pedido — e aí há duas autoridades.
    expect(chamadas.some((c) => c.nome === "registrar_pagamento")).toBe(false);
  });

  it("manda origem counter e modalidade pickup", async () => {
    await criarPedidoManual(venda());

    expect(payload()["origem"]).toBe("counter");
    expect(payload()["modalidade"]).toBe("pickup");
  });

  it("sem endereço e sem rota: retirada não mede distância", async () => {
    await criarPedidoManual(venda());

    expect(payload()["endereco"]).toBeNull();
    expect(payload()["rota"]).toBeNull();
  });
});

describe("o cliente ausente", () => {
  it("sobe como objeto VAZIO, não como cliente inventado", async () => {
    await criarPedidoManual(venda());

    // `criar_pedido` lê `p_pedido -> 'cliente' ->> 'nome'`. Um `null` aqui
    // funcionaria por acidente; `{}` é o que a suíte SQL exercita.
    expect(payload()["cliente"]).toEqual({});
  });

  it("e NENHUM telefone é fabricado no caminho", async () => {
    await criarPedidoManual(venda());

    const bruto = JSON.stringify(payload()["cliente"]);
    // A razão da decisão 81: WhatsApp é índice único, e um número sintético
    // colaria vendas de balcão em cima de clientes.
    expect(bruto).not.toMatch(/\d{8,}/);
  });
});

describe("cliente pela metade continua recusado", () => {
  it("nome sem whatsapp nem chega ao servidor", async () => {
    const r = await criarPedidoManual(venda({ cliente: { nome: "Fulano" } }));

    expect(r.ok).toBe(false);
    // Recusado na fronteira, por FORMA: informar um cliente incompleto é erro
    // de digitação, não uma venda anônima.
    expect(chamadas).toHaveLength(0);
  });

  it("whatsapp sem nome tambem nao", async () => {
    const r = await criarPedidoManual(venda({ cliente: { whatsapp: "(11) 96000-0001" } }));

    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("mas cliente COMPLETO passa e chega inteiro", async () => {
    const r = await criarPedidoManual(
      venda({ cliente: { nome: "Cliente", whatsapp: "(11) 96000-0001" } }),
    );

    expect(r.ok).toBe(true);
    expect(payload()["cliente"]).toEqual({ nome: "Cliente", whatsapp: "(11) 96000-0001" });
  });
});

describe("o que o servidor responde é o que vale", () => {
  it("o numero e o total vem da resposta, nao da tela", async () => {
    resposta = {
      data: { ok: true, pedido_id: "11111111-1111-1111-1111-111111111111",
              numero: 777, status: "confirmed", total: 99.9 },
      error: null,
    };

    const r = await criarPedidoManual(venda());
    // A tela soma para conferência; quem diz quanto custou é este número.
    expect(r.ok && r.numero).toBe(777);
    expect(r.ok && r.total).toBe(99.9);
  });

  it("recusa do banco chega com a mensagem do banco", async () => {
    resposta = { data: { ok: false, erro: "Informe seu nome." }, error: null };

    const r = await criarPedidoManual(venda());
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toBe("Informe seu nome.");
  });

  it("falha de rede vira recusa legivel, e nao derruba o balcao", async () => {
    resposta = { data: null, error: { code: "08006" } };

    const r = await criarPedidoManual(venda());
    expect(r.ok).toBe(false);
    // Importa para o carrinho: a tela preserva os itens quando `ok` é falso.
    expect(r.ok === false && r.erro.length > 0).toBe(true);
  });
});

describe("a mesma tentativa não vira dois pedidos", () => {
  it("a chave de idempotencia sobe como veio", async () => {
    await criarPedidoManual(venda());

    expect(payload()["idempotency_key"]).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("e o troco nao entra numa venda que nao recebe", async () => {
    await criarPedidoManual(venda());

    const pagamento = payload()["pagamento"] as Record<string, unknown>;
    expect(pagamento["precisa_troco"]).toBe(false);
    expect(pagamento["troco_para"]).toBeNull();
  });
});
