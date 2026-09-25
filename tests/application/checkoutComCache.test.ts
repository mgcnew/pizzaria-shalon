import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O CHECKOUT INTEIRO, com o cache ligado — Fases A e B.
 *
 * Os testes de `cacheDeEndereco.test.ts` olham a peça isolada. Este arquivo
 * responde as perguntas que só o fluxo montado responde:
 *
 * - o segundo pedido do mesmo endereço realmente NÃO chama o HERE?
 * - com o HERE fora do ar e cache válido, o cliente ainda consegue cotar?
 * - com o HERE fora do ar e SEM cache, falha com segurança — nunca R$ 0,00?
 * - a taxa continua saindo de `cotar_entrega` mesmo com distância em cache?
 *
 * COMO É MONTADO: o cliente Supabase e o provedor de rotas são dublês. As
 * chamadas ao provedor são CONTADAS, porque "não chamou o HERE" é justamente o
 * que precisa ser provado, e nenhuma asserção sobre resultado provaria isso.
 */

const ENDERECO = {
  logradouro: "Rua das Flores",
  numero: "123",
  bairro: "Centro",
  cidade: "São Paulo",
  uf: "SP",
  cep: "01000-000",
  complemento: "Ap 42",
  referencia: "perto da padaria",
};

/** Respostas que o banco de mentira vai dar, ajustáveis por teste. */
type Respostas = {
  origem: unknown;
  enderecoConhecido: unknown;
  cotarEntrega: unknown;
};

let respostas: Respostas;
let chamadasRpc: string[];
let chamadasGeocodificar: number;
let chamadasRota: number;
/**
 * Como o provedor deve responder.
 *
 * `indisponivel` e `configuracao` são problema NOSSO; os demais são sobre o
 * endereço que o cliente digitou. A distinção existe porque a mensagem ao
 * cliente é diferente nos dois casos, e há teste para as duas pontas.
 */
let provedorResponde:
  | "ok"
  | "indisponivel"
  | "configuracao"
  | "nao_encontrado"
  | "ambiguo"
  | "sem_rota";

function reiniciar() {
  chamadasRpc = [];
  chamadasGeocodificar = 0;
  chamadasRota = 0;
  provedorResponde = "ok";
  respostas = {
    origem: { ok: true, latitude: -20.0, longitude: -40.0 },
    // Sem cache, por padrão.
    enderecoConhecido: { ok: true, encontrado: false },
    cotarEntrega: {
      ok: true,
      taxa: 8.5,
      exige_aprovacao: false,
      pedido_minimo_ativo: false,
      pedido_minimo_valor: null,
    },
  };
}

vi.mock("@/infrastructure/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    rpc: async (nome: string) => {
      chamadasRpc.push(nome);
      if (nome === "origem_da_loja") return { data: respostas.origem, error: null };
      if (nome === "endereco_conhecido") {
        return { data: respostas.enderecoConhecido, error: null };
      }
      if (nome === "cotar_entrega") return { data: respostas.cotarEntrega, error: null };
      return { data: null, error: null };
    },
  }),
}));

