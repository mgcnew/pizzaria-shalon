import "server-only";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { FormaDePagamento, Modalidade, PedidoPublico, PixParaPagamento } from "./tipos";

/**
 * Consultas do checkout e do acompanhamento.
 *
 * Todas passam por funções de projeção com colunas escolhidas a dedo
 * (migrations 0043 e 0044). Nenhuma lê tabela de pedido diretamente: o RLS
 * negaria, e é assim que deve ser (03 §9.1).
 */

/** RN-PGTO-001: as formas vêm do cadastro, filtradas pela modalidade. */
export async function formasDePagamento(
  modalidade: Modalidade,
): Promise<FormaDePagamento[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("formas_pagamento_publicas", {
    p_modalidade: modalidade,
  });

  if (error) {
    logger.error("checkout:formasDePagamento", { code: (error as { code?: string }).code });
    return [];
  }
  return (data ?? []) as FormaDePagamento[];
}

/**
 * Acompanhamento por token (03 §10).
 *
 * Token errado e pedido inexistente devolvem a MESMA coisa — `null` — porque
 * a função do banco já responde igual nos dois casos. Quem estiver tentando
 * adivinhar não aprende nada com a diferença.
 */
export async function pedidoPorToken(token: string): Promise<PedidoPublico | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("pedido_por_token", { p_token: token });

  if (error) {
    logger.error("checkout:pedidoPorToken", { code: (error as { code?: string }).code });
    return null;
  }

  const resposta = data as { ok?: boolean } | null;
  if (!resposta?.ok) return null;
  return resposta as PedidoPublico;
}

/** RN-PGTO-009: a chave Pix só para quem tem o pedido, enquanto ele espera. */
export async function pixDoPedido(token: string): Promise<PixParaPagamento> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("pix_para_pagamento", { p_token: token });

  if (error) {
    logger.error("checkout:pixDoPedido", { code: (error as { code?: string }).code });
    return { ok: false };
  }
  return (data ?? { ok: false }) as PixParaPagamento;
}
