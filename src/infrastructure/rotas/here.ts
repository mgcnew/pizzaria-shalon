import "server-only";
import type {
  Coordenada,
  EnderecoParaGeocodificar,
  ProvedorDeRotas,
  ResultadoGeocodificacao,
  ResultadoRota,
} from "./contrato";
import { consultaDeEndereco } from "./contrato";

/**
 * HERE Location Services.
 *
 * Provedor aprovado em D-2026-09-24-75, substituindo o Google Maps, que exige
 * ativação de faturamento com meio de pagamento. Toda particularidade do HERE
 * fica DENTRO deste arquivo; o resto do sistema só conhece o contrato.
 *
 * APIS USADAS:
 *  · Geocoding & Search v1 — endereço → coordenada, com o tipo do resultado;
 *  · Routing v8            — distância RODOVIÁRIA entre dois pontos.
 *
 * CREDENCIAL: `HERE_API_KEY`, lida só no servidor. Nunca `NEXT_PUBLIC_*`
 * (CLAUDE.md §13 e §45), nunca versionada e nunca registrada em log.
 *
 * ATENÇÃO AO LOG. O HERE autentica por parâmetro de consulta, então a chave
 * viaja na URL. Nenhum erro deste arquivo inclui a URL — só o status HTTP.
 * Trocar isso por um log "para depurar" vazaria a credencial.
 */

const NOME = "here";
const TEMPO_LIMITE_MS = 6000;

/**
 * Precisão do HERE → confiança do nosso contrato.
 *
 * D-2026-09-24-75 manteve o rigor que o Google já tinha: só o NÚMERO da casa
 * serve para cobrar por distância.
 *
 *  · `houseNumber` + `PA`           → o imóvel foi localizado          → exata
 *  · `houseNumber` + `interpolated` → estimado no trecho da rua        → aproximada
 *  · `street`                       → centro da rua. Uma rua longa põe
 *                                     o ponto a centenas de metros do
 *                                     endereço                        → REJEITA
 *  · `locality` / `administrativeArea` → centro de bairro ou cidade    → REJEITA
 *
 * `street` é o caso que mais tenta: o HERE devolve com aparência de sucesso.
 * Aceitá-lo seria inventar distância para poder cobrar (RN-ENT-003).
 */
function confiancaDoHere(
  resultType: string | undefined,
  houseNumberType: string | undefined,
) {
  if (resultType !== "houseNumber") return null;
  if (houseNumberType === "PA") return "exata" as const;
  if (houseNumberType === "interpolated") return "aproximada" as const;
  // Sem o tipo do número não há como afirmar que o imóvel foi localizado.
  return null;
}

/** Um item da resposta do Geocoding v1, só com o que avaliamos. */
export type ItemDoHere = {
  resultType?: string;
  houseNumberType?: string;
  position?: { lat?: number; lng?: number };
  address?: { label?: string; postalCode?: string };
  scoring?: { queryScore?: number };
};

/**
 * Nota mínima de correspondência (`scoring.queryScore`, 0 a 1) para aceitar
 * um resultado (D-2026-10-16-140). Abaixo disso o HERE está "chutando": numa
 * consulta real ("Estrada do Retiro, 100") ele devolveu outra rua, em outra
 * zona da cidade, com nota 0,56 — e a entrega saía cobrada por 10,6 km.
 */
const NOTA_MINIMA = 0.8;
/** Dois resultados a menos disso um do outro são o mesmo lugar. */
const MESMO_LUGAR_METROS = 300;

function distanciaEmMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/**
 * Decide se a resposta do HERE localiza o endereço com segurança para COBRAR
 * por distância. Função pura (testada à parte).
 *
 *   1. a nota do primeiro resultado precisa ser alta (≥ 0,8);
 *   2. número da casa (`PA`/`interpolated`) → exata/aproximada, como antes;
 *   3. só a RUA (`street`) passa a valer quando o CEP do resultado é o CEP
 *      digitado: no Brasil o CEP de rua cobre um trecho, então o ponto fica
 *      no lugar certo — é o caso de ruas curtas que o HERE não numera
 *      (a própria Rua dos Dourados da loja). Sem CEP conferido, continua
 *      recusado (RN-ENT-003);
 *   4. um segundo resultado só torna ambíguo se CONCORRE: nota parecida e
 *      em outro lugar (mais de 300 m).
 */
