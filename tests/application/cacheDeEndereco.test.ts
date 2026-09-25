import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consultarEnderecoConhecido,
  registrarRotaMedida,
} from "@/application/checkout/cacheDeEndereco";

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
  rota: false,
};

/** Acerto que traz TAMBÉM a distância (Fase B). */
const HIT_COM_ROTA = {
  ...HIT,
  rota: true,
  distancia_km: 3.215,
  rota_provedor: "here",
  rota_dias: 7,
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
      data: { ...HIT, latitude: "-20.0100000", longitude: "-40.0100000" },
    });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) {
      expect(r.latitude).toBeCloseTo(-20.0100000, 7);
      expect(r.longitude).toBeCloseTo(-40.0100000, 7);
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

// ============================================================== FASE B: rota

/**
 * Reuso de distância (D-2026-09-25-77).
 *
 * A INVARIANTE: a distância pode ser reaproveitada; o PREÇO nunca. Nada neste
 * módulo devolve taxa, e o banco só entrega a distância quando a origem atual
 * da loja é a mesma que produziu a medição — comparação feita no SQL, sobre
 * `store_settings`, fora do alcance de quem chama.
 *
 * Zero, negativo, nulo e inconsistente viram MISS. Miss significa medir no
 * HERE, que é o comportamento de antes da Fase B.
 */
describe("cache de rota: acerto", () => {
  it("devolve a distância já medida", async () => {
    const { r } = await consultar({ data: HIT_COM_ROTA });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) {
      expect(r.rota).not.toBeNull();
      expect(r.rota?.distanciaKm).toBe(3.215);
      expect(r.rota?.provedor).toBe("here");
      expect(r.rota?.dias).toBe(7);
    }
  });

  it("converte distância que vem como texto — `numeric` do Postgres", async () => {
    const { r } = await consultar({ data: { ...HIT_COM_ROTA, distancia_km: "2.655" } });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) expect(r.rota?.distanciaKm).toBeCloseTo(2.655, 3);
  });

  it("NUNCA devolve taxa, mesmo que a resposta trouxesse uma", async () => {
    const { r } = await consultar({
      data: { ...HIT_COM_ROTA, taxa: 9.9, delivery_fee: 9.9, fee: 9.9 },
    });
    expect(r.encontrado).toBe(true);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain("taxa");
    expect(texto).not.toContain("9.9");
    expect(texto).not.toContain("fee");
  });
});

describe("cache de rota: coordenada válida com rota inválida", () => {
  /**
   * O par de cenários que mais importa no desenho: as duas metades vencem
   * separado. Quando a loja muda de endereço, o cliente continua onde estava
   * — a coordenada dele vale, a rota até ele não.
   */
  it("`rota: false` mantém a coordenada e descarta a distância", async () => {
    const { r } = await consultar({ data: { ...HIT_COM_ROTA, rota: false } });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) {
      expect(r.latitude).toBe(-23.5);
      expect(r.rota).toBeNull();
    }
  });

  it("distância ausente com `rota: true` é MISS de rota, não de endereço", async () => {
    const { distancia_km: _, ...semDistancia } = HIT_COM_ROTA;
    const { r } = await consultar({ data: semDistancia });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) expect(r.rota).toBeNull();
  });
});

describe("cache de rota: distância inválida nunca vira acerto", () => {
  it("ZERO é MISS — zero km cairia na faixa mais barata", async () => {
    const { r } = await consultar({ data: { ...HIT_COM_ROTA, distancia_km: 0 } });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) expect(r.rota).toBeNull();
  });

  it("negativo é MISS", async () => {
    const { r } = await consultar({ data: { ...HIT_COM_ROTA, distancia_km: -3.2 } });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) expect(r.rota).toBeNull();
  });

  it("nulo, NaN, Infinity e texto não numérico são MISS", async () => {
    for (const v of [null, NaN, Infinity, -Infinity, "longe", ""]) {
      const { r } = await consultar({ data: { ...HIT_COM_ROTA, distancia_km: v } });
      expect(r.encontrado, String(v)).toBe(true);
      if (r.encontrado) expect(r.rota, String(v)).toBeNull();
    }
  });

  it("sem provedor da rota é MISS: medição sem autor não é medição", async () => {
    for (const v of [null, "", "   ", 42]) {
      const { r } = await consultar({ data: { ...HIT_COM_ROTA, rota_provedor: v } });
      expect(r.encontrado, String(v)).toBe(true);
      if (r.encontrado) expect(r.rota, String(v)).toBeNull();
    }
  });

  it("`rota_dias` inválido não impede o acerto — vira zero", async () => {
    const { r } = await consultar({ data: { ...HIT_COM_ROTA, rota_dias: "muitos" } });
    expect(r.encontrado).toBe(true);
    if (r.encontrado) expect(r.rota?.dias).toBe(0);
  });
});

// ------------------------------------------------------------- gravação

describe("registro da medição", () => {
  it("manda distância e provedor, e NUNCA a origem", async () => {
    const { cliente, rpc } = supabaseFalso({ data: { ok: true, gravado: true } });
    await registrarRotaMedida(cliente, ENDERECO, 3.215, "here", "segredo-de-teste");
    expect(rpc).toHaveBeenCalledTimes(1);
    const [nome, args] = rpc.mock.calls[0] ?? [];
    expect(nome).toBe("registrar_rota_medida");
    const chaves = Object.keys(args as Record<string, unknown>);
    expect(chaves).toContain("p_distancia_km");
    expect(chaves).toContain("p_provedor");
    // A origem é lida de `store_settings` DENTRO do banco. Se viesse daqui,
    // este código poderia declarar uma origem que não é a da loja, e a
    // distância "válida" teria sido medida de outro lugar.
    expect(chaves).not.toContain("p_origem_lat");
    expect(chaves).not.toContain("p_origem_lng");
    // E nunca taxa.
    expect(JSON.stringify(args)).not.toContain("taxa");
  });

  it("distância inválida não chega ao banco", async () => {
    for (const km of [0, -1, NaN, Infinity]) {
      const { cliente, rpc } = supabaseFalso({ data: { ok: true } });
      await registrarRotaMedida(cliente, ENDERECO, km, "here", "segredo-de-teste");
      expect(rpc, String(km)).not.toHaveBeenCalled();
    }
  });

  it("falha na gravação não lança: o pedido do cliente já foi criado", async () => {
    const { cliente } = supabaseFalso(new Error("conexão caiu"));
    await expect(
      registrarRotaMedida(cliente, ENDERECO, 3.215, "here", "segredo-de-teste"),
    ).resolves.toBeUndefined();
  });

  it("erro devolvido pelo banco também é silencioso", async () => {
    const { cliente } = supabaseFalso({ error: { code: "42501" } });
    await expect(
      registrarRotaMedida(cliente, ENDERECO, 3.215, "here", "segredo-de-teste"),
    ).resolves.toBeUndefined();
  });
});