vi.mock("@/infrastructure/rotas", async (importarOriginal) => {
  // `consultaDeEndereco` fica REAL: é ela que monta o endereço formatado no
  // acerto de cache, e o teste de RN-ENT-004 depende do comportamento dela.
  const real = await importarOriginal<typeof import("@/infrastructure/rotas")>();
  return {
    ...real,
    selecionarProvedorDeRotas: () => ({
      nome: "here",
      async geocodificar() {
        chamadasGeocodificar++;
        if (provedorResponde === "indisponivel" || provedorResponde === "configuracao") {
          return {
            ok: false as const,
            motivo: provedorResponde,
            mensagem: "O serviço de mapas não está configurado corretamente.",
            provedor: "here",
          };
        }
        if (provedorResponde === "nao_encontrado") {
          return {
            ok: false as const,
            motivo: "nao_encontrado" as const,
            mensagem: "Não encontramos esse endereço.",
            provedor: "here",
          };
        }
        if (provedorResponde === "ambiguo") {
          return {
            ok: false as const,
            motivo: "ambiguo" as const,
            mensagem: "Esse endereço ficou ambíguo. Confira os dados ou ajuste no mapa.",
            provedor: "here",
          };
        }
        return {
          ok: true as const,
          coordenada: { latitude: -20.01, longitude: -40.01 },
          confianca: "exata" as const,
          enderecoFormatado: "Rua das Flores, 123 — do provedor",
          provedor: "here",
        };
      },
      async rota() {
        chamadasRota++;
        if (provedorResponde === "indisponivel" || provedorResponde === "configuracao") {
          return {
            ok: false as const,
            motivo: provedorResponde,
            mensagem: "O serviço de rotas não está configurado corretamente.",
            provedor: "here",
          };
        }
        if (provedorResponde === "sem_rota") {
          return {
            ok: false as const,
            motivo: "sem_rota" as const,
            mensagem: "Não há rota de carro até esse endereço.",
            provedor: "here",
          };
        }
        return {
          ok: true as const,
          distanciaKm: 2.678,
          duracaoMinutos: 8,
          provedor: "here",
        };
      },
    }),
  };
});

const { cotarEntrega } = await import("@/application/checkout/acoes");

