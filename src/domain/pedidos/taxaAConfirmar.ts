/**
 * Pedido do cliente enviado com a taxa de entrega a confirmar pela loja
 * (D-2026-10-17-149, migration 0164).
 *
 * O endereço do pedido carrega `taxa_a_confirmar`, o teto que o cliente viu
 * (`taxa_teto`) e, depois da aprovação, a taxa definida (`taxa_definida`).
 * Devolve o teto enquanto a taxa ainda não foi definida; `null` nos demais
 * casos — inclusive pedido normal, retirada ou taxa já definida.
 */
export function tetoDaTaxaAConfirmar(endereco: Record<string, unknown> | null | undefined): number | null {
  if (!endereco) return null;
  const marcado = endereco["taxa_a_confirmar"] === true || endereco["taxa_a_confirmar"] === "true";
  if (!marcado) return null;
  const definida = endereco["taxa_definida"];
  if (definida !== null && definida !== undefined && definida !== "") return null;
  const teto = Number(endereco["taxa_teto"]);
  return Number.isFinite(teto) ? teto : null;
}
