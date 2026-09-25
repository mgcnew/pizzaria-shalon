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
 * Google Maps Platform.
 *
 * ⚠️ FORA DO FLUXO ATIVO desde D-2026-09-24-75. O provedor de produção é o
 * HERE (`here.ts`), e `selecionarProvedorDeRotas` NÃO importa este arquivo.
 *
 * Ele permanece no repositório como histórico da transição e referência de
 * implementação — em particular do rigor no mapeamento de confiança, que o
 * provedor do HERE manteve. **Não reintroduza no seletor** sem nova decisão:
 * o faturamento do Google não foi ativado, então um fallback automático para
 * cá responderia erro de credencial fingindo ser rede de proteção.
 *
 * Provedor originalmente aprovado em D-2026-09-18-20. Toda particularidade do
 * Google fica DENTRO deste arquivo; o resto do sistema só conhece o contrato.
 *
 * APIS USADAS:
 *  · Geocoding API   — endereço → coordenada, com o nível de precisão;
 *  · Routes API v2   — distância RODOVIÁRIA entre dois pontos.
 *
 * CREDENCIAL: `GOOGLE_MAPS_SERVER_KEY`, lida só no servidor. Nunca
 * `NEXT_PUBLIC_*` (CLAUDE.md §13 e §45), nunca versionada e nunca registrada
 * em log — inclusive nos erros abaixo, que reportam apenas o status HTTP.
 */

const NOME = "google_maps";
const TEMPO_LIMITE_MS = 6000;

/**
 * Precisão do Google → confiança do nosso contrato.
 *
 * `ROOFTOP` e `RANGE_INTERPOLATED` localizam o imóvel ou o trecho da rua:
 * suficiente para cobrar por distância. `GEOMETRIC_CENTER` e `APPROXIMATE`
 * caem no centro do bairro ou da cidade — e cobrar por isso seria inventar
 * distância (RN-ENT-003).
 */
function confiancaDoGoogle(tipo: string | undefined) {
  switch (tipo) {
    case "ROOFTOP":
      return "exata" as const;
    case "RANGE_INTERPOLATED":
      return "aproximada" as const;
    default:
      return null;
  }
}

async function buscar(url: string, init?: RequestInit): Promise<Response> {
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);
  try {
    return await fetch(url, { ...init, signal: controlador.signal, cache: "no-store" });
  } finally {
    clearTimeout(limite);
  }
}

export function provedorGoogle(chave: string): ProvedorDeRotas {
  return {
    nome: NOME,

    async geocodificar(endereco: EnderecoParaGeocodificar): Promise<ResultadoGeocodificacao> {
      const consulta = consultaDeEndereco(endereco);
      const url =
        "https://maps.googleapis.com/maps/api/geocode/json" +
        `?address=${encodeURIComponent(consulta)}` +
        "&region=br&language=pt-BR" +
        `&key=${encodeURIComponent(chave)}`;

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
          motivo: resposta.status === 403 ? "configuracao" : "indisponivel",
          mensagem: "O serviço de mapas recusou a consulta.",
          provedor: NOME,
        };
      }

      const dados = (await resposta.json()) as {
        status?: string;
        results?: {
          geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
          formatted_address?: string;
          partial_match?: boolean;
        }[];
      };

      if (dados.status === "REQUEST_DENIED" || dados.status === "OVER_QUERY_LIMIT") {
        return {
          ok: false,
          motivo: "configuracao",
          mensagem: "O serviço de mapas não está configurado corretamente.",
          provedor: NOME,
        };
      }

      const primeiro = dados.results?.[0];
      const lat = primeiro?.geometry?.location?.lat;
      const lng = primeiro?.geometry?.location?.lng;

      if (dados.status !== "OK" || lat === undefined || lng === undefined) {
        return {
          ok: false,
          motivo: "nao_encontrado",
          mensagem: "Não encontramos esse endereço.",
          provedor: NOME,
        };
      }

      const confianca = confiancaDoGoogle(primeiro?.geometry?.location_type);

      // Mais de um resultado, correspondência parcial ou precisão de centro
      // de bairro: ambíguo. Não se inventa coordenada para poder cobrar.
      if (!confianca || primeiro?.partial_match || (dados.results?.length ?? 0) > 1) {
        return {
          ok: false,
          motivo: "ambiguo",
          mensagem: "Esse endereço ficou ambíguo. Confira os dados ou ajuste no mapa.",
          provedor: NOME,
        };
      }

      return {
        ok: true,
        coordenada: { latitude: lat, longitude: lng },
        confianca,
        enderecoFormatado: primeiro?.formatted_address ?? consulta,
        provedor: NOME,
      };
    },

    async rota(origem: Coordenada, destino: Coordenada): Promise<ResultadoRota> {
      let resposta: Response;
      try {
        resposta = await buscar("https://routes.googleapis.com/directions/v2:computeRoutes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": chave,
            // Só os campos que usamos: menos dados trafegados e menos custo.
            "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
          },
          body: JSON.stringify({
            origin: { location: { latLng: { latitude: origem.latitude, longitude: origem.longitude } } },
            destination: { location: { latLng: { latitude: destino.latitude, longitude: destino.longitude } } },
            // RN-ENT-006: rota de CARRO por vias, nunca linha reta.
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_UNAWARE",
            languageCode: "pt-BR",
            units: "METRIC",
          }),
        });
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
          motivo: resposta.status === 403 ? "configuracao" : "indisponivel",
          mensagem: "O serviço de rotas recusou a consulta.",
          provedor: NOME,
        };
      }

      const dados = (await resposta.json()) as {
        routes?: { distanceMeters?: number; duration?: string }[];
      };

      const metros = dados.routes?.[0]?.distanceMeters;
      if (metros === undefined) {
        return {
          ok: false,
          motivo: "sem_rota",
          mensagem: "Não há rota de carro até esse endereço.",
          provedor: NOME,
        };
      }

      const duracao = dados.routes?.[0]?.duration;
      const segundos = duracao ? Number(duracao.replace("s", "")) : NaN;

      return {
        ok: true,
        distanciaKm: Math.round((metros / 1000) * 1000) / 1000,
        duracaoMinutos: Number.isFinite(segundos) ? Math.round(segundos / 60) : null,
        provedor: NOME,
      };
    },
  };
}
