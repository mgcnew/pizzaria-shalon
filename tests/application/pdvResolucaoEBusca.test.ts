import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AS PORTAS DA RESOLUÇÃO E DA BUSCA DO PDV — Fase 12, Etapa 4
 *
 * A suíte `pdv_etapa4_fase12.sql` prova as regras no banco: alvo, escolha de
 * variante, inativos, normalização, permissões. Este arquivo responde o que só
 * a camada de aplicação responde:
 *
 * - o código sobe para o banco COMO VEIO, sem normalização no caminho?
 * - o `precisa_escolher_variante` chega à tela sem ninguém escolher por ela?
 * - uma falha de rede derruba o balcão, ou vira recusa legível?
 * - termo vazio gasta uma ida ao servidor?
 */

type Resposta = { data: unknown; error: unknown };

let chamadas: { nome: string; args: Record<string, unknown> }[];
let resposta: Resposta;

function reiniciar() {
  chamadas = [];
  resposta = { data: null, error: null };
}

vi.mock("@/infrastructure/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      return resposta;
    },
  }),
}));

const { resolverCodigoDeBarras, buscarCatalogoPdv } = await import(
  "@/application/pdv/consultas"
);

beforeEach(reiniciar);

describe("resolverCodigoDeBarras: o que sobe para o banco", () => {
  // A NORMALIZAÇÃO É DO BANCO. Se esta camada aparasse, baixasse a caixa ou
  // tirasse pontuação, o bipe deixaria de casar com o que está gravado — e o
  // erro apareceria como "código não cadastrado".
  it("manda o codigo exatamente como veio", async () => {
    resposta = { data: { ok: true, encontrado: false, codigo_normalizado: "AB12" }, error: null };
    await resolverCodigoDeBarras("  ab 12.  ");

    expect(chamadas[0]?.nome).toBe("resolver_codigo_de_barras");
    expect(chamadas[0]?.args).toEqual({ p_codigo: "  ab 12.  " });
  });

  it("preserva zeros a esquerda no caminho", async () => {
    resposta = { data: { ok: true, encontrado: false, codigo_normalizado: "0012345678905" }, error: null };
    await resolverCodigoDeBarras("0012345678905");

    expect(chamadas[0]?.args.p_codigo).toBe("0012345678905");
    expect(typeof chamadas[0]?.args.p_codigo).toBe("string");
  });

  it("nao chama nada alem da RPC de resolucao", async () => {
    resposta = { data: { ok: true, encontrado: false, codigo_normalizado: "X" }, error: null };
    await resolverCodigoDeBarras("X");
    expect(chamadas).toHaveLength(1);
  });
});

