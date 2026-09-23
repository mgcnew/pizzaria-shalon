import "server-only";

import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type {
  ChaveDePeriodo,
} from "@/application/analitico/tipos";
import type {
  FiltrosDeCandidatos,
  ListaDeCandidatos,
  RelatorioDeRemarketing,
  Template,
} from "./tipos";

/**
 * Leitura do remarketing. A segmentação inteira acontece no banco: é lá que
 * estão a cadência, o consentimento e o histórico de contato, e é lá que a
 * regra "quem não consente não entra" é aplicada (RN-RMKT-006).
 */

const SEM_CANDIDATOS: ListaDeCandidatos = {
  ok: true,
  candidatos: [],
  total_filtrado: 0,
  limite: 50,
  somente_com_consentimento: true,
};

export async function listarCandidatos(
  filtros: FiltrosDeCandidatos = {},
): Promise<ListaDeCandidatos> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("candidatos_de_remarketing", {
    p_filtros: filtros,
  });

  if (error) {
    logger.error("remarketing:listarCandidatos", {
      code: (error as { code?: string }).code,
    });
    return SEM_CANDIDATOS;
  }
  const r = (data ?? {}) as { ok?: boolean };
  if (!r.ok) return SEM_CANDIDATOS;
  return data as ListaDeCandidatos;
}

/**
 * Templates ativos. Projeção direta da tabela, SECURITY INVOKER: quem não tem
 * `remarketing.view` recebe lista vazia pelo RLS, sem erro (03 §33.6).
 */
export async function listarTemplates(): Promise<Template[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("remarketing_templates")
    .select("id, name, message, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    logger.error("remarketing:listarTemplates", {
      code: (error as { code?: string }).code,
    });
    return [];
  }
  return (data as Template[]) ?? [];
}

export async function obterRelatorio(
  chave: ChaveDePeriodo = "30d",
  de?: string,
  ate?: string,
): Promise<RelatorioDeRemarketing | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("relatorio_de_remarketing", {
    p_chave: chave,
    p_de: de ?? null,
    p_ate: ate ?? null,
  });

  if (error) {
    logger.error("remarketing:obterRelatorio", {
      code: (error as { code?: string }).code,
    });
    return null;
  }
  const r = (data ?? {}) as { ok?: boolean };
  if (!r.ok) return null;
  return data as RelatorioDeRemarketing;
}
