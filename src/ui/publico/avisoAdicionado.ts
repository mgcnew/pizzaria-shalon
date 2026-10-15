"use client";

import { useSyncExternalStore } from "react";

/**
 * Aviso "acabou de entrar no carrinho" (D-2026-09-28-85).
 *
 * Quem adiciona — o configurador da página de produto ou o "+" de um toque
 * do card — só ANUNCIA. Quem mostra é o painel de confirmação do shell
 * público. Assim existe um único jeito de confirmar uma adição, venha ela de
 * onde vier.
 *
 * Vive só na memória da aba: não é estado do carrinho, é um momento. Recarregar
 * a página não deve reabrir a confirmação de algo adicionado antes.
 */

export type AvisoAdicionado = {
  /** Muda a cada adição, para o painel reabrir mesmo com o mesmo produto. */
  id: number;
  nome: string;
  /**
   * `produto`: veio da página do produto — "continuar escolhendo" leva de
   * volta ao cardápio. `cardapio`: veio do card — o cliente já está nele.
   */
  origem: "produto" | "cardapio";
  /** Pizza, fogazza ou combo sem bebida no carrinho: o painel lembra da bebida. */
  sugerirBebida: boolean;
};

/**
 * Já entrou uma bebida (ou item de um toque) nesta visita? Então não se
 * lembra de novo. Vive só na memória da aba, como o aviso.
 */
let bebidaNaVisita = false;

let atual: AvisoAdicionado | null = null;
let sequencia = 0;
const ouvintes = new Set<() => void>();

function avisar() {
  for (const ouvinte of ouvintes) ouvinte();
}

export function anunciarAdicionado(
  nome: string,
  origem: AvisoAdicionado["origem"],
  /** `refeicao`: pizza, fogazza ou combo. `rapido`: item de um toque (bebida). */
  natureza: "refeicao" | "rapido" | "outro" = "outro",
) {
  if (natureza === "rapido") bebidaNaVisita = true;
  sequencia += 1;
  atual = { id: sequencia, nome, origem, sugerirBebida: natureza === "refeicao" && !bebidaNaVisita };
  avisar();
}

export function dispensarAviso() {
  if (atual === null) return;
  atual = null;
  avisar();
}

function inscrever(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function useAvisoAdicionado() {
  return useSyncExternalStore(
    inscrever,
    () => atual,
    () => null,
  );
}
