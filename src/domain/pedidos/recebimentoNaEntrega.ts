/**
 * Quando se recebe o pagamento de um pedido (D-2026-10-01-110).
 *
 * Na ENTREGA, o normal é o motoboy receber na porta: o recebimento é
 * registrado na volta dele e conciliado no acerto (RN-PGTO-012, RN-PGTO-014,
 * RN-RUN-003). Mas há o cliente que passa na loja, paga e pede para entregar —
 * por isso nada aqui proíbe receber antes: só muda o ponto de partida da tela.
 *
 *   agora              retirada/balcão: recebe-se na hora, na gaveta.
 *   antes_da_entrega   entrega que ainda não saiu: a tela abre em
 *                      "Receber na entrega", com "Cliente já pagou na loja"
 *                      a um toque. Pago aqui, o dinheiro entra na gaveta.
 *   depois_da_saida    saiu ou foi entregue: o que se registra é o que o
 *                      motoboy recebeu — dinheiro "com o motoboy" (fora da
 *                      gaveta) até o acerto.
 *
 * Domínio puro: sem rede, sem React.
 */

export type MomentoDoRecebimento = "agora" | "antes_da_entrega" | "depois_da_saida";

const NA_RUA_OU_ENTREGUE = new Set(["out_for_delivery", "completed"]);

export function momentoDoRecebimento(modalidade: string, status: string): MomentoDoRecebimento {
  if (modalidade !== "delivery") return "agora";
  return NA_RUA_OU_ENTREGUE.has(status) ? "depois_da_saida" : "antes_da_entrega";
}

/** Dinheiro recebido agora entra na gaveta? Só não quando está com o motoboy. */
export function dinheiroNaGavetaPorPadrao(momento: MomentoDoRecebimento): boolean {
  return momento !== "depois_da_saida";
}