describe("resolverCodigoDeBarras: os cinco resultados", () => {
  it("nao encontrado sobe como nao encontrado, sem inventar item", async () => {
    resposta = {
      data: { ok: true, encontrado: false, codigo_normalizado: "NAOEXISTE" },
      error: null,
    };
    const r = await resolverCodigoDeBarras("naoexiste");

    expect(r).toEqual({ ok: true, encontrado: false, codigo_normalizado: "NAOEXISTE" });
    // Nenhum campo de item aparece do nada.
    expect(r).not.toHaveProperty("produto_id");
    expect(r).not.toHaveProperty("variante_id");
    expect(r).not.toHaveProperty("preco");
  });

  it("variante sobe resolvida, com preco efetivo", async () => {
    const payload = {
      ok: true, encontrado: true, alvo: "variante",
      precisa_escolher_variante: false,
      codigo: "96385074", codigo_normalizado: "96385074",
      variante_id: "var-1", produto_id: "prod-1",
      produto_nome: "Calabresa", produto_slug: "calabresa", tipo: "pizza",
      tamanho_id: "tam-2", tamanho_nome: "Grande", fatias: 8, max_sabores: 2,
      preco: 49.9, preco_de: 60, em_promocao: true, ativo: true, disponivel: true,
    };
    resposta = { data: payload, error: null };
    const r = await resolverCodigoDeBarras("96385074");

    expect(r).toEqual(payload);
    if (r.ok && r.encontrado && r.alvo === "variante") {
      expect(r.variante_id).toBe("var-1");
      expect(r.preco).toBe(49.9);
      expect(r.precisa_escolher_variante).toBe(false);
    } else {
      throw new Error("esperava uma variante resolvida");
    }
  });

  it("produto simples sobe resolvido", async () => {
    resposta = {
      data: {
        ok: true, encontrado: true, alvo: "produto",
        precisa_escolher_variante: false,
        codigo: "7891234567895", codigo_normalizado: "7891234567895",
        produto_id: "prod-9", produto_nome: "Coca 2L", produto_slug: "coca-2l",
        tipo: "drink", preco: 12, preco_de: 12, em_promocao: false,
        ativo: true, disponivel: true,
      },
      error: null,
    };
    const r = await resolverCodigoDeBarras("7891234567895");

    if (r.ok && r.encontrado && r.alvo === "produto" && !r.precisa_escolher_variante) {
      expect(r.produto_id).toBe("prod-9");
      expect(r.preco).toBe(12);
    } else {
      throw new Error("esperava um produto simples resolvido");
    }
  });

  // O CASO QUE NAO PODE ESCOLHER NADA.
  it("precisa escolher variante sobe SEM tamanho escolhido", async () => {
    resposta = {
      data: {
        ok: true, encontrado: true, alvo: "produto",
        precisa_escolher_variante: true,
        codigo: "PIZZA-CAL", codigo_normalizado: "PIZZA-CAL",
        produto_id: "prod-1", produto_nome: "Calabresa", produto_slug: "calabresa",
        tipo: "pizza", ativo: true, disponivel: true,
        variantes: [
          { id: "var-1", tamanho_id: "t1", tamanho_nome: "Broto", fatias: 4,
            max_sabores: 1, preco: 35, preco_de: 35, em_promocao: false, disponivel: true },
          { id: "var-2", tamanho_id: "t2", tamanho_nome: "Grande", fatias: 8,
            max_sabores: 2, preco: 49.9, preco_de: 60, em_promocao: true, disponivel: true },
        ],
      },
      error: null,
    };
    const r = await resolverCodigoDeBarras("PIZZA-CAL");

    expect(r).not.toHaveProperty("variante_id");
    expect(r).not.toHaveProperty("tamanho_id");
    expect(r).not.toHaveProperty("preco");

    if (r.ok && r.encontrado && r.alvo === "produto" && r.precisa_escolher_variante) {
      expect(r.variantes).toHaveLength(2);
      expect(r.variantes[0]?.id).toBe("var-1");
      expect(r.variantes[1]?.preco).toBe(49.9);
    } else {
      throw new Error("esperava o caso que exige escolha");
    }
  });

  it("item inativo sobe com as bandeiras, e nao escondido", async () => {
    resposta = {
      data: {
        ok: true, encontrado: true, alvo: "produto",
        precisa_escolher_variante: false,
        codigo: "DESCONT", codigo_normalizado: "DESCONT",
        produto_id: "prod-x", produto_nome: "Suco", produto_slug: "suco",
        tipo: "drink", preco: 9, preco_de: 9, em_promocao: false,
        ativo: false, disponivel: false,
      },
      error: null,
    };
    const r = await resolverCodigoDeBarras("DESCONT");

    if (r.ok && r.encontrado) {
      expect(r.encontrado).toBe(true);
      expect(r.ativo).toBe(false);
      expect(r.disponivel).toBe(false);
    } else {
      throw new Error("item inativo deveria ter sido encontrado");
    }
  });

  it("recusa por permissao sobe como recusa", async () => {
    resposta = {
      data: { ok: false, bloqueio: "sem_permissao", erro: "Você não tem permissão para consultar o catálogo." },
      error: null,
    };
    const r = await resolverCodigoDeBarras("X100");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.bloqueio).toBe("sem_permissao");
  });
});

