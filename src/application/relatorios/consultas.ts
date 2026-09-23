import "server-only";

import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { ChaveDePeriodo } from "@/application/analitico/tipos";
import type { CatalogoDeRelatorios, Relatorio } from "./tipos";

/**
 * Leitura dos relatórios.
 *
 * `paraExportar` não é um detalhe de formatação: ele faz o banco exigir
 * `reports.export` e ampliar o teto de linhas. Quem só pode ver na tela não
 * consegue baixar, mesmo chamando a rota de exportação direto — a checagem
 * está no banco, não no botão (03 §20).
 */

const SEM_CATALOGO: CatalogoDeRelatorios = {
  ok: false,
  relatorios: [],
  pode_exportar: false,
};

export async function listarRelatorios(): Promise<CatalogoDeRelatorios> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("relatorios_disponiveis");

  if (error) {
    logger.error("relatorios:listarRelatorios", {
      code: (error as { code?: string }).code,
    });
    return SEM_CATALOGO;
  }
  return { ...SEM_CATALOGO, ...(data as Partial<CatalogoDeRelatorios>) };
}

export async function obterRelatorio(
  tipo: string,
  chave: ChaveDePeriodo = "30d",
  de?: string | null,
  ate?: string | null,
  paraExportar = false,
): Promise<Relatorio | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("relatorio_tabular", {
    p_tipo: tipo,
    p_chave: chave,
    p_de: de ?? null,
    p_ate: ate ?? null,
    p_filtros: {},
    p_exportar: paraExportar,
  });

  if (error) {
    logger.error("relatorios:obterRelatorio", {
      code: (error as { code?: string }).code,
    });
    return null;
  }
  const r = (data ?? {}) as { ok?: boolean };
  if (!r.ok) return null;
  return data as Relatorio;
}
