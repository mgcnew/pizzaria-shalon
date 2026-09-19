import "server-only";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { PedidoAdministrativo, PedidoNaFila } from "./tipos";

/**
 * Leitura da operação interna.
 *
 * Nenhuma destas funções decide autorização: as projeções são SECURITY
 * INVOKER, então o RLS de `orders` — que exige `orders.view` — continua
 * valendo dentro delas. Quem não tem a permissão recebe lista vazia, e não
 * uma lista escondida pela interface (CLAUDE.md §12).
 */

export async function listarFila(encerrados = false): Promise<PedidoNaFila[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("fila_de_pedidos", { p_encerrados: encerrados });

  if (error) {
    logger.error("pedidos:listarFila", { code: (error as { code?: string }).code });
    return [];
  }
  return (data ?? []) as PedidoNaFila[];
}

export async function obterPedido(id: string): Promise<PedidoAdministrativo | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("pedido_administrativo", { p_order_id: id });

  if (error) {
    logger.error("pedidos:obterPedido", { code: (error as { code?: string }).code });
    return null;
  }
  return (data ?? null) as PedidoAdministrativo | null;
}
