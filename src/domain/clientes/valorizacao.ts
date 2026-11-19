/**
 * Reconhecimento do cliente que volta (D-2026-11-19-193).
 *
 * Só palavras: não há prêmio, ponto nem desconto (CLAUDE.md §19 e §46). Os
 * números vêm dos pedidos feitos NESTE navegador (03 §11), e o texto diz
 * "por aqui" para não prometer o que o sistema não sabe.
 *
 * Domínio puro: sem React, sem rede.
 */

/** Pedidos que merecem comemoração. Depois de 100, a cada 50. */
const MARCOS = [1, 5, 10, 25, 50, 100];

export function ehMarco(pedidos: number): boolean {
  if (!Number.isInteger(pedidos) || pedidos < 1) return false;
  return MARCOS.includes(pedidos) || (pedidos > 100 && pedidos % 50 === 0);
}

/**
 * A comemoração de um marco, ou nada. `pedidos` já conta o pedido que
 * acabou de ser enviado.
 */
export function mensagemDoMarco(pedidos: number): { titulo: string; texto: string } | null {
  if (!ehMarco(pedidos)) return null;
  if (pedidos === 1) {
    return {
      titulo: "Seu primeiro pedido com a Shalon por aqui",
      texto: "Que bom ter você com a gente. Tradição desde 1995, agora também no seu celular.",
    };
  }
  return {
    titulo: `Este é o seu ${pedidos}º pedido por aqui`,
    texto: "Obrigado por fazer parte da nossa história. Clientes como você mantêm a Shalon viva desde 1995.",
  };
}

/**
 * O selo do sabor que a pessoa mais pede. "Fã de", e não "Fã nº 1": não há
 * comparação com outros clientes, e o selo não pode afirmar o que não mede.
 */
export function seloDoSabor(sabor: { nome: string; vezes: number } | null): string | null {
  if (sabor === null || sabor.vezes < 3 || sabor.nome.trim() === "") return null;
  return `Fã de ${sabor.nome.trim()}`;
}
