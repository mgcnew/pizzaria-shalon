import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AS PORTAS DO CÓDIGO DE BARRAS — Fase 12 (PDV), Etapa 3b
 *
 * A suíte SQL `pdv_etapa3_fase12.sql` já prova as regras: unicidade, alvo único,
 * primário, atomicidade, auditoria. Este arquivo responde o que só a camada de
 * aplicação responde:
 *
 * - o formulário manda EXATAMENTE UM ALVO para a RPC?
 * - o código sai daqui como TEXTO, com zeros à esquerda intactos?
 * - a aplicação normaliza código por engano em algum lugar?
 * - o aviso de EAN acompanha o SUCESSO, em vez de virar erro?
 * - a recusa da RPC chega ao operador com a mensagem que o banco escreveu?
 *
 * O PRIMEIRO TESTE DE ALVO NASCEU DE UM DEFEITO REAL: o painel da variante
 * postava `produto_id` (para revalidar a rota) junto de `variante_id`, e a action
 * mandava os dois como alvo — a RPC responderia `alvo_invalido`. A correção foi
 * separar `rota_produto_id` do alvo, e é isto que trava a regressão.
 */

type Resposta = { data: unknown; error: unknown };

let chamadas: { nome: string; args: Record<string, unknown> }[];
let resposta: Resposta;
let rotasRevalidadas: string[];

function reiniciar() {
  chamadas = [];
  rotasRevalidadas = [];
  resposta = { data: { ok: true }, error: null };
}

vi.mock("@/infrastructure/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      return resposta;
    },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (rota: string) => {
    rotasRevalidadas.push(rota);
  },
}));

const {
  alterarCodigoDeBarras,
  cadastrarCodigoDeBarras,
  definirCodigoPrimario,
  removerCodigoDeBarras,
} = await import("@/application/catalogo/codigosDeBarras");
const { lerCodigosDeBarras } = await import("@/application/catalogo/consultas");

/** Monta o FormData como a tela monta. */
function formulario(campos: Record<string, string>): FormData {
  const form = new FormData();
  for (const [nome, valor] of Object.entries(campos)) form.set(nome, valor);
  return form;
}

function dadosEnviados(): Record<string, unknown> {
  return chamadas[0]?.args.p_dados as Record<string, unknown>;
}

beforeEach(reiniciar);

describe("alvo enviado à RPC", () => {
  it("no painel do produto, manda produto e NÃO variante", async () => {
    resposta = { data: { ok: true, id: "x" }, error: null };
    await cadastrarCodigoDeBarras({}, formulario({
      codigo: "7891234567895",
      rota_produto_id: "prod-1",
      produto_id: "prod-1",
    }));

    expect(dadosEnviados().produto_id).toBe("prod-1");
    expect(dadosEnviados().variante_id).toBeNull();
  });

  // A REGRESSÃO. O painel da variante posta os dois campos, porque precisa do id
  // do produto para revalidar a rota. Só a variante pode chegar como alvo.
  it("no painel da variante, manda variante e NÃO produto", async () => {
    resposta = { data: { ok: true, id: "x" }, error: null };
    await cadastrarCodigoDeBarras({}, formulario({
      codigo: "7891234567895",
      rota_produto_id: "prod-1",
      variante_id: "var-9",
    }));

    expect(dadosEnviados().variante_id).toBe("var-9");
    expect(dadosEnviados().produto_id).toBeNull();
  });

  // Se a tela mandar os dois por descuido, a variante ganha — nunca os dois
  // juntos, que é o que a RPC recusa.
  it("nunca manda os dois alvos, mesmo recebendo os dois", async () => {
    resposta = { data: { ok: true, id: "x" }, error: null };
    await cadastrarCodigoDeBarras({}, formulario({
      codigo: "7891234567895",
      rota_produto_id: "prod-1",
      produto_id: "prod-1",
      variante_id: "var-9",
    }));

    const dados = dadosEnviados();
    const alvos = [dados.produto_id, dados.variante_id].filter((v) => v !== null);
    expect(alvos).toHaveLength(1);
    expect(dados.variante_id).toBe("var-9");
  });

  it("alterar NÃO manda alvo nenhum: código não muda de item", async () => {
    resposta = { data: { ok: true }, error: null };
    await alterarCodigoDeBarras({}, formulario({
      id: "cod-1",
      codigo: "H1001",
      rota_produto_id: "prod-1",
      produto_id: "prod-1",
      variante_id: "var-9",
    }));

    const dados = dadosEnviados();
    expect(dados).not.toHaveProperty("produto_id");
    expect(dados).not.toHaveProperty("variante_id");
  });
});

