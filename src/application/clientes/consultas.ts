import "server-only";

import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { FichaDeCliente, FiltrosDeClientes, ListaDeClientes } from "./tipos";

/**
 * Leitura de clientes. A classificação vem PRONTA do banco, pela mesma função
 * SQL que a central de atenção e os relatórios usam — uma régua só, para que
 * tela, planilha e dashboard nunca discordem sobre o mesmo cliente.
 */

const LISTA_VAZIA: ListaDeClientes = {
  ok: true,
  clientes: [],
  total_filtrado: 0,
  limite: 50,
  resumo: {
    recorrentes: 0,
    atencao: 0,
    afastados: 0,
    base_fraca: 0,
    dados_insuficientes: 0,
    sem_consentimento: 0,
  },
};

export async function listarClientes(
  filtros: FiltrosDeClientes = {},
): Promise<ListaDeClientes> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("clientes_analiticos", {
    p_filtros: filtros,
  });

  if (error) {
    logger.error("clientes:listarClientes", { code: (error as { code?: string }).code });
    return LISTA_VAZIA;
  }
  const r = (data ?? {}) as { ok?: boolean };
  if (!r.ok) return LISTA_VAZIA;
  return data as ListaDeClientes;
}

export async function obterFicha(clienteId: string): Promise<FichaDeCliente | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("cliente_detalhe", { p_cliente: clienteId });

  if (error) {
    logger.error("clientes:obterFicha", { code: (error as { code?: string }).code });
    return null;
  }
  const r = (data ?? {}) as { ok?: boolean };
  if (!r.ok) return null;
  return data as FichaDeCliente;
}
