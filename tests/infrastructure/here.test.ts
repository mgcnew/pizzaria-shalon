import { afterEach, describe, expect, it, vi } from "vitest";
import { provedorHere } from "@/infrastructure/rotas/here";

/**
 * Testes do provedor HERE.
 *
 * O QUE ESTE ARQUIVO PROTEGE: o parsing da resposta e o mapeamento de
 * confiança. É a parte que decide se o frete vai ser cobrado, e com que
 * coordenada — e era justamente a parte que o provedor anterior nunca teve
 * coberta.
 *
 * `fetch` é substituído por dublê. Nenhum teste toca a rede, e nenhuma chave
 * real aparece aqui: a credencial usada é a string "chave-de-teste".
 */

const CHAVE = "chave-de-teste";

const ENDERECO = {
  logradouro: "Rua das Flores",
  numero: "123",
  bairro: "Centro",
  cidade: "São Paulo",
  uf: "SP",
  cep: "01000-000",
};

const ORIGEM = { latitude: -23.5, longitude: -46.6 };
const DESTINO = { latitude: -23.51, longitude: -46.61 };

/** Resposta HTTP de mentira, com o corpo JSON que o teste quiser. */
function respostaJson(corpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as unknown as Response;
}

/** Item de geocodificação com o tipo de resultado que o teste quiser. */
function item(resultType: string, houseNumberType?: string) {
  return {
    resultType,
    ...(houseNumberType ? { houseNumberType } : {}),
    position: { lat: -23.51, lng: -46.61 },
    address: { label: "Rua das Flores, 123, São Paulo - SP, Brasil" },
  };
}

function mockarFetch(resposta: Response | Error) {
  // Os parâmetros são declarados para que `mock.calls` seja tipado e o teste
  // possa inspecionar a URL montada.
  const espia = vi.fn(async (_url?: unknown, _init?: unknown) => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  });
  vi.stubGlobal("fetch", espia);
  return espia;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- credencial

describe("HERE: a chave nunca escapa", () => {
  it("a chave vai na consulta, mas o erro devolvido não a menciona", async () => {
    const espia = mockarFetch(respostaJson({}, 401));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);

    // Ela é enviada — é assim que o HERE autentica.
    expect(String(espia.mock.calls[0]?.[0])).toContain("apiKey=");
    // Mas não volta em lugar nenhum da resposta ao chamador.
    expect(JSON.stringify(r)).not.toContain(CHAVE);
  });

  it("401 e 403 são problema de configuração, não do cliente", async () => {
    for (const status of [401, 403]) {
      mockarFetch(respostaJson({}, status));
      const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("configuracao");
      vi.unstubAllGlobals();
    }
  });

  it("outro status de erro é indisponibilidade momentânea", async () => {
    mockarFetch(respostaJson({}, 503));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("indisponivel");
  });
});

// ------------------------------------------------------------ geocodificação

describe("HERE: mapeamento de confiança (D-2026-09-24-75)", () => {
  it("número de casa localizado (PA) é EXATA", async () => {
    mockarFetch(respostaJson({ items: [item("houseNumber", "PA")] }));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.confianca).toBe("exata");
      expect(r.coordenada).toEqual({ latitude: -23.51, longitude: -46.61 });
      expect(r.provedor).toBe("here");
    }
  });

  it("número interpolado é APROXIMADA", async () => {
    mockarFetch(respostaJson({ items: [item("houseNumber", "interpolated")] }));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.confianca).toBe("aproximada");
  });

  it("REJEITA `street`: centro de rua não serve para cobrar frete", async () => {
    mockarFetch(respostaJson({ items: [item("street")] }));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("ambiguo");
  });

  it("REJEITA `locality`", async () => {
    mockarFetch(respostaJson({ items: [item("locality")] }));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("ambiguo");
  });

  it("REJEITA `administrativeArea`", async () => {
    mockarFetch(respostaJson({ items: [item("administrativeArea")] }));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("ambiguo");
  });

  it("REJEITA número de casa sem o tipo: não se afirma o que não se sabe", async () => {
    mockarFetch(respostaJson({ items: [item("houseNumber")] }));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("ambiguo");
  });

  it("REJEITA quando há mais de um resultado, mesmo sendo os dois exatos", async () => {
    mockarFetch(
      respostaJson({ items: [item("houseNumber", "PA"), item("houseNumber", "PA")] }),
    );
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("ambiguo");
  });
});