describe("o código é tratado como texto", () => {
  // Se algum ponto do caminho tratasse isto como número, os zeros morreriam e o
  // código passaria a ser outro.
  it("preserva zeros à esquerda", async () => {
    resposta = { data: { ok: true, id: "x" }, error: null };
    await cadastrarCodigoDeBarras({}, formulario({
      codigo: "0012345678905",
      rota_produto_id: "p",
      produto_id: "p",
    }));

    expect(dadosEnviados().codigo).toBe("0012345678905");
    expect(typeof dadosEnviados().codigo).toBe("string");
  });

  // A aplicação NÃO normaliza: quem decide identidade é a coluna gerada do
  // banco (Etapa 2). O que sai daqui é o que a pessoa digitou, só sem as bordas.
  it("não normaliza: manda o digitado, sem virar maiúscula nem tirar pontuação", async () => {
    resposta = { data: { ok: true, id: "x" }, error: null };
    await cadastrarCodigoDeBarras({}, formulario({
      codigo: "  ab 12.3-x  ",
      rota_produto_id: "p",
      produto_id: "p",
    }));

    expect(dadosEnviados().codigo).toBe("ab 12.3-x");
  });

  it("código vazio nem chega à RPC", async () => {
    const estado = await cadastrarCodigoDeBarras({}, formulario({
      codigo: "   ",
      rota_produto_id: "p",
      produto_id: "p",
    }));

    expect(estado.erro).toBe("Informe o código de barras.");
    expect(chamadas).toHaveLength(0);
  });

  it("alterar sem id nem chega à RPC", async () => {
    const estado = await alterarCodigoDeBarras({}, formulario({ codigo: "X100" }));
    expect(estado.erro).toBeTruthy();
    expect(chamadas).toHaveLength(0);
  });
});

describe("aviso de EAN", () => {
  // O CRUX DA DECISÃO: o código foi salvo. O aviso acompanha o sucesso.
  it("vem junto do sucesso, nunca como erro", async () => {
    resposta = {
      data: {
        ok: true,
        id: "x",
        aviso_ean: "Este código tem 13 dígitos e parece um EAN, mas o dígito verificador não fecha.",
      },
      error: null,
    };
    const estado = await cadastrarCodigoDeBarras({}, formulario({
      codigo: "7891234567890",
      rota_produto_id: "p",
      produto_id: "p",
    }));

    expect(estado.erro).toBeUndefined();
    expect(estado.ok).toContain("Código cadastrado");
    expect(estado.ok).toContain("dígito verificador não fecha");
  });

  it("EAN correto não acrescenta nada à mensagem", async () => {
    resposta = { data: { ok: true, id: "x", aviso_ean: null }, error: null };
    const estado = await cadastrarCodigoDeBarras({}, formulario({
      codigo: "7891234567895",
      rota_produto_id: "p",
      produto_id: "p",
    }));

    expect(estado.ok).toBe("Código cadastrado.");
  });

  it("código interno não-EAN também não acrescenta nada", async () => {
    resposta = { data: { ok: true, id: "x", aviso_ean: null }, error: null };
    const estado = await cadastrarCodigoDeBarras({}, formulario({
      codigo: "SHALON-01",
      rota_produto_id: "p",
      produto_id: "p",
    }));

    expect(estado.ok).toBe("Código cadastrado.");
    expect(estado.erro).toBeUndefined();
  });
});

