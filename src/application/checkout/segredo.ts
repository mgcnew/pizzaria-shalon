import "server-only";
import { createHmac } from "node:crypto";

/**
 * Segredo de origem servidor → banco (CLAUDE.md §13, §16, §45).
 *
 * `server-only`: se algum componente de cliente importar este módulo, o build
 * quebra. É a garantia mecânica de que o segredo não entra no bundle.
 *
 * Ele NÃO é `service_role` e não concede acesso a nada. Prova apenas que a
 * chamada partiu do nosso servidor — o que é o que permite `criar_pedido`
 * aceitar uma distância de rota sem confiar no navegador.
 */

export class SegredoAusente extends Error {
  constructor() {
    super("SHALON_CHECKOUT_ORIGIN_SECRET não está configurada.");
    this.name = "SegredoAusente";
  }
}

export function lerSegredoDeOrigem(): string {
  const valor = process.env.SHALON_CHECKOUT_ORIGIN_SECRET?.trim();
  if (!valor) throw new SegredoAusente();
  return valor;
}

export function checkoutConfigurado(): boolean {
  return Boolean(process.env.SHALON_CHECKOUT_ORIGIN_SECRET?.trim());
}

/**
 * Token de acompanhamento do pedido.
 *
 * Derivado da chave de idempotência por HMAC, e não sorteado. Assim o
 * reenvio da MESMA tentativa — clique duplo, retry de rede — produz o mesmo
 * token, e o cliente cai no mesmo link em vez de perder o acesso ao pedido
 * que acabou de criar.
 *
 * Imprevisível para quem não tem o segredo, que é o que RN-PED-004 exige:
 * o banco guarda só o SHA-256 dele, nunca o valor.
 */
export function tokenDeAcompanhamento(idempotencyKey: string): string {
  return createHmac("sha256", lerSegredoDeOrigem())
    .update(`tracking:${idempotencyKey}`)
    .digest("hex");
}