beforeEach(() => {
  reiniciar();
  vi.stubEnv("SHALON_CHECKOUT_ORIGIN_SECRET", "segredo-de-teste-com-mais-de-32-caracteres");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Acerto completo: coordenada e distância, ambas reutilizáveis. */
const CACHE_COMPLETO = {
  ok: true,
  encontrado: true,
  latitude: -20.01,
  longitude: -40.01,
  confianca: "exata",
  provedor: "here",
  ajustado_no_mapa: false,
  dias: 5,
  rota: true,
  distancia_km: 2.678,
  rota_provedor: "here",
  rota_dias: 5,
};

/** Só a coordenada: a rota terá de ser medida. */
const CACHE_SO_COORDENADA = { ...CACHE_COMPLETO, rota: false };

// ================================================= 1. segundo pedido não paga

describe("segundo pedido do mesmo endereço", () => {
  it("SEM cache: chama o HERE duas vezes — geocodificar e rota", async () => {
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(true);
    expect(chamadasGeocodificar).toBe(1);
    expect(chamadasRota).toBe(1);
  });

  it("COM cache completo: NENHUMA chamada ao HERE", async () => {
    respostas.enderecoConhecido = CACHE_COMPLETO;
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(true);
    // A prova da Fase B, e o motivo de este arquivo existir.
    expect(chamadasGeocodificar).toBe(0);
    expect(chamadasRota).toBe(0);
    if (r.ok) expect(r.distancia_km).toBe(2.678);
  });

  it("COM cache só de coordenada: 1 chamada, e é a da rota", async () => {
    respostas.enderecoConhecido = CACHE_SO_COORDENADA;
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(true);
    expect(chamadasGeocodificar).toBe(0);
    expect(chamadasRota).toBe(1);
  });
});

// ============================== 2. a taxa continua vindo das faixas vigentes

describe("a taxa nunca vem do cache", () => {
  it("`cotar_entrega` é chamada mesmo com distância em cache", async () => {
    respostas.enderecoConhecido = CACHE_COMPLETO;
    await cotarEntrega(ENDERECO);
    expect(chamadasRpc).toContain("cotar_entrega");
  });

  it("mudar a faixa muda a taxa do mesmo endereço em cache", async () => {
    respostas.enderecoConhecido = CACHE_COMPLETO;

    const antes = await cotarEntrega(ENDERECO);
    expect(antes.ok).toBe(true);
    if (antes.ok) expect(antes.taxa).toBe(8.5);

    // A Shalon reajusta a tabela. Nada no cache foi tocado — só as faixas.
    respostas.cotarEntrega = {
      ok: true,
      taxa: 12.0,
      exige_aprovacao: false,
      pedido_minimo_ativo: false,
      pedido_minimo_valor: null,
    };

    const depois = await cotarEntrega(ENDERECO);
    expect(depois.ok).toBe(true);
    if (depois.ok) {
      expect(depois.taxa).toBe(12.0);
      // A distância é a MESMA: só o preço mudou.
      expect(depois.distancia_km).toBe(2.678);
    }
    // E continuou sem tocar no HERE.
    expect(chamadasGeocodificar).toBe(0);
    expect(chamadasRota).toBe(0);
  });

  it("fora de área continua fora de área com distância em cache", async () => {
    respostas.enderecoConhecido = CACHE_COMPLETO;
    // A Shalon encurta a área atendida. A distância em cache não muda.
    respostas.cotarEntrega = { ok: false, fora_de_area: true, distancia_maxima_km: 2 };

    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("fora_de_area");
      expect(r.distancia_km).toBe(2.678);
      // Nunca taxa, e nunca zero.
      expect(JSON.stringify(r)).not.toContain('"taxa"');
    }
  });
});

// ======================================= 7 e 8. HERE fora do ar, com e sem cache

describe("HERE indisponível", () => {
  it("COM cache completo: a cotação sai normalmente", async () => {
    provedorResponde = "indisponivel";
    respostas.enderecoConhecido = CACHE_COMPLETO;

    const r = await cotarEntrega(ENDERECO);
    // É o ganho que talvez importe mais que a cota: cliente recorrente fecha
    // pedido de entrega com o provedor fora do ar.
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.distancia_km).toBe(2.678);
      expect(r.taxa).toBe(8.5);
    }
  });

  it("SEM cache: falha com segurança, e NUNCA com frete zero", async () => {
    provedorResponde = "indisponivel";

    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // `indisponivel` na geocodificação vira `nao_configurado` desde a
      // Fase 5. O cache não mudou esse mapeamento.
      expect(r.motivo).toBe("nao_configurado");
      // A mensagem oferece as duas saídas que existem: insistir, ou buscar.
      expect(r.erro).toContain("de novo");
      expect(r.erro).toContain("retirada");
      expect(JSON.stringify(r)).not.toContain('"taxa"');
      expect(JSON.stringify(r)).not.toContain('"distancia_km"');
    }
    // E não chegou a cotar taxa nenhuma.
    expect(chamadasRpc).not.toContain("cotar_entrega");
  });

  it("COM cache só de coordenada e rota fora do ar: rota_indisponivel", async () => {
    provedorResponde = "indisponivel";
    respostas.enderecoConhecido = CACHE_SO_COORDENADA;

    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(false);
    // Coordenada do cache não salva a rota: sem distância não há entrega.
    if (!r.ok) {
      expect(r.motivo).toBe("rota_indisponivel");
      expect(r.erro).toContain("de novo");
      expect(r.erro).toContain("retirada");
    }
    expect(chamadasRpc).not.toContain("cotar_entrega");
  });
});

/**
 * A MENSAGEM que o cliente lê quando o serviço de mapas não responde.
 *
 * Antes, ele recebia o texto do provedor — que chegava a dizer "o serviço de
 * mapas não está configurado corretamente". Não ajuda quem quer jantar, e
 * expõe estado interno do sistema (CLAUDE.md §37).
 *
 * Nada de regra mudou aqui: os testes acima seguem provando que a entrega
 * fecha e que taxa nenhuma é produzida.
 */
