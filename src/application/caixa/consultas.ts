import "server-only";

import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type {
  CategoriaFinanceira,
  EstadoDoCaixa,
  LancamentoFinanceiro,
  PagamentoDoPedido,
  ResumoDeFechamento,
  SessaoHistorica,
} from "./tipos";

/**
 * Leitura do caixa e do financeiro.
 *
 * As projeções são SECURITY INVOKER: quem decide o que aparece é a RLS, não
 * um `if` aqui. Sem `cash.view`, `caixa_atual` responde "sem caixa" em vez de
 * erro — e é por isso que a tela de quem não tem permissão mostra o estado
 * vazio, sem revelar que existe uma sessão aberta (03 §33.6).
 */

/** Estado operacional do caixa agora. */
export async function obterCaixa(): Promise<EstadoDoCaixa> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("caixa_atual");

  if (error) {
    logger.error("caixa:obterCaixa", { code: (error as { code?: string }).code });
    return { aberto: false, dinheiro_fora_da_gaveta: 0, ultima: null };
  }
  return data as EstadoDoCaixa;
}

/** O fechamento detalhado de uma sessão — ou da aberta, se nenhuma for dada. */
export async function obterResumoDeFechamento(
  sessaoId?: string,
): Promise<ResumoDeFechamento | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("resumo_do_fechamento", {
    p_sessao: sessaoId ?? null,
  });

  if (error) {
    logger.error("caixa:obterResumoDeFechamento", { code: (error as { code?: string }).code });
    return null;
  }
  const resposta = data as { ok?: boolean };
  return resposta?.ok ? (data as ResumoDeFechamento) : null;
}

/** Sessões anteriores, da mais recente para a mais antiga. */
export async function listarSessoes(limite = 30): Promise<SessaoHistorica[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("sessoes_de_caixa", { p_limite: limite });

  if (error) {
    logger.error("caixa:listarSessoes", { code: (error as { code?: string }).code });
    return [];
  }
  return (data ?? []) as SessaoHistorica[];
}

export async function listarCategorias(): Promise<CategoriaFinanceira[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("categorias_financeiras");

  if (error) {
    logger.error("caixa:listarCategorias", { code: (error as { code?: string }).code });
    return [];
  }
  return (data ?? []) as CategoriaFinanceira[];
}

export async function listarLancamentos(filtros: {
  tipo?: "income" | "expense";
  categoria_id?: string;
  limite?: number;
} = {}): Promise<LancamentoFinanceiro[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("lancamentos_financeiros", {
    p_filtros: {
      tipo: filtros.tipo ?? null,
      categoria_id: filtros.categoria_id ?? null,
      limite: filtros.limite ?? 100,
    },
  });

  if (error) {
    logger.error("caixa:listarLancamentos", { code: (error as { code?: string }).code });
    return [];
  }
  return (data ?? []) as LancamentoFinanceiro[];
}

/** Esperado e realizado de um pedido, lado a lado (RN-PGTO-002). */
export async function obterPagamentoDoPedido(
  pedidoId: string,
): Promise<PagamentoDoPedido | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("pagamento_do_pedido", {
    p_order_id: pedidoId,
  });

  if (error) {
    logger.error("caixa:obterPagamentoDoPedido", { code: (error as { code?: string }).code });
    return null;
  }
  return data as PagamentoDoPedido;
}
