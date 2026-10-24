import "server-only";

import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { CentralDeEntregas, Corrida, CorridaHistorica, PresencaDoMes } from "./tipos";

/**
 * Leitura da operação de entrega.
 *
 * Projeções SECURITY INVOKER: quem não tem `deliveries.view` recebe listas
 * vazias, não erro — a tela mostra o estado vazio sem revelar que existem
 * corridas (03 §33.6). Nenhum número desta camada é calculado aqui.
 */

const VAZIO: CentralDeEntregas = { aguardando: [], corridas: [], motoboys: [] };

/** Fila de entrega, corridas vivas e quem pode levar. */
export async function obterCentral(): Promise<CentralDeEntregas> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("central_de_entregas");

  if (error) {
    logger.error("entregas:obterCentral", { code: (error as { code?: string }).code });
    return VAZIO;
  }
  return { ...VAZIO, ...(data as Partial<CentralDeEntregas>) };
}

/**
 * Presença dos entregadores num mês (0172). `mes` é qualquer data do mês; sem
 * ele, o mês de hoje. Quem não pode ver a equipe recebe a lista vazia.
 */
export async function obterPresencaDoMes(mes?: string): Promise<PresencaDoMes | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("presenca_do_mes", { p_mes: mes ?? null });

  if (error) {
    logger.error("entregas:obterPresencaDoMes", { code: (error as { code?: string }).code });
    return null;
  }
  return (data as PresencaDoMes | null) ?? null;
}

/** Uma corrida, pedido a pedido — §18: não somar tudo e perder o rastro. */
export async function obterCorrida(corridaId: string): Promise<Corrida | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("corrida", { p_id: corridaId });

  if (error) {
    logger.error("entregas:obterCorrida", { code: (error as { code?: string }).code });
    return null;
  }
  return (data as Corrida | null) ?? null;
}

/** Corridas já acertadas, para conferência posterior. */
export async function listarCorridas(limite = 20): Promise<CorridaHistorica[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("corridas", { p_limite: limite });

  if (error) {
    logger.error("entregas:listarCorridas", { code: (error as { code?: string }).code });
    return [];
  }
  return (data as CorridaHistorica[]) ?? [];
}
