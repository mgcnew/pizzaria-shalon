import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarEnderecoPorCep } from "@/application/checkout/cep";

/**
 * Testes da consulta de CEP.
 *
 * A INVARIANTE QUE ESTE ARQUIVO PROTEGE, e que é a razão de o ViaCEP ter sido
 * aprovado (D-2026-09-24-75): ele preenche TEXTO e nunca devolve coordenada.
 * Se alguém algum dia acrescentar latitude/longitude aqui, o frete passaria a
 * ser calculado sobre um ponto que representa uma rua inteira — e o teste
 * "nunca devolve coordenada" falha na hora.
 *
 * A segunda invariante: falha do ViaCEP NÃO bloqueia o checkout.
 *
 * `fetch` é dublê. Nenhum teste toca a rede.
 */

function respostaJson(corpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as unknown as Response;
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

const RESPOSTA_VIACEP = {
  cep: "01001-000",
  logradouro: "Praça da Sé",
  complemento: "lado ímpar",
  bairro: "Sé",
  localidade: "São Paulo",
  uf: "SP",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CEP: o que ele devolve", () => {
  it("preenche rua, bairro, cidade e UF", async () => {
    mockarFetch(respostaJson(RESPOSTA_VIACEP));
    const r = await buscarEnderecoPorCep("01001-000");
    expect(r).toEqual({
      ok: true,
      logradouro: "Praça da Sé",
      bairro: "Sé",
      cidade: "São Paulo",
      uf: "SP",
    });
  });

  it("NUNCA devolve coordenada — o frete não sai daqui", async () => {
    mockarFetch(
      // Mesmo que a resposta trouxesse coordenada, ela não pode passar.
      respostaJson({ ...RESPOSTA_VIACEP, latitude: -23.5, longitude: -46.6 }),
    );
    const r = await buscarEnderecoPorCep("01001000");
    expect(r.ok).toBe(true);
    const chaves = Object.keys(r);
    expect(chaves).not.toContain("latitude");
    expect(chaves).not.toContain("longitude");
    expect(JSON.stringify(r)).not.toContain("-23.5");
  });

  it("NÃO copia o `complemento` do ViaCEP: lá significa faixa de numeração", async () => {
    mockarFetch(respostaJson(RESPOSTA_VIACEP));
    const r = await buscarEnderecoPorCep("01001-000");
    // "lado ímpar" não é o apartamento do cliente (RN-ENT-004).
    expect(JSON.stringify(r)).not.toContain("lado ímpar");
    expect(Object.keys(r)).not.toContain("complemento");
  });

  it("aceita CEP com e sem máscara, consultando o mesmo endereço", async () => {
    const a = mockarFetch(respostaJson(RESPOSTA_VIACEP));
    await buscarEnderecoPorCep("01001-000");
    const urlComMascara = String(a.mock.calls[0]?.[0]);
    vi.unstubAllGlobals();

    const b = mockarFetch(respostaJson(RESPOSTA_VIACEP));
    await buscarEnderecoPorCep("01001000");
    const urlSemMascara = String(b.mock.calls[0]?.[0]);

    expect(urlComMascara).toBe(urlSemMascara);
    expect(urlComMascara).toContain("01001000");
  });

  it("rua e bairro vazios são aceitos: o cliente completa o que faltar", async () => {
    mockarFetch(
      respostaJson({ ...RESPOSTA_VIACEP, logradouro: "", bairro: "" }),
    );
    const r = await buscarEnderecoPorCep("01001-000");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.logradouro).toBe("");
      expect(r.cidade).toBe("São Paulo");
    }
  });
});

describe("CEP: formato inválido nem chega à rede", () => {
  it("menos de oito dígitos é recusado sem requisição", async () => {
    const espia = mockarFetch(respostaJson(RESPOSTA_VIACEP));
    const r = await buscarEnderecoPorCep("123");
    expect(r).toEqual({ ok: false, motivo: "formato" });
    expect(espia).not.toHaveBeenCalled();
  });

  it("mais de oito dígitos também", async () => {
    const espia = mockarFetch(respostaJson(RESPOSTA_VIACEP));
    const r = await buscarEnderecoPorCep("010010001234");
    expect(r).toEqual({ ok: false, motivo: "formato" });
    expect(espia).not.toHaveBeenCalled();
  });

  it("valor que não é texto é recusado", async () => {
    const espia = mockarFetch(respostaJson(RESPOSTA_VIACEP));
    expect(await buscarEnderecoPorCep(null)).toEqual({ ok: false, motivo: "formato" });
    expect(await buscarEnderecoPorCep(1001000)).toEqual({ ok: false, motivo: "formato" });
    expect(espia).not.toHaveBeenCalled();
  });
});

describe("CEP: falha nunca bloqueia o checkout", () => {
  it("CEP inexistente devolve nao_encontrado", async () => {
    mockarFetch(respostaJson({ erro: true }));
    const r = await buscarEnderecoPorCep("99999999");
    expect(r).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it('o ViaCEP também responde `erro: "true"` como texto', async () => {
    mockarFetch(respostaJson({ erro: "true" }));
    const r = await buscarEnderecoPorCep("99999999");
    expect(r).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("resposta sem cidade ou UF é tratada como não encontrada", async () => {
    mockarFetch(respostaJson({ logradouro: "Rua X", bairro: "Centro" }));
    const r = await buscarEnderecoPorCep("01001000");
    expect(r).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("HTTP 400 é formato; 500 é indisponibilidade", async () => {
    mockarFetch(respostaJson({}, 400));
    expect(await buscarEnderecoPorCep("01001000")).toEqual({ ok: false, motivo: "formato" });
    vi.unstubAllGlobals();

    mockarFetch(respostaJson({}, 500));
    expect(await buscarEnderecoPorCep("01001000")).toEqual({
      ok: false,
      motivo: "indisponivel",
    });
  });

  it("serviço fora do ar devolve indisponivel, nunca exceção", async () => {
    mockarFetch(new Error("ENOTFOUND viacep.com.br"));
    const r = await buscarEnderecoPorCep("01001000");
    expect(r).toEqual({ ok: false, motivo: "indisponivel" });
  });

  it("corpo que não é JSON devolve indisponivel", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("corpo inválido");
      },
    }));
    const r = await buscarEnderecoPorCep("01001000");
    expect(r).toEqual({ ok: false, motivo: "indisponivel" });
  });
});
