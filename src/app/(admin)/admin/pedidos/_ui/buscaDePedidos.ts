import { semAcento } from "@/domain/catalogo/buscaDeSabor";

/**
 * Busca na fila de pedidos, por número ou nome do cliente (D-2026-11-19-188).
 *
 * A fila já chega inteira do servidor (`fila_de_pedidos` não tem `limit`, e
 * os encerrados vêm pela janela carregada), então filtrar aqui é exato e não
 * custa uma consulta por tecla. É só apresentação: esconder uma linha não
 * muda nada do pedido, e as ações continuam as do banco.
 *
 * - Só algarismos (com ou sem `#`): número do pedido COMEÇANDO por eles, que
 *   é como o balcão fala ("o trinta e três oitocentos…").
 * - Qualquer outra coisa: cada palavra precisa aparecer no nome do cliente,
 *   sem acento e sem caixa.
 */
export function filtrarPedidosPorBusca<T extends { numero: number; cliente: string }>(
  pedidos: readonly T[],
  termo: string,
): T[] {
  const limpo = termo.trim();
  if (limpo === "") return [...pedidos];

  const numero = limpo.replace(/^#/, "").trim();
  if (/^\d+$/.test(numero)) {
    return pedidos.filter((p) => String(p.numero).startsWith(numero));
  }

  const palavras = semAcento(limpo).split(/\s+/);
  return pedidos.filter((p) => {
    const nome = semAcento(p.cliente);
    return palavras.every((palavra) => nome.includes(palavra));
  });
}
