import "server-only";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import { formatarEspera, minutosDesde } from "@/lib/format";
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

/**
 * Quanto cada pedido da fila já esperou, por id.
 *
 * MORA AQUI, e não na página, por duas razões que apontam para o mesmo lugar:
 *
 *  - ler o relógio é preparo de DADO, não renderização. Um componente que
 *    chama `Date.now()` durante o render deixa de ser puro, e o
 *    `react-hooks/purity` recusa — com razão;
 *  - o relógio tem de ser o do SERVIDOR. O navegador de um balcão pode estar
 *    com a hora errada, e dois aparelhos veriam filas diferentes. É o mesmo
 *    princípio de `pedidos_a_receber`, que calcula `idade_minutos` no banco.
 *
 * Uma âncora só para a lista inteira: pedidos da mesma consulta têm de ser
 * medidos contra o mesmo instante, senão o primeiro e o último da lista
 * respondem a relógios diferentes.
 */
export function esperaDaFila(pedidos: PedidoNaFila[]): Record<string, string> {
  const agora = Date.now();
  return Object.fromEntries(
    pedidos.map((p) => [p.id, formatarEspera(minutosDesde(p.criado_em, agora))]),
  );
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
