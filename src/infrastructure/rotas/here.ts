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

      let dados: {
        items?: {
          resultType?: string;
          houseNumberType?: string;
          position?: { lat?: number; lng?: number };
          address?: { label?: string };
        }[];
      };
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

      const itens = dados.items ?? [];
      const primeiro = itens[0];
      const lat = primeiro?.position?.lat;
      const lng = primeiro?.position?.lng;

      if (!primeiro || lat === undefined || lng === undefined) {
        return {
          ok: false,
          motivo: "nao_encontrado",
          mensagem: "Não encontramos esse endereço.",
          provedor: NOME,
        };
      }

      const confianca = confiancaDoHere(primeiro.resultType, primeiro.houseNumberType);

      // Mais de um resultado, ou precisão menor que o número da casa:
      // ambíguo. Não se inventa coordenada para poder cobrar.
      if (!confianca || itens.length > 1) {
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
        enderecoFormatado: primeiro.address?.label ?? consulta,
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