describe("recusas da RPC chegam ao operador", () => {
  // A mensagem do banco nomeia o item dono do código. Trocá-la por uma genérica
  // aqui tiraria justamente a informação que resolve o problema.
  it("duplicidade preserva a mensagem que nomeia o item", async () => {
    resposta = {
      data: {
        ok: false,
        bloqueio: "codigo_duplicado",
        erro: "Este código já está cadastrado no produto Coca 2L. Um código resolve para um único item.",
      },
      error: null,
    };
    const estado = await cadastrarCodigoDeBarras({}, formulario({
      codigo: "7891234567895",
      rota_produto_id: "p",
      produto_id: "p",
    }));

    expect(estado.ok).toBeUndefined();
    expect(estado.erro).toContain("Coca 2L");
  });

  it("falta de permissão vira mensagem de permissão", async () => {
    resposta = {
      data: { ok: false, bloqueio: "sem_permissao", erro: "Você não tem permissão para gerenciar o catálogo." },
      error: null,
    };
    const estado = await cadastrarCodigoDeBarras({}, formulario({
      codigo: "X100", rota_produto_id: "p", produto_id: "p",
    }));
    expect(estado.erro).toContain("permissão");
  });

  // 42501 é a própria RPC recusando execução, antes de qualquer corpo rodar.
  it("42501 do Postgres vira mensagem de permissão, sem vazar código de erro", async () => {
    resposta = { data: null, error: { code: "42501", message: "permission denied" } };
    const estado = await cadastrarCodigoDeBarras({}, formulario({
      codigo: "X100", rota_produto_id: "p", produto_id: "p",
    }));

    expect(estado.erro).toBe("Você não tem permissão para gerenciar o catálogo.");
    expect(estado.erro).not.toContain("42501");
  });

  it("erro inesperado não vaza detalhe interno", async () => {
    resposta = { data: null, error: { code: "XX000", message: "internal boom at line 42" } };
    const estado = await cadastrarCodigoDeBarras({}, formulario({
      codigo: "X100", rota_produto_id: "p", produto_id: "p",
    }));

    expect(estado.erro).not.toContain("boom");
    expect(estado.erro).not.toContain("XX000");
    expect(estado.erro).toBeTruthy();
  });

  it("recusa não revalida a rota", async () => {
    resposta = { data: { ok: false, erro: "recusado" }, error: null };
    await cadastrarCodigoDeBarras({}, formulario({
      codigo: "X100", rota_produto_id: "prod-1", produto_id: "prod-1",
    }));
    expect(rotasRevalidadas).toHaveLength(0);
  });

  it("sucesso revalida a rota do produto, inclusive vindo da variante", async () => {
    resposta = { data: { ok: true, id: "x" }, error: null };
    await cadastrarCodigoDeBarras({}, formulario({
      codigo: "X100", rota_produto_id: "prod-1", variante_id: "var-9",
    }));
    expect(rotasRevalidadas).toContain("/admin/produtos/prod-1");
  });
});

