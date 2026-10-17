import type { ProvedorDeRotas } from "./contrato";
import { provedorHere } from "./here";
import { provedorTomTom } from "./tomtom";
import { provedorComReserva } from "./comReserva";
import { provedorIndisponivel } from "./indisponivel";

export type { Coordenada, EnderecoParaGeocodificar, ProvedorDeRotas, ResultadoGeocodificacao, ResultadoRota, MotivoFalha, Confianca } from "./contrato";
export { consultaDeEndereco } from "./contrato";
export { provedorFalso } from "./falso";

/**
 * Escolhe o provedor de rotas a partir do ambiente.
 *
 * Só existem dois caminhos em produção: HERE com credencial, ou indisponível.
 * Não há terceiro caminho "estimado", porque estimar distância é exatamente o
 * que CLAUDE.md §20 proíbe.
 *
 * SEM FALLBACK PARA O GOOGLE, por decisão explícita (D-2026-09-24-75). O
 * arquivo `google.ts` continua no repositório como histórico da transição,
 * mas não participa da seleção: um fallback automático para um provedor cujo
 * faturamento não será ativado criaria dependência enganosa — pareceria haver
 * uma rede de proteção que, na prática, responderia erro de credencial.
 *
 * A chave é lida de `HERE_API_KEY` — server-side, nunca `NEXT_PUBLIC_*`
 * (CLAUDE.md §13/§45), e nunca registrada em log.
 */
export function selecionarProvedorDeRotas(): ProvedorDeRotas {
  const chave = process.env.HERE_API_KEY?.trim();
  // Reserva (D-2026-10-16-142): só existe com a chave configurada. É outra
  // base de ruas com o mesmo rigor, não um "estimado".
  const chaveDaReserva = process.env.TOMTOM_API_KEY?.trim();
  if (chave && chaveDaReserva) return provedorComReserva(provedorHere(chave), provedorTomTom(chaveDaReserva));
  if (chave) return provedorHere(chave);
  if (chaveDaReserva) return provedorTomTom(chaveDaReserva);
  return provedorIndisponivel();
}

/** Diz se há credencial de rotas, sem revelar nada sobre ela. */
export function rotasConfiguradas(): boolean {
  return Boolean(process.env.HERE_API_KEY?.trim() || process.env.TOMTOM_API_KEY?.trim());
}

/**
 * Quais serviços de mapa estão configurados neste ambiente — só sim/não,
 * nunca a chave. Para a tela de Configurações dizer se a Vercel recebeu as
 * variáveis (D-2026-10-16-146).
 */
export function servicosDeMapaConfigurados(): { principal: boolean; reserva: boolean } {
  return {
    principal: Boolean(process.env.HERE_API_KEY?.trim()),
    reserva: Boolean(process.env.TOMTOM_API_KEY?.trim()),
  };
}
