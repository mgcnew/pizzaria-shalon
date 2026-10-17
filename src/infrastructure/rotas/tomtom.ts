import "server-only";
import type {
  Coordenada,
  EnderecoParaGeocodificar,
  ProvedorDeRotas,
  ResultadoGeocodificacao,
  ResultadoRota,
} from "./contrato";
import { consultaDeEndereco } from "./contrato";
import { escolherPorNomeEProximidade } from "./proximidade";

/**
 * TomTom — provedor de RESERVA (D-2026-10-16-142).
 *
 * Entra só quando o HERE não localiza o endereço: o HERE não tem algumas
 * ruas do entorno da loja (ex.: Estrada do Retiro, CEP 04474-150), e o
 * OpenStreetMap também não. A TomTom tem base própria de ruas no Brasil.
 *
 * APIS: Search v2 (geocode) e Routing v1 (calculateRoute, carro).
 * CREDENCIAL: `TOMTOM_API_KEY`, só no servidor. Viaja na URL (é assim que a
 * TomTom autentica), então NENHUM erro daqui inclui a URL — só o status.
 *
 * MESMO RIGOR do HERE (RN-ENT-003, D-2026-10-16-140):
 *   · "Point Address"   → imóvel localizado            → exata
 *   · "Address Range"   → número estimado no trecho     → aproximada
 *   · "Street"          → só a rua: vale SÓ com o CEP do resultado igual ao
 *                         digitado                      → aproximada
 *   · o resto (bairro, cidade, ponto de interesse)      → recusa
 *   · nota de correspondência (`matchConfidence.score`) mínima de 0,8;
 *   · um segundo resultado concorrente, a mais de 300 m, torna ambíguo.
 */

const NOME = "tomtom";
const TEMPO_LIMITE_MS = 6000;
const NOTA_MINIMA = 0.8;
/** Nota mínima quando o CEP completo do resultado é o digitado. */
const NOTA_COM_CEP = 0.6;
const MESMO_LUGAR_METROS = 300;

export type ItemDaTomTom = {
  type?: string;
  position?: { lat?: number; lon?: number };
  address?: { freeformAddress?: string; postalCode?: string; extendedPostalCode?: string; streetName?: string };
  matchConfidence?: { score?: number };
};

function distanciaEmMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Decide se a resposta da TomTom serve para cobrar por distância. Pura. */
function avaliarPrincipalDaTomTom(
  itens: readonly ItemDaTomTom[],
  cepDigitado: string | null | undefined,
):
  | { ok: true; lat: number; lng: number; confianca: "exata" | "aproximada"; label: string | undefined }
  | { ok: false; motivo: "nao_encontrado" | "ambiguo" } {
  const primeiro = itens[0];
  const lat = primeiro?.position?.lat;
  const lng = primeiro?.position?.lon;
  if (!primeiro || lat === undefined || lng === undefined) return { ok: false, motivo: "nao_encontrado" };

  const cep = (cepDigitado ?? "").replace(/\D/g, "");
  const cepDoResultado = (primeiro.address?.extendedPostalCode ?? primeiro.address?.postalCode ?? "")
    .replace(/\D/g, "");
  const cepConfere = cep.length === 8 && cepDoResultado.startsWith(cep);

  // CEP completo igual ao digitado é confirmação forte (o CEP de rua cobre
  // um trecho): aí a nota pode ser menor. Ex.: "Estrada do Retiro, 100" volta
  // como "Rua do Retiro, 100", CEP 04474-150, nota 0,69 — é o lugar certo.
  const nota = primeiro.matchConfidence?.score ?? 0;
  if (nota < (cepConfere ? NOTA_COM_CEP : NOTA_MINIMA)) return { ok: false, motivo: "nao_encontrado" };

  let confianca: "exata" | "aproximada" | null = null;
  if (primeiro.type === "Point Address") confianca = "exata";
  else if (primeiro.type === "Address Range") confianca = "aproximada";
  else if (primeiro.type === "Street" && cepConfere) confianca = "aproximada";
  if (!confianca) return { ok: false, motivo: "ambiguo" };

  const segundo = itens[1];
  if (segundo?.position?.lat !== undefined && segundo.position.lon !== undefined) {
    const notaDoSegundo = segundo.matchConfidence?.score ?? 0;
    const longe =
      distanciaEmMetros({ lat, lng }, { lat: segundo.position.lat, lng: segundo.position.lon }) >
      MESMO_LUGAR_METROS;
    if (longe && notaDoSegundo >= nota - 0.05) return { ok: false, motivo: "ambiguo" };
  }

  return { ok: true, lat, lng, confianca, label: primeiro.address?.freeformAddress };
}