describe("microcopy da indisponibilidade", () => {
  /** Termos que não podem chegar ao cliente. */
  const TERMOS_TECNICOS = [
    "HERE",
    "API",
    "provider",
    "provedor",
    "429",
    "503",
    "configurad",
    "configuração",
    "credencial",
    "chave",
    "cota",
    "geocod",
  ];

  function conferirMensagem(mensagem: string, rotulo: string) {
    expect(mensagem, rotulo).toContain("de novo");
    expect(mensagem, rotulo).toContain("retirada no local");
    for (const termo of TERMOS_TECNICOS) {
      expect(mensagem.toLowerCase(), `${rotulo} · ${termo}`).not.toContain(termo.toLowerCase());
    }
  }

  it("geocodificação fora do ar: mensagem simples, sem termo técnico", async () => {
    provedorResponde = "indisponivel";
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) conferirMensagem(r.erro, "geocodificacao");
  });

  it("rota fora do ar: mesma mensagem", async () => {
    provedorResponde = "indisponivel";
    respostas.enderecoConhecido = CACHE_SO_COORDENADA;
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) conferirMensagem(r.erro, "rota");
  });

  it("a mensagem do provedor NÃO atravessa mais", async () => {
    provedorResponde = "indisponivel";
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(false);
    // Texto real do `here.ts`, reproduzido pelo dublê. Era o que o cliente
    // lia antes desta correção.
    if (!r.ok) expect(r.erro).not.toContain("não está configurado corretamente");
  });

  it("credencial ausente tambem recebe a mensagem operacional", async () => {
    provedorResponde = "configuracao";
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("nao_configurado");
      conferirMensagem(r.erro, "configuracao");
    }
  });

  // --------------------------------- a contraprova: o que NÃO foi trocado
  //
  // Erro sobre o endereço continua com a mensagem específica. Se esta parte
  // regredisse, o cliente perderia a única informação acionável que tem — e a
  // correção de microcopy teria piorado a UX em vez de melhorar.

  it("endereco nao encontrado MANTEM a mensagem especifica", async () => {
    provedorResponde = "nao_encontrado";
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("endereco_nao_encontrado");
      expect(r.erro).toContain("Não encontramos esse endereço");
      expect(r.erro).not.toContain("retirada no local");
    }
  });

  it("endereco ambiguo MANTEM a orientacao de conferir os dados", async () => {
    provedorResponde = "ambiguo";
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("endereco_ambiguo");
      expect(r.erro).toContain("Confira os dados");
    }
  });

  it("sem rota de carro MANTEM a mensagem, que e sobre o destino", async () => {
    provedorResponde = "sem_rota";
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("rota_indisponivel");
      expect(r.erro).toContain("Não há rota de carro");
    }
  });

  it("indisponibilidade NÃO produz taxa nem distância", async () => {
    provedorResponde = "indisponivel";
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(false);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain('"taxa"');
    expect(texto).not.toContain('"distancia_km"');
    expect(chamadasRpc).not.toContain("cotar_entrega");
  });
});

// ================================================ 5. cache inválido é miss

describe("cache inválido cai no HERE, nunca em distância zero", () => {
  it("distância zero no cache: mede a rota de novo", async () => {
    respostas.enderecoConhecido = { ...CACHE_COMPLETO, distancia_km: 0 };
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(true);
    // Mediu de verdade em vez de aceitar zero.
    expect(chamadasRota).toBe(1);
    if (r.ok) expect(r.distancia_km).toBe(2.678);
  });

  it("distância negativa: mede a rota de novo", async () => {
    respostas.enderecoConhecido = { ...CACHE_COMPLETO, distancia_km: -5 };
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(true);
    expect(chamadasRota).toBe(1);
  });

  it("cache fora do ar: geocodifica e mede, como antes do cache existir", async () => {
    respostas.enderecoConhecido = null;
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(true);
    expect(chamadasGeocodificar).toBe(1);
    expect(chamadasRota).toBe(1);
  });

  it("confiança `ambigua` no cache: geocodifica de novo", async () => {
    respostas.enderecoConhecido = { ...CACHE_COMPLETO, confianca: "ambigua" };
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(true);
    expect(chamadasGeocodificar).toBe(1);
  });
});

// =================================================== RN-ENT-004 no fluxo

describe("complemento e referência não atravessam", () => {
  it("o endereço formatado do acerto de cache não traz complemento nem referência", async () => {
    respostas.enderecoConhecido = CACHE_COMPLETO;
    const r = await cotarEntrega(ENDERECO);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.endereco_formatado).not.toContain("Ap 42");
      expect(r.endereco_formatado).not.toContain("padaria");
    }
  });
});
