/**
 * Preferência de tema claro/escuro.
 *
 * Vive em módulo próprio, sem `"use client"`, porque é lido nos DOIS lados:
 * o layout raiz (servidor) usa o nome do cookie para renderizar o `<html>`
 * já no tema certo, e o seletor (cliente) usa o mesmo nome para gravar.
 *
 * Importar esta constante de dentro de um módulo `"use client"` não funciona:
 * o servidor recebe uma referência de cliente no lugar do valor.
 */

export const COOKIE_TEMA = "shalon-tema";

export type Tema = "claro" | "escuro";

/** Lê o valor bruto do cookie, caindo no claro quando ausente ou inválido. */
export function temaDoCookie(valor: string | undefined): Tema {
  return valor === "escuro" ? "escuro" : "claro";
}
