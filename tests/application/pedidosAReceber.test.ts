import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A PORTA DA FILA DE RECEBIMENTO — Fase 12, Etapa 5
 *
 * A suíte `pdv_etapa5_fase12.sql` prova o critério no banco: `pending` aparece,
 * `reversed` aparece, `confirmed` não, `cancelled` e `rejected` não, e o status
 * operacional não gateia nada. Não há por que repetir isso aqui — repetir
 * criaria uma segunda definição do critério, que é exatamente o defeito que a
 * decisão D-2026-09-26-79 evita.
 *
 * Este arquivo responde só o que é da camada de aplicação:
 *
 *  - ela filtra ou ordena por conta própria? (não pode)
 *  - `reversed` chega à tela como `reversed`? (não pode virar `pending`)
 *  - uma falha distingue "vazio" de "não respondeu"?
 *  - ela manda argumento que a RPC não tem?
 */

type Resposta = { data: unknown; error: unknown };

let chamadas: { nome: string; args: unknown }[];
let resposta: Resposta;

vi.mock("@/infrastructure/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    rpc: async (nome: string, args: unknown) => {
      chamadas.push({ nome, args });
      return resposta;
    },
  }),
}));

const { listarPedidosAReceber } = await import("@/application/pdv/consultas");

/** Uma linha como a RPC devolve. Nada aqui é calculado pela aplicação. */
function linha(over: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    numero: 148,
    origem: "counter",
    modalidade: "pickup",
    cliente_nome: "Maria S.",
    cliente_whatsapp: "(11) 96000-0001",
    total: 54,
    status_operacional: "ready_for_pickup",
    status_financeiro: "pending",
    criado_em: "2026-09-26T12:00:00Z",
    idade_minutos: 12,
    forma_esperada: "Dinheiro",
    bandeira_esperada: null,
    valor_esperado: 54,
    precisa_troco: true,
    troco_para: 100,
    troco_esperado: 46,
    ...over,
  };
}

beforeEach(() => {
  chamadas = [];
  resposta = { data: null, error: null };
});

describe("listarPedidosAReceber: transporta, não decide", () => {
  it("chama a RPC sem nenhum argumento", async () => {
    resposta = { data: [], error: null };
    await listarPedidosAReceber();

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.nome).toBe("pedidos_a_receber");
    // A RPC não tem parâmetro. Mandar um filtro aqui seria criar um critério
    // paralelo ao do banco — o risco que a decisão 79 fecha.
    expect(chamadas[0]?.args).toBeUndefined();
  });

  it("devolve as linhas na ordem em que o banco mandou", async () => {
    const a = linha({ id: "aaaaaaaa-0000-0000-0000-000000000001", numero: 1, idade_minutos: 30 });
    const b = linha({ id: "bbbbbbbb-0000-0000-0000-000000000002", numero: 2, idade_minutos: 2 });
    resposta = { data: [a, b], error: null };

    const { pedidos } = await listarPedidosAReceber();
    // O mais antigo primeiro é ordenação do `order by created_at` da RPC. Se
    // esta camada reordenasse por número, total ou idade, a fila do balcão
    // deixaria de atender primeiro quem espera há mais tempo.
    expect(pedidos.map((p) => p.numero)).toEqual([1, 2]);
  });

  it("não remove nenhuma linha, nem as que parecem estranhas", async () => {
    resposta = {
      data: [
        linha({ id: "aaaaaaaa-0000-0000-0000-000000000001", status_financeiro: "pending" }),
        linha({ id: "bbbbbbbb-0000-0000-0000-000000000002", status_financeiro: "reversed" }),
        // Um status que esta camada não conhece. Ela não é autoridade sobre o
        // vocabulário financeiro: quem decide o que entra na fila é a RPC.
        linha({ id: "cccccccc-0000-0000-0000-000000000003", status_financeiro: "futuro" }),
      ],
      error: null,
    };

    const { pedidos } = await listarPedidosAReceber();
    expect(pedidos).toHaveLength(3);
  });
});

describe("reversed não é pending", () => {
  it("o estornado chega à tela como reversed", async () => {
    resposta = { data: [linha({ status_financeiro: "reversed" })], error: null };

    const { pedidos } = await listarPedidosAReceber();
    // D-2026-09-26-79: "Pendente" e "Estornado" são rótulos diferentes porque
    // são situações diferentes — no segundo, a casa já devolveu o dinheiro e o
    // pedido seguiu vivo. Colapsar os dois esconderia isso do operador.
    expect(pedidos[0]?.status_financeiro).toBe("reversed");
  });

  it("e mantém o status operacional intacto ao lado dele", async () => {
    resposta = {
      data: [linha({ status_financeiro: "reversed", status_operacional: "in_production" })],
      error: null,
    };

    const { pedidos } = await listarPedidosAReceber();
    // Os dois eixos, separados (§0.2): estornado E na produção ao mesmo tempo.
    expect(pedidos[0]?.status_operacional).toBe("in_production");
    expect(pedidos[0]?.status_financeiro).toBe("reversed");
  });
});

describe("origem e modalidade são campos distintos", () => {
  it("counter é origem, pickup é modalidade", async () => {
    resposta = { data: [linha({ origem: "counter", modalidade: "pickup" })], error: null };

    const { pedidos } = await listarPedidosAReceber();
    expect(pedidos[0]?.origem).toBe("counter");
    expect(pedidos[0]?.modalidade).toBe("pickup");
  });

  it("e a modalidade nunca é 'balcao'", async () => {
    resposta = {
      data: [linha({ origem: "counter", modalidade: "pickup" }), linha({ modalidade: "delivery" })],
      error: null,
    };

    const { pedidos } = await listarPedidosAReceber();
    // D-2026-09-26-80: criar `balcao` como modalidade violaria
    // `orders_entrega_com_snapshot` e `orders_retirada_sem_entrega`. Balcão é
    // ORIGEM; a modalidade continua sendo só retirada ou entrega.
    for (const p of pedidos) expect(["pickup", "delivery"]).toContain(p.modalidade);
  });
});

describe("falha não se confunde com fila vazia", () => {
  it("erro devolve lista vazia E a bandeira de falha", async () => {
    resposta = { data: null, error: { code: "42501" } };

    const { pedidos, falhou } = await listarPedidosAReceber();
    // Sem `falhou`, a tela mostraria "nada a receber" justamente quando não
    // sabe — e a casa concluiria que está tudo pago (CLAUDE.md §37).
    expect(pedidos).toEqual([]);
    expect(falhou).toBe(true);
  });

  it("fila realmente vazia não é falha", async () => {
    resposta = { data: [], error: null };

    const { pedidos, falhou } = await listarPedidosAReceber();
    expect(pedidos).toEqual([]);
    expect(falhou).toBe(false);
  });

  it("data nula sem erro também é fila vazia, não estouro", async () => {
    resposta = { data: null, error: null };

    const { pedidos, falhou } = await listarPedidosAReceber();
    expect(pedidos).toEqual([]);
    expect(falhou).toBe(false);
  });
});

describe("a porta não lê caixa", () => {
  it("uma chamada só, e nenhuma delas é de caixa", async () => {
    resposta = { data: [linha()], error: null };
    await listarPedidosAReceber();

    // §4.4: o PDV existe com o caixa fechado. Se esta porta consultasse
    // `caixa_atual` para decidir o que devolver, a fila passaria a depender do
    // caixa — e um pedido com o cliente devendo desapareceria no fechamento.
    expect(chamadas.map((c) => c.nome)).toEqual(["pedidos_a_receber"]);
  });
});
