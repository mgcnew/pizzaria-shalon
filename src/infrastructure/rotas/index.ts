import type { ProvedorDeRotas } from "./contrato";
import { provedorGoogle } from "./google";
import { provedorIndisponivel } from "./indisponivel";

export type { Coordenada, EnderecoParaGeocodificar, ProvedorDeRotas, ResultadoGeocodificacao, ResultadoRota, MotivoFalha, Confianca } from "./contrato";
export { consultaDeEndereco } from "./contrato";
export { provedorFalso } from "./falso";

/**
 * Escolhe o provedor de rotas a partir do ambiente.
 *
 * Só existem dois caminhos em produção: Google com credencial, ou
 * indisponível. Não há terceiro caminho "estimado", porque estimar distância
 * é exatamente o que CLAUDE.md §20 proíbe.
 *
 * A chave é lida de `GOOGLE_MAPS_SERVER_KEY` — server-side, nunca
 * `NEXT_PUBLIC_*` (CLAUDE.md §13/§45), e nunca registrada em log.
 */
export function selecionarProvedorDeRotas(): ProvedorDeRotas {
  const chave = process.env.GOOGLE_MAPS_SERVER_KEY?.trim();
  if (chave) return provedorGoogle(chave);
  return provedorIndisponivel();
}

/** Diz se há credencial de rotas, sem revelar nada sobre ela. */
export function rotasConfiguradas(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_SERVER_KEY?.trim());
}
