/**
 * Pedidos guardados neste navegador.
 *
 * CLAUDE.md §29 · 03-RLS-RBAC-SEGURANCA.md §10 e §11
 *
 * "Meus Pedidos usa mecanismo seguro persistente no mesmo navegador." É
 * isto: a lista de tokens que ESTE dispositivo recebeu ao criar cada pedido.
 *
 * O que NÃO é: um login, nem um histórico do cliente. Quem abrir o sistema
 * em outro aparelho não vê nada — e a interface não promete que veria. Não
 * existe, em lugar nenhum, "informe seu WhatsApp e veja seus pedidos".
 *
 * Domínio puro: sem React, sem rede, sem `localStorage`.
 */

export type PedidoLocal = {
  /** Token de acompanhamento. Só isto dá acesso, e só àquele pedido. */
  token: string;
  numero: number;
  criadoEm: number;
};

export const SEM_PEDIDOS: PedidoLocal[] = [];

/** Guardar tudo para sempre não serve a ninguém; os recentes bastam. */
export const MAXIMO_GUARDADO = 20;

/** Token de acompanhamento: 64 caracteres hexadecimais (SHA-256 em hex). */
const FORMATO_TOKEN = /^[0-9a-f]{64}$/;

/** Token de dispositivo: mesmo formato, propósito diferente. */
export function ehTokenValido(valor: unknown): valor is string {
  return typeof valor === "string" && FORMATO_TOKEN.test(valor);
}

/**
 * Lê a lista guardada tratando o conteúdo como entrada não confiável.
 *
 * O que estiver malformado é descartado em silêncio: armazenamento local é
 * editável por quem quiser, e um token inventado não abre pedido nenhum de
 * qualquer forma — o banco compara o hash.
 */
export function lerPedidosLocais(bruto: unknown): PedidoLocal[] {
  if (!Array.isArray(bruto)) return SEM_PEDIDOS;

  const validos: PedidoLocal[] = [];
  for (const item of bruto) {
    if (typeof item !== "object" || item === null) continue;
    const { token, numero, criadoEm } = item as Record<string, unknown>;
    if (!ehTokenValido(token)) continue;
    if (typeof numero !== "number" || !Number.isInteger(numero) || numero <= 0) continue;
    if (typeof criadoEm !== "number" || !Number.isFinite(criadoEm)) continue;
    if (validos.some((p) => p.token === token)) continue;
    validos.push({ token, numero, criadoEm });
  }

  return ordenar(validos).slice(0, MAXIMO_GUARDADO);
}

/**
 * Registra um pedido recém-criado.
 *
 * Reenvio da mesma tentativa devolve o mesmo token (ele é derivado da chave
 * de idempotência), então repetir não duplica a linha.
 */
export function registrarPedidoLocal(
  atual: PedidoLocal[],
  novo: PedidoLocal,
): PedidoLocal[] {
  if (!ehTokenValido(novo.token)) return atual;
  const semDuplicata = atual.filter((p) => p.token !== novo.token);
  return ordenar([novo, ...semDuplicata]).slice(0, MAXIMO_GUARDADO);
}

/** Mais recente primeiro; empate resolvido pelo número do pedido. */
function ordenar(pedidos: PedidoLocal[]): PedidoLocal[] {
  return [...pedidos].sort((a, b) => b.criadoEm - a.criadoEm || b.numero - a.numero);
}
