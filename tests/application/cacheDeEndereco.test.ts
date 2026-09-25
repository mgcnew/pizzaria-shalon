import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarEnderecoConhecido } from "@/application/checkout/cacheDeEndereco";

/**
 * Testes do reuso de coordenada — Fase A do cache (D-2026-09-25).
 *
 * A INVARIANTE CENTRAL: acerto de cache só acontece com coordenada válida e
 * confiança permitida. Em qualquer outra situação — resposta estranha, RPC
 * fora do ar, confiança `ambigua`, coordenada ausente — o resultado é MISS, e
 * miss é o comportamento de hoje: chamar o HERE.
 *
 * O cache pode deixar o checkout mais rápido. Não pode deixá-lo menos seguro.
 *
 * Nenhum teste toca banco: o cliente Supabase é dublê.
 */

const ENDERECO = {
  logradouro: "Rua das Flores",
  numero: "123",
  bairro: "Centro",
  cidade: "São Paulo",
  uf: "SP",
  cep: "01000-000",
};

const HIT = {
  ok: true,
  encontrado: true,
  latitude: -23.5,
  longitude: -46.6,
  confianca: "exata",
  provedor: "here",
  ajustado_no_mapa: false,
  dias: 12,
};

/** Cliente Supabase de mentira: só `rpc`, devolvendo o que o teste quiser. */
function supabaseFalso(resposta: { data?: unknown; error?: unknown } | Error) {
  const rpc = vi.fn(async (_nome?: unknown, _args?: unknown) => {
    if (resposta instanceof Error) throw resposta;
    return { data: resposta.data ?? null, error: resposta.error ?? null };
  });
  return { cliente: { rpc } as unknown as SupabaseClient, rpc };
}

async function consultar(resposta: { data?: unknown; error?: unknown } | Error) {
  const { cliente, rpc } = supabaseFalso(resposta);
  const r = await consultarEnderecoConhecido(cliente, ENDERECO, "here", "segredo-de-teste");
  return { r, rpc };
}

// ------------------------------------------------------------------- acerto

describe("cache de endereço: acerto", () => {
  it("devolve a coordenada já validada", async () => {
    const { r } = await consultar({ data: HIT });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) {
      expect(r.latitude).toBe(-23.5);
      expect(r.longitude).toBe(-46.6);
      expect(r.confianca).toBe("exata");
      expect(r.provedor).toBe("here");
      expect(r.dias).toBe(12);
    }
  });

  it("aceita `aproximada`", async () => {
    const { r } = await consultar({ data: { ...HIT, confianca: "aproximada" } });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) expect(r.confianca).toBe("aproximada");
  });

  it("aceita `ajustada_no_mapa` e marca a precedência do ajuste manual", async () => {
    const { r } = await consultar({
      data: { ...HIT, confianca: "ajustada_no_mapa", ajustado_no_mapa: true },
    });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) {
      expect(r.confianca).toBe("ajustada_no_mapa");
      expect(r.ajustadoNoMapa).toBe(true);
    }
  });

  it("converte coordenada que vem como texto — `numeric` do Postgres costuma vir assim", async () => {
    const { r } = await consultar({
      data: { ...HIT, latitude: "-23.6959433", longitude: "-46.6426328" },
    });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) {
      expect(r.latitude).toBeCloseTo(-23.6959433, 7);
      expect(r.longitude).toBeCloseTo(-46.6426328, 7);
    }
  });

  it("NÃO devolve distância nem taxa: elas não saem daqui", async () => {
    const { r } = await consultar({
      // Mesmo que a RPC passasse a devolver isso, não pode atravessar.
      data: { ...HIT, distancia_km: 3.5, taxa: 9.9 },
    });
    expect(r.encontrado).toBe(true);
    const chaves = Object.keys(r);
    expect(chaves).not.toContain("distancia_km");
    expect(chaves).not.toContain("distanciaKm");
    expect(chaves).not.toContain("taxa");
  });
});

// --------------------------------------------------------------------- miss

describe("cache de endereço: confiança insuficiente nunca é acerto", () => {
  it("`ambigua` é MISS — RN-ENT-003 não vira confiança com o tempo", async () => {
    const { r } = await consultar({ data: { ...HIT, confianca: "ambigua" } });
    expect(r.encontrado).toBe(false);
  });

  it("confiança desconhecida é MISS", async () => {
    for (const c of ["", "alta", "provavel", "EXATA", null, 42]) {
      const { r } = await consultar({ data: { ...HIT, confianca: c } });
      expect(r.encontrado, String(c)).toBe(false);
    }
  });

  it("`ambigua` é MISS mesmo com ajuste manual marcado — registro contraditório não passa", async () => {
    const { r } = await consultar({
      data: { ...HIT, confianca: "ambigua", ajustado_no_mapa: true },
    });
    expect(r.encontrado).toBe(false);
  });
});