describe("troca do primário", () => {
  // A tela oferece um clique. Não existe passo de "apague o anterior primeiro".
  it("manda só o id: quem rebaixa o anterior é a RPC", async () => {
    resposta = { data: { ok: true, ja_primario: false, primarios_demovidos: 1 }, error: null };
    const estado = await definirCodigoPrimario({}, formulario({
      id: "cod-2", rota_produto_id: "prod-1",
    }));

    expect(chamadas[0]?.nome).toBe("definir_codigo_primario");
    expect(chamadas[0]?.args).toEqual({ p_id: "cod-2" });
    expect(estado.ok).toBe("Código principal atualizado.");
  });

  it("já era o principal: diz isso, sem parecer erro", async () => {
    resposta = { data: { ok: true, ja_primario: true, primarios_demovidos: 0 }, error: null };
    const estado = await definirCodigoPrimario({}, formulario({ id: "cod-2" }));

    expect(estado.erro).toBeUndefined();
    expect(estado.ok).toBe("Este código já era o principal.");
  });

  it("cadastrar como principal avisa que assumiu o posto", async () => {
    resposta = { data: { ok: true, id: "x", primarios_demovidos: 1 }, error: null };
    const estado = await cadastrarCodigoDeBarras({}, formulario({
      codigo: "X100", rota_produto_id: "p", produto_id: "p", primario: "on",
    }));

    expect(dadosEnviados().primario).toBe(true);
    expect(estado.ok).toContain("principal");
  });

  it("sem marcar a caixa, primario vai false", async () => {
    resposta = { data: { ok: true, id: "x" }, error: null };
    await cadastrarCodigoDeBarras({}, formulario({
      codigo: "X100", rota_produto_id: "p", produto_id: "p",
    }));
    expect(dadosEnviados().primario).toBe(false);
  });

  it("recusa por corrida chega legível", async () => {
    resposta = {
      data: {
        ok: false, bloqueio: "primario_concorrente",
        erro: "Outra pessoa marcou o código primário deste item agora mesmo. Recarregue e tente de novo.",
      },
      error: null,
    };
    const estado = await definirCodigoPrimario({}, formulario({ id: "cod-2" }));
    expect(estado.erro).toContain("Recarregue");
  });
});

describe("remoção", () => {
  it("manda id e motivo, e revalida", async () => {
    resposta = { data: { ok: true, ja_removido: false }, error: null };
    await removerCodigoDeBarras(formulario({
      id: "cod-3", rota_produto_id: "prod-1", motivo: "saiu de linha",
    }));

    expect(chamadas[0]?.nome).toBe("remover_codigo_de_barras");
    expect(chamadas[0]?.args).toEqual({ p_id: "cod-3", p_motivo: "saiu de linha" });
    expect(rotasRevalidadas).toContain("/admin/produtos/prod-1");
  });

  it("sem motivo manda null, não string vazia", async () => {
    resposta = { data: { ok: true }, error: null };
    await removerCodigoDeBarras(formulario({ id: "cod-3", rota_produto_id: "p" }));
    expect(chamadas[0]?.args).toEqual({ p_id: "cod-3", p_motivo: null });
  });

  // O botão da lista não tem onde exibir erro; o que ele não pode é derrubar a
  // tela. O erro fica no log do servidor (§37).
  it("erro da RPC não lança nem quebra a tela", async () => {
    resposta = { data: null, error: { code: "42501" } };
    await expect(
      removerCodigoDeBarras(formulario({ id: "cod-3", rota_produto_id: "p" })),
    ).resolves.toBeUndefined();
  });
});

describe("leitura", () => {
  it("repassa os códigos como vieram do banco", async () => {
    const linhas = [
      {
        id: "1", codigo: "0012345678905", codigo_normalizado: "0012345678905",
        primario: true, ean_valido: true, aviso_ean: null, criado_em: "2026-09-26T00:00:00Z",
      },
    ];
    resposta = { data: linhas, error: null };
    const lidos = await lerCodigosDeBarras({ produtoId: "p" });

    expect(lidos).toEqual(linhas);
    // Os zeros chegam à tela intactos.
    expect(lidos[0]?.codigo_normalizado).toBe("0012345678905");
  });

  it("manda exatamente um alvo", async () => {
    resposta = { data: [], error: null };
    await lerCodigosDeBarras({ varianteId: "var-9" });
    expect(chamadas[0]?.args).toEqual({ p_produto_id: null, p_variante_id: "var-9" });
  });

  // Quem não tem `catalog.view` recebe lista vazia pela policy; um erro de rede
  // não pode virar tela quebrada.
  it("em caso de erro devolve lista vazia, não lança", async () => {
    resposta = { data: null, error: { code: "42501" } };
    await expect(lerCodigosDeBarras({ produtoId: "p" })).resolves.toEqual([]);
  });
});
