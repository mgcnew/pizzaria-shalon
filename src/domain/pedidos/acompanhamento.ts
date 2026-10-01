/**
 * Acompanhamento ao vivo do pedido pelo cliente (D-2026-10-01-108).
 *
 * A página do cliente confere o pedido de tempos em tempos e precisa saber,
 * barato, se algo VISÍVEL mudou. A assinatura junta exatamente o que muda a
 * tela: estado, situação do Pix, total (uma alteração aprovada muda o valor)
 * e a pendência de aprovação da entrega.
 *
 * Domínio puro: sem rede, sem React.
 */

export type ResumoParaAcompanhar = {
  status: string;
  total: number;
  aguarda_aprovacao_entrega: boolean;
  pagamento: { pix_status: string | null };
};

export function assinaturaDoPedido(p: ResumoParaAcompanhar): string {
  return [
    p.status,
    p.pagamento.pix_status ?? "-",
    p.total.toFixed(2),
    p.aguarda_aprovacao_entrega ? "1" : "0",
  ].join("|");
}

/** Estados em que nada mais muda: a página para de conferir. */
const FINAIS = new Set(["completed", "rejected", "cancelled"]);

export function acompanhamentoEncerrado(status: string): boolean {
  return FINAIS.has(status);
}