describe("resolverCodigoDeBarras: falha nao derruba o balcao", () => {
  it("erro da RPC vira recusa legivel, nao excecao", async () => {
    resposta = { data: null, error: { code: "42501" } };
    await expect(resolverCodigoDeBarras("X100")).resolves.toMatchObject({ ok: false });
  });

  it("e nao vaza codigo de erro do Postgres", async () => {
    resposta = { data: null, error: { code: "XX000", message: "internal boom" } };
    const r = await resolverCodigoDeBarras("X100");

    if (!r.ok) {
      expect(r.erro).not.toContain("XX000");
      expect(r.erro).not.toContain("boom");
      expect(r.erro).toBeTruthy();
    } else {
      throw new Error("esperava recusa");
    }
  });

  it("resposta vazia tambem vira recusa, nao item fantasma", async () => {
    resposta = { data: null, error: null };
    const r = await resolverCodigoDeBarras("X100");
    expect(r.ok).toBe(false);
  });
});

describe("buscarCatalogoPdv", () => {
  it("manda o termo como veio", async () => {
    resposta = { data: [], error: null };
    await buscarCatalogoPdv("limão");

    expect(chamadas[0]?.nome).toBe("buscar_catalogo_pdv");
    expect(chamadas[0]?.args).toEqual({ p_termo: "limão" });
  });

  // O campo do PDV comeca vazio e em foco (§2.1). Consultar o servidor a cada
  // tela aberta seria desperdicio, e a RPC devolveria zero linhas de qualquer
  // forma.
  it("termo vazio nem vai ao servidor", async () => {
    const r = await buscarCatalogoPdv("   ");
    expect(r).toEqual([]);
    expect(chamadas).toHaveLength(0);
  });

  it("repassa as linhas como vieram, com variantes e bandeiras", async () => {
    const linhas = [
      {
        id: "prod-1", nome: "Calabresa", slug: "calabresa", tipo: "pizza",
        descricao: null, categoria_nome: "Pizzas",
        preco_de: 35, preco: 35, em_promocao: false,
        ativo: true, disponivel: true, tem_variante_ativa: true,
        variantes: [
          { id: "var-1", tamanho_id: "t1", tamanho_nome: "Broto", fatias: 4,
            max_sabores: 1, preco: 35, preco_de: 35, em_promocao: false, disponivel: true },
        ],
        codigo_primario: "PIZZA-CAL", casou_codigo: true,
      },
    ];
    resposta = { data: linhas, error: null };
    const r = await buscarCatalogoPdv("calabresa");

    expect(r).toEqual(linhas);
    expect(r[0]?.variantes[0]?.id).toBe("var-1");
    expect(r[0]?.casou_codigo).toBe(true);
  });

  it("item inativo chega com a bandeira, nao filtrado", async () => {
    resposta = {
      data: [{
        id: "prod-x", nome: "Suco", slug: "suco", tipo: "drink", descricao: null,
        categoria_nome: "Bebidas", preco_de: 9, preco: 9, em_promocao: false,
        ativo: false, disponivel: false, tem_variante_ativa: false,
        variantes: [], codigo_primario: null, casou_codigo: false,
      }],
      error: null,
    };
    const r = await buscarCatalogoPdv("suco");

    expect(r).toHaveLength(1);
    expect(r[0]?.ativo).toBe(false);
  });

  // Sem `catalog.view` a RPC devolve conjunto vazio pela propria funcao; um erro
  // de rede nao pode virar tela quebrada.
  it("erro devolve lista vazia, nao lanca", async () => {
    resposta = { data: null, error: { code: "42501" } };
    await expect(buscarCatalogoPdv("calabresa")).resolves.toEqual([]);
  });

  it("resposta nula devolve lista vazia", async () => {
    resposta = { data: null, error: null };
    await expect(buscarCatalogoPdv("calabresa")).resolves.toEqual([]);
  });
});