describe("HERE: geocodificação sem resultado", () => {
  it("lista vazia é endereço não encontrado", async () => {
    mockarFetch(respostaJson({ items: [] }));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("nao_encontrado");
  });

  it("resultado sem coordenada é não encontrado, não sucesso", async () => {
    mockarFetch(respostaJson({ items: [{ resultType: "houseNumber", houseNumberType: "PA" }] }));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("nao_encontrado");
  });

  it("corpo que não é JSON não derruba o checkout", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("corpo inválido");
      },
    }));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("indisponivel");
  });

  it("rede indisponível devolve indisponivel, não exceção", async () => {
    mockarFetch(new Error("ECONNRESET"));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("indisponivel");
  });

  it("a consulta restringe ao Brasil e pede no máximo dois resultados", async () => {
    const espia = mockarFetch(respostaJson({ items: [item("houseNumber", "PA")] }));
    await provedorHere(CHAVE).geocodificar(ENDERECO);
    const url = String(espia.mock.calls[0]?.[0]);
    expect(url).toContain("countryCode%3ABRA");
    expect(url).toContain("limit=2");
  });

  it("RN-ENT-004: complemento e referência não têm como entrar na consulta", async () => {
    const espia = mockarFetch(respostaJson({ items: [item("houseNumber", "PA")] }));
    await provedorHere(CHAVE).geocodificar(ENDERECO);
    const url = decodeURIComponent(String(espia.mock.calls[0]?.[0]));
    expect(url).not.toContain("Ap ");
    expect(url).not.toContain("padaria");
  });
});

// ------------------------------------------------------- cota e indisponibilidade

/**
 * O Limited Plan da HERE — o plano sem informação de pagamento, que é o da
 * Shalon — limita 1.000 requisições por dia, 5 RPS em Geocode e 10 RPS em
 * Routing. Estourar qualquer um devolve 429, e foi o que apareceu no
 * diagnóstico contra a API real em 24/09/2026.
 *
 * A invariante deste bloco: cota esgotada é INDISPONIBILIDADE TEMPORÁRIA.
 * Nunca vira taxa, nunca vira distância zero, e nunca é confundida com erro
 * de credencial — 429 com a chave certa não é problema de configuração, e
 * tratá-lo como tal mandaria a Shalon procurar defeito onde não há.
 */
describe("HERE: cota e indisponibilidade não viram frete", () => {
  for (const [rotulo, status] of [
    ["cota estourada (429)", 429],
    ["serviço fora do ar (503)", 503],
    ["erro interno (500)", 500],
  ] as const) {
    it(`${rotulo}: geocodificação devolve indisponivel, não configuracao`, async () => {
      mockarFetch(respostaJson({ error: "Rate limit for this service has been reached" }, status));
      const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("indisponivel");
    });

    it(`${rotulo}: rota devolve indisponivel, não distância`, async () => {
      mockarFetch(respostaJson({}, status));
      const r = await provedorHere(CHAVE).rota(ORIGEM, DESTINO);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("indisponivel");
      // O ponto que protege o dinheiro: a falha não carrega distância.
      expect(Object.keys(r)).not.toContain("distanciaKm");
      expect(Object.keys(r)).not.toContain("duracaoMinutos");
    });
  }

  it("NENHUMA falha do provedor carrega distância — nem zero", async () => {
    const falhas: Array<[string, unknown, number]> = [
      ["429", {}, 429],
      ["503", {}, 503],
      ["401", {}, 401],
      ["sem rota", { routes: [] }, 200],
      ["seção sem comprimento", { routes: [{ sections: [{ summary: {} }] }] }, 200],
    ];
    for (const [rotulo, corpo, status] of falhas) {
      mockarFetch(respostaJson(corpo, status));
      const r = await provedorHere(CHAVE).rota(ORIGEM, DESTINO);
      expect(r.ok, rotulo).toBe(false);
      expect(Object.keys(r), rotulo).not.toContain("distanciaKm");
      vi.unstubAllGlobals();
    }
  });

  it("429 na geocodificação não vira endereço aceito com confiança alguma", async () => {
    mockarFetch(respostaJson({}, 429));
    const r = await provedorHere(CHAVE).geocodificar(ENDERECO);
    expect(r.ok).toBe(false);
    expect(Object.keys(r)).not.toContain("coordenada");
    expect(Object.keys(r)).not.toContain("confianca");
  });
});