/** Regra principal e, se ela recusar, o desempate por nome + proximidade. */
export function avaliarResultadosDaTomTom(
  itens: readonly ItemDaTomTom[],
  cepDigitado: string | null | undefined,
  proximidade?: { ruaDigitada: string; loja: Coordenada },
): ReturnType<typeof avaliarPrincipalDaTomTom> {
  const principal = avaliarPrincipalDaTomTom(itens, cepDigitado);
  if (principal.ok || !proximidade) return principal;
  const escolhido = escolherPorNomeEProximidade(
    itens
      .filter((i) => i.position?.lat !== undefined && i.position?.lon !== undefined)
      .map((i) => ({
        lat: i.position!.lat!,
        lng: i.position!.lon!,
        nivel:
          i.type === "Point Address" || i.type === "Address Range"
            ? ("casa" as const)
            : i.type === "Street"
              ? ("rua" as const)
              : ("outro" as const),
        rua: i.address?.streetName,
        nota: i.matchConfidence?.score ?? 0,
        label: i.address?.freeformAddress,
      })),
    proximidade.ruaDigitada,
    proximidade.loja,
  );
  return escolhido
    ? { ok: true, lat: escolhido.lat, lng: escolhido.lng, confianca: "aproximada", label: escolhido.label }
    : principal;
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

function motivoDoStatus(status: number) {
  return status === 401 || status === 403 ? ("configuracao" as const) : ("indisponivel" as const);
}

export function provedorTomTom(chave: string): ProvedorDeRotas {
  return {
    nome: NOME,

    async geocodificar(endereco: EnderecoParaGeocodificar, perto?: Coordenada): Promise<ResultadoGeocodificacao> {
      const consulta = consultaDeEndereco(endereco);
      // Com a loja, a busca fica restrita a 20 km dela (`lat/lon/radius`):
      // homônimos do outro lado da cidade nem entram (D-2026-10-16-144).
      const url =
        `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(consulta)}.json` +
        `?countrySet=BR&language=pt-BR&limit=${perto ? 5 : 2}` +
        (perto ? `&lat=${perto.latitude}&lon=${perto.longitude}&radius=20000` : "") +
        `&key=${encodeURIComponent(chave)}`;

      let resposta: Response;
      try {
        resposta = await buscar(url);
      } catch {
        return { ok: false, motivo: "indisponivel", mensagem: "Não conseguimos falar com o serviço de mapas agora.", provedor: NOME };
      }
      if (!resposta.ok) {
        return {
          ok: false,
          motivo: motivoDoStatus(resposta.status),
          mensagem: "O serviço de mapas de reserva recusou a consulta.",
          provedor: NOME,
        };
      }

      let dados: { results?: ItemDaTomTom[] };
      try {
        dados = (await resposta.json()) as typeof dados;
      } catch {
        return { ok: false, motivo: "indisponivel", mensagem: "O serviço de mapas respondeu de forma inesperada.", provedor: NOME };
      }

      const avaliacao = avaliarResultadosDaTomTom(
        dados.results ?? [],
        endereco.cep,
        perto ? { ruaDigitada: endereco.logradouro, loja: perto } : undefined,
      );
      if (!avaliacao.ok) {
        return {
          ok: false,
          motivo: avaliacao.motivo,
          mensagem:
            avaliacao.motivo === "nao_encontrado"
              ? "Não encontramos esse endereço. Confira a rua, o número e o CEP."
              : "Esse endereço ficou ambíguo. Confira os dados ou ajuste no mapa.",
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
      const url =
        "https://api.tomtom.com/routing/1/calculateRoute/" +
        `${origem.latitude},${origem.longitude}:${destino.latitude},${destino.longitude}/json` +
        "?travelMode=car&routeType=fastest&traffic=false" +
        `&key=${encodeURIComponent(chave)}`;

      let resposta: Response;
      try {
        resposta = await buscar(url);
      } catch {
        return { ok: false, motivo: "indisponivel", mensagem: "Não conseguimos calcular a rota agora.", provedor: NOME };
      }
      if (!resposta.ok) {
        return { ok: false, motivo: motivoDoStatus(resposta.status), mensagem: "O serviço de rotas recusou a consulta.", provedor: NOME };
      }
      let dados: { routes?: { summary?: { lengthInMeters?: number; travelTimeInSeconds?: number } }[] };
      try {
        dados = (await resposta.json()) as typeof dados;
      } catch {
        return { ok: false, motivo: "indisponivel", mensagem: "O serviço de rotas respondeu de forma inesperada.", provedor: NOME };
      }
      const resumo = dados.routes?.[0]?.summary;
      if (!resumo || typeof resumo.lengthInMeters !== "number") {
        return { ok: false, motivo: "sem_rota", mensagem: "Não há rota de carro até esse endereço.", provedor: NOME };
      }
      return {
        ok: true,
        distanciaKm: resumo.lengthInMeters / 1000,
        duracaoMinutos:
          typeof resumo.travelTimeInSeconds === "number" ? Math.round(resumo.travelTimeInSeconds / 60) : null,
        provedor: NOME,
      };
    },
  };
}
