import type {
  Coordenada,
  EnderecoParaGeocodificar,
  ProvedorDeRotas,
  ResultadoGeocodificacao,
  ResultadoRota,
} from "./contrato";
import { consultaDeEndereco } from "./contrato";

/**
 * Dublê determinístico do provedor de rotas.
 *
 * Serve a testes e ao desenvolvimento local sem credencial. NÃO é uma
 * implementação do Google: não valida endereço de verdade e não conhece
 * ruas. Por isso `selecionarProvedorDeRotas` se recusa a usá-lo em produção.
 *
 * As respostas são fixadas por roteiro, nunca adivinhadas — um teste de taxa
 * precisa saber exatamente qual distância vai sair.
 */

export type RoteiroFalso = {
  /** Consulta (ou trecho dela) → resposta da geocodificação. */
  enderecos?: { contem: string; resposta: ResultadoGeocodificacao }[];
  /** Distâncias por destino, na ordem em que `rota` for chamada. */
  distanciasKm?: number[];
  /** Resposta única de rota, quando não há lista. */
  rotaPadrao?: ResultadoRota;
};

const NOME = "falso";

export function provedorFalso(roteiro: RoteiroFalso = {}): ProvedorDeRotas {
  let proxima = 0;

  return {
    nome: NOME,

    async geocodificar(endereco: EnderecoParaGeocodificar): Promise<ResultadoGeocodificacao> {
      const consulta = consultaDeEndereco(endereco);
      const combinado = roteiro.enderecos?.find((e) =>
        consulta.toLowerCase().includes(e.contem.toLowerCase()),
      );
      if (combinado) return combinado.resposta;

      // Coordenada derivada do texto: estável entre execuções, sem sortear.
      let soma = 0;
      for (const c of consulta) soma = (soma * 31 + c.charCodeAt(0)) % 100000;

      return {
        ok: true,
        coordenada: {
          latitude: -23.5 - (soma % 1000) / 100000,
          longitude: -46.6 - (Math.floor(soma / 1000) % 1000) / 100000,
        },
        confianca: "exata",
        enderecoFormatado: consulta,
        provedor: NOME,
      };
    },

    async rota(_origem: Coordenada, _destino: Coordenada): Promise<ResultadoRota> {
      const km = roteiro.distanciasKm?.[proxima];
      proxima += 1;
      if (km !== undefined) {
        return { ok: true, distanciaKm: km, duracaoMinutos: Math.round(km * 4), provedor: NOME };
      }
      return (
        roteiro.rotaPadrao ?? {
          ok: false,
          motivo: "indisponivel",
          mensagem: "Roteiro do dublê não previu esta rota.",
          provedor: NOME,
        }
      );
    },
  };
}
