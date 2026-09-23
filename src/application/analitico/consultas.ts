import "server-only";

import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type {
  CentralDeAtencao,
  ChaveDePeriodo,
  MovimentoDoPeriodo,
  RankingDeProdutos,
  ResumoAnalitico,
} from "./tipos";

/**
 * Leitura dos indicadores.
 *
 * Toda conta acontece no BANCO, em SQL, sobre os registros reais. Esta camada
 * chama uma RPC por bloco de tela e devolve o que veio — ela não soma, não
 * calcula percentual, não deriva média e não classifica nada. Se um número
 * aparecer na tela, existe uma função SQL que responde por ele.
 *
 * Nenhum LLM participa de cálculo algum aqui, por decisão explícita da
 * Fase 9: contas de dinheiro são determinísticas ou não são contas.
 *
 * Sem permissão o banco devolve `{ ok: false, sem_permissao: true }`. A
 * camada repassa `null`, e a tela mostra o bloco vazio — sem revelar o que
 * existe do outro lado (03 §33.6).
 */

type Periodoish = { chave?: ChaveDePeriodo; de?: string | null; ate?: string | null };

function argumentos(p: Periodoish = {}) {
  return {
    p_chave: p.chave ?? "30d",
    p_de: p.de ?? null,
    p_ate: p.ate ?? null,
  };
}

function aceitar<T>(contexto: string, data: unknown, error: unknown): T | null {
  if (error) {
    logger.error(`analitico:${contexto}`, { code: (error as { code?: string }).code });
    return null;
  }
  const r = (data ?? {}) as { ok?: boolean };
  if (!r.ok) return null;
  return data as T;
}

/** Indicadores do período com o anterior equivalente. Uma consulta, não oito. */
export async function obterResumo(p: Periodoish = {}): Promise<ResumoAnalitico | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("resumo_analitico", argumentos(p));
  return aceitar<ResumoAnalitico>("obterResumo", data, error);
}

/** A fila do que pede ação agora. Cada bloco responde à permissão do domínio. */
export async function obterCentralDeAtencao(): Promise<CentralDeAtencao | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("central_de_atencao");
  return aceitar<CentralDeAtencao>("obterCentralDeAtencao", data, error);
}

/** Mais e menos vendidos, com o motivo de quem não é comparável. */
export async function obterRanking(
  p: Periodoish = {},
  limite = 10,
): Promise<RankingDeProdutos | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("ranking_de_produtos", {
    ...argumentos(p),
    p_limite: limite,
  });
  return aceitar<RankingDeProdutos>("obterRanking", data, error);
}

/** Movimento por dia, por dia da semana e por hora — no fuso da loja. */
export async function obterMovimento(p: Periodoish = {}): Promise<MovimentoDoPeriodo | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("movimento_no_periodo", argumentos(p));
  return aceitar<MovimentoDoPeriodo>("obterMovimento", data, error);
}
