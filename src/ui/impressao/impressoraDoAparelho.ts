"use client";

import { useSyncExternalStore } from "react";
import type { Papel } from "@/domain/pedidos/comanda";

/**
 * Impressora DESTE aparelho (D-2026-10-08-116).
 *
 * A impressora está fisicamente ligada a um aparelho — o notebook do balcão
 * com a 80 mm no USB, o celular com a 58 mm no Bluetooth — e o navegador só
 * alcança o que está ligado nele. Por isso a configuração é do aparelho, e
 * não da loja: gravar no banco faria o celular tentar imprimir em papel de
 * 80 mm que ele não tem.
 *
 * Fica no armazenamento local do navegador. Pode sumir (aba anônima, dados
 * limpos): nesse caso volta ao padrão, que é o comportamento de antes desta
 * configuração existir — conferir na tela, em 58 mm. Nada de domínio depende
 * disto; muda só a largura do texto e o caminho até o papel.
 */

export type ModoDeImpressao =
  /** Mostra o documento na tela. Quem imprime é a pessoa, por fora. */
  | "tela"
  /** Manda para a impressora padrão do sistema operacional deste aparelho. */
  | "sistema"
  /**
   * Pede ao aparelho do balcão que imprima na 80 mm dele. Para o celular,
   * que não alcança a impressora USB do notebook.
   */
  | "balcao";

export type ImpressoraDoAparelho = {
  papel: Papel;
  modo: ModoDeImpressao;
  /**
   * Este aparelho É a impressora do balcão: com o painel aberto, imprime o
   * que os outros aparelhos pedirem. Só vale imprimindo direto no sistema.
   */
  estacao: boolean;
};

export const PADRAO: ImpressoraDoAparelho = { papel: "58", modo: "tela", estacao: false };

const CHAVE = "shalon:impressora";

/** O que está guardado é entrada não confiável (CLAUDE.md §36). */
function interpretar(bruto: string | null): ImpressoraDoAparelho {
  if (bruto === null) return PADRAO;
  try {
    const valor: unknown = JSON.parse(bruto);
    if (typeof valor !== "object" || valor === null) return PADRAO;
    const { papel, modo, estacao } = valor as Record<string, unknown>;
    const modoLido: ModoDeImpressao =
      modo === "sistema" || modo === "balcao" ? modo : "tela";
    return {
      papel: papel === "80" ? "80" : "58",
      modo: modoLido,
      estacao: estacao === true && modoLido === "sistema",
    };
  } catch {
    return PADRAO;
  }
}

let atual: ImpressoraDoAparelho | null = null;
const ouvintes = new Set<() => void>();

function ler(): ImpressoraDoAparelho {
  if (atual !== null) return atual;
  try {
    atual = interpretar(window.localStorage.getItem(CHAVE));
  } catch {
    atual = PADRAO;
  }
  return atual;
}

/** Grava e avisa quem está olhando. Devolve falso se o navegador recusou. */
export function salvarImpressoraDoAparelho(pedida: ImpressoraDoAparelho): boolean {
  // Ser o balcão sem imprimir direto não faz sentido: o pedido seria pego e
  // nada sairia no papel.
  const nova = { ...pedida, estacao: pedida.estacao && pedida.modo === "sistema" };
  atual = nova;
  ouvintes.forEach((avisar) => avisar());
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(nova));
    return true;
  } catch {
    return false;
  }
}

function assinar(avisar: () => void): () => void {
  ouvintes.add(avisar);
  // Outra aba do mesmo aparelho mudou a configuração.
  const aoMudarEmOutraAba = (e: StorageEvent) => {
    if (e.key !== CHAVE) return;
    atual = interpretar(e.newValue);
    avisar();
  };
  window.addEventListener("storage", aoMudarEmOutraAba);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener("storage", aoMudarEmOutraAba);
  };
}

/**
 * Configuração atual. No servidor, e até o navegador ler o que guardou,
 * devolve o padrão — sem divergência de hidratação.
 */
export function useImpressoraDoAparelho(): ImpressoraDoAparelho {
  return useSyncExternalStore(assinar, ler, () => PADRAO);
}