export function avaliarResultadosDoHere(
  itens: readonly ItemDoHere[],
  cepDigitado: string | null | undefined,
):
  | { ok: true; lat: number; lng: number; confianca: "exata" | "aproximada"; label: string | undefined }
  | { ok: false; motivo: "nao_encontrado" | "ambiguo" } {
  const primeiro = itens[0];
  const lat = primeiro?.position?.lat;
  const lng = primeiro?.position?.lng;
  if (!primeiro || lat === undefined || lng === undefined) return { ok: false, motivo: "nao_encontrado" };

  const nota = primeiro.scoring?.queryScore ?? 0;
  if (nota < NOTA_MINIMA) return { ok: false, motivo: "nao_encontrado" };

  const cep = (cepDigitado ?? "").replace(/\D/g, "");
  const cepDoResultado = (primeiro.address?.postalCode ?? "").replace(/\D/g, "");
  const cepConfere = cep.length === 8 && cep === cepDoResultado;

  let confianca: "exata" | "aproximada" | null = confiancaDoHere(
    primeiro.resultType,
    primeiro.houseNumberType,
  );
  if (!confianca && primeiro.resultType === "street" && cepConfere) confianca = "aproximada";
  if (!confianca) return { ok: false, motivo: "ambiguo" };

  const segundo = itens[1];
  if (segundo?.position?.lat !== undefined && segundo.position.lng !== undefined) {
    const notaDoSegundo = segundo.scoring?.queryScore ?? 0;
    const longe =
      distanciaEmMetros({ lat, lng }, { lat: segundo.position.lat, lng: segundo.position.lng }) >
      MESMO_LUGAR_METROS;
    const concorre = notaDoSegundo >= nota - 0.05;
    if (longe && concorre) return { ok: false, motivo: "ambiguo" };
  }

  return { ok: true, lat, lng, confianca, label: primeiro.address?.label };
}

async function buscar(url: string): Promise<Response> {
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);
  try {
    return await fetch(url, { signal: controlador.signal, cache: "no-store" });
  } finally {
    clearTimeout(limite);
  }
}

/** 401/403 é credencial; o resto é indisponibilidade momentânea. */
function motivoDoStatus(status: number) {
  return status === 401 || status === 403 ? ("configuracao" as const) : ("indisponivel" as const);
}