// -------------------------------------------------------------------- rota

describe("HERE: rota rodoviária", () => {
  it("converte metros em km com três casas e segundos em minutos", async () => {
    mockarFetch(
      respostaJson({ routes: [{ sections: [{ summary: { length: 3215, duration: 600 } }] }] }),
    );
    const r = await provedorHere(CHAVE).rota(ORIGEM, DESTINO);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.distanciaKm).toBe(3.215);
      expect(r.duracaoMinutos).toBe(10);
      expect(r.provedor).toBe("here");
    }
  });

  it("soma as seções quando a rota vem dividida", async () => {
    mockarFetch(
      respostaJson({
        routes: [
          {
            sections: [
              { summary: { length: 1000, duration: 120 } },
              { summary: { length: 2500, duration: 180 } },
            ],
          },
        ],
      }),
    );
    const r = await provedorHere(CHAVE).rota(ORIGEM, DESTINO);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.distanciaKm).toBe(3.5);
      expect(r.duracaoMinutos).toBe(5);
    }
  });

  it("pede rota de CARRO — nunca linha reta (RN-ENT-006)", async () => {
    const espia = mockarFetch(
      respostaJson({ routes: [{ sections: [{ summary: { length: 1000 } }] }] }),
    );
    await provedorHere(CHAVE).rota(ORIGEM, DESTINO);
    expect(String(espia.mock.calls[0]?.[0])).toContain("transportMode=car");
  });

  it("sem rota devolve sem_rota, e NÃO distância zero", async () => {
    mockarFetch(respostaJson({ routes: [] }));
    const r = await provedorHere(CHAVE).rota(ORIGEM, DESTINO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("sem_rota");
  });

  it("seção sem comprimento é sem_rota, e NÃO distância zero", async () => {
    mockarFetch(respostaJson({ routes: [{ sections: [{ summary: { duration: 600 } }] }] }));
    const r = await provedorHere(CHAVE).rota(ORIGEM, DESTINO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("sem_rota");
  });

  it("duração ausente não invalida a distância", async () => {
    mockarFetch(respostaJson({ routes: [{ sections: [{ summary: { length: 4000 } }] }] }));
    const r = await provedorHere(CHAVE).rota(ORIGEM, DESTINO);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.distanciaKm).toBe(4);
      expect(r.duracaoMinutos).toBeNull();
    }
  });

  it("401 na rota é configuração; 500 é indisponibilidade", async () => {
    mockarFetch(respostaJson({}, 401));
    const a = await provedorHere(CHAVE).rota(ORIGEM, DESTINO);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.motivo).toBe("configuracao");
    vi.unstubAllGlobals();

    mockarFetch(respostaJson({}, 500));
    const b = await provedorHere(CHAVE).rota(ORIGEM, DESTINO);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.motivo).toBe("indisponivel");
  });

  it("rede indisponível na rota não vira exceção", async () => {
    mockarFetch(new Error("timeout"));
    const r = await provedorHere(CHAVE).rota(ORIGEM, DESTINO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("indisponivel");
  });
});