describe("cache de endereço: coordenada inválida nunca é acerto", () => {
  it("sem latitude é MISS", async () => {
    const { latitude: _, ...semLatitude } = HIT;
    const { r } = await consultar({ data: semLatitude });
    expect(r.encontrado).toBe(false);
  });

  it("coordenada nula é MISS", async () => {
    const { r } = await consultar({ data: { ...HIT, latitude: null, longitude: null } });
    expect(r.encontrado).toBe(false);
  });

  it("texto que não é número é MISS", async () => {
    const { r } = await consultar({ data: { ...HIT, latitude: "muito ao sul" } });
    expect(r.encontrado).toBe(false);
  });

  it("NaN e Infinity são MISS", async () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      const { r } = await consultar({ data: { ...HIT, longitude: v } });
      expect(r.encontrado, String(v)).toBe(false);
    }
  });

  it("(0,0) é MISS — é o Golfo da Guiné, não um endereço da Shalon", async () => {
    const { r } = await consultar({ data: { ...HIT, latitude: 0, longitude: 0 } });
    expect(r.encontrado).toBe(false);
  });
});

describe("cache de endereço: falha nunca bloqueia o checkout", () => {
  it("`encontrado: false` é MISS", async () => {
    const { r } = await consultar({ data: { ok: true, encontrado: false } });
    expect(r.encontrado).toBe(false);
  });

  it("origem não confiável é MISS, não exceção", async () => {
    const { r } = await consultar({ data: { ok: false, erro: "origem_nao_confiavel" } });
    expect(r.encontrado).toBe(false);
  });

  it("erro da RPC é MISS", async () => {
    const { r } = await consultar({ error: { code: "42501" } });
    expect(r.encontrado).toBe(false);
  });

  it("resposta nula, texto ou array é MISS", async () => {
    for (const d of [null, "ok", [], 7]) {
      const { r } = await consultar({ data: d });
      expect(r.encontrado, JSON.stringify(d)).toBe(false);
    }
  });

  it("exceção de rede é MISS, e não derruba o checkout", async () => {
    const { r } = await consultar(new Error("fetch failed"));
    expect(r.encontrado).toBe(false);
  });

  it("`dias` inválido não impede o acerto — vira zero", async () => {
    const { r } = await consultar({ data: { ...HIT, dias: "muitos" } });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) expect(r.dias).toBe(0);
  });
});

// ------------------------------------------------------------------ chamada

describe("cache de endereço: o que é enviado ao banco", () => {
  it("manda os campos crus e NENHUMA chave calculada no cliente", async () => {
    const { rpc } = await consultar({ data: HIT });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [nome, args] = rpc.mock.calls[0] ?? [];
    expect(nome).toBe("endereco_conhecido");
    const chaves = Object.keys(args as Record<string, unknown>).sort();
    expect(chaves).toEqual([
      "p_bairro",
      "p_cep",
      "p_cidade",
      "p_logradouro",
      "p_numero",
      "p_provedor",
      "p_segredo",
      "p_uf",
    ]);
    // A normalização vive só no SQL. Se um dia aparecer `p_chave` aqui,
    // passariam a existir duas definições da mesma regra — e a divergência
    // entre elas seria acerto falso.
    expect(chaves).not.toContain("p_chave");
    expect(chaves).not.toContain("p_address_key");
  });

  it("NÃO envia id, complemento nem referência", async () => {
    const { rpc } = await consultar({ data: HIT });
    const [, args] = rpc.mock.calls[0] ?? [];
    const texto = JSON.stringify(args);
    // O `id` do navegador não pode nomear a entrada do cache: id forjado
    // traria a coordenada do endereço de outro cliente.
    expect(texto).not.toContain("p_id");
    // RN-ENT-004: não movem a casa de lugar, não entram na identidade.
    expect(texto).not.toContain("complemento");
    expect(texto).not.toContain("referencia");
  });

  it("envia o provedor atual, para que coordenada de outro provedor não seja reusada", async () => {
    const { cliente, rpc } = supabaseFalso({ data: HIT });
    await consultarEnderecoConhecido(cliente, ENDERECO, "mapbox", "segredo-de-teste");
    const [, args] = rpc.mock.calls[0] ?? [];
    expect((args as { p_provedor: string }).p_provedor).toBe("mapbox");
  });

  it("CEP ausente vira null, não string vazia", async () => {
    const { cliente, rpc } = supabaseFalso({ data: HIT });
    const { cep: _, ...semCep } = ENDERECO;
    await consultarEnderecoConhecido(cliente, semCep, "here", "segredo-de-teste");
    const [, args] = rpc.mock.calls[0] ?? [];
    expect((args as { p_cep: unknown }).p_cep).toBeNull();
  });
});