export function provedorHere(chave: string): ProvedorDeRotas {
  return {
    nome: NOME,

    async geocodificar(endereco: EnderecoParaGeocodificar): Promise<ResultadoGeocodificacao> {
      const consulta = consultaDeEndereco(endereco);
      // `limit=2` de propósito: com 1 não há como detectar ambiguidade, e
      // acima de 2 se paga por dados que não vamos olhar.
      const url =
        "https://geocode.search.hereapi.com/v1/geocode" +
        `?q=${encodeURIComponent(consulta)}` +
        "&in=countryCode%3ABRA&lang=pt-BR&limit=2" +
        `&apiKey=${encodeURIComponent(chave)}`;

      let resposta: Response;
      try {
        resposta = await buscar(url);
      } catch {
        return {
          ok: false,
          motivo: "indisponivel",
          mensagem: "Não conseguimos falar com o serviço de mapas agora.",
          provedor: NOME,
        };
      }

      if (!resposta.ok) {
        // Só o status. A URL levaria a chave junto para o log.
        return {
          ok: false,
          motivo: motivoDoStatus(resposta.status),
          mensagem:
            motivoDoStatus(resposta.status) === "configuracao"
              ? "O serviço de mapas não está configurado corretamente."
              : "O serviço de mapas recusou a consulta.",
          provedor: NOME,
        };
      }

      let dados: { items?: ItemDoHere[] };
      try {
        dados = (await resposta.json()) as typeof dados;
      } catch {
        return {
          ok: false,
          motivo: "indisponivel",
          mensagem: "O serviço de mapas respondeu de forma inesperada.",
          provedor: NOME,
        };
      }

      const avaliacao = avaliarResultadosDoHere(dados.items ?? [], endereco.cep);
      if (!avaliacao.ok) {
        return avaliacao.motivo === "nao_encontrado"
          ? {
              ok: false,
              motivo: "nao_encontrado",
              mensagem: "Não encontramos esse endereço. Confira a rua, o número e o CEP.",
              provedor: NOME,
            }
          : {
              ok: false,
              motivo: "ambiguo",
              mensagem: "Esse endereço ficou ambíguo. Confira os dados ou ajuste no mapa.",
              provedor: NOME,
            };
      }

      return {
        ok: true,
        coordenada: { latitude: avaliacao.lat, longitude: avaliacao.lng },
        confianca: avaliacao.confianca,
        enderecoFormatado: avaliacao.label ?? consulta,
        provedor: NOME,
      };
    },

    async rota(origem: Coordenada, destino: Coordenada): Promise<ResultadoRota> {
      // RN-ENT-006: rota de CARRO por vias, nunca linha reta.
      // `return=summary` traz comprimento e duração, e nada mais.
      const url =
        "https://router.hereapi.com/v8/routes" +
        "?transportMode=car" +
        `&origin=${origem.latitude}%2C${origem.longitude}` +
        `&destination=${destino.latitude}%2C${destino.longitude}` +
        "&return=summary&lang=pt-BR" +
        `&apiKey=${encodeURIComponent(chave)}`;

      let resposta: Response;
      try {
        resposta = await buscar(url);
      } catch {
        return {
          ok: false,
          motivo: "indisponivel",
          mensagem: "Não conseguimos calcular a rota agora.",
          provedor: NOME,
        };
      }

      if (!resposta.ok) {
        return {
          ok: false,
          motivo: motivoDoStatus(resposta.status),
          mensagem:
            motivoDoStatus(resposta.status) === "configuracao"
              ? "O serviço de rotas não está configurado corretamente."
              : "O serviço de rotas recusou a consulta.",
          provedor: NOME,
        };
      }

      let dados: {
        routes?: { sections?: { summary?: { length?: number; duration?: number } }[] }[];
      };
      try {
        dados = (await resposta.json()) as typeof dados;
      } catch {
        return {
          ok: false,
          motivo: "indisponivel",
          mensagem: "O serviço de rotas respondeu de forma inesperada.",
          provedor: NOME,
        };
      }

      const secoes = dados.routes?.[0]?.sections ?? [];
      // Uma rota de carro costuma ter uma seção só, mas o formato admite
      // várias. Somar é o que corresponde à distância total percorrida.
      const comprimentos = secoes
        .map((s) => s.summary?.length)
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n));

      if (comprimentos.length === 0) {
        return {
          ok: false,
          motivo: "sem_rota",
          mensagem: "Não há rota de carro até esse endereço.",
          provedor: NOME,
        };
      }

      const metros = comprimentos.reduce((a, b) => a + b, 0);

      const duracoes = secoes
        .map((s) => s.summary?.duration)
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
      const segundos = duracoes.length > 0 ? duracoes.reduce((a, b) => a + b, 0) : null;

      return {
        ok: true,
        // Mesmo arredondamento de três casas que o provedor anterior usava:
        // a faixa de taxa compara quilômetros, e a fronteira é fechada.
        distanciaKm: Math.round((metros / 1000) * 1000) / 1000,
        duracaoMinutos: segundos === null ? null : Math.round(segundos / 60),
        provedor: NOME,
      };
    },
  };
}
