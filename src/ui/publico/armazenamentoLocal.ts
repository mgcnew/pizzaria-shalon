"use client";

import {
  CARRINHO_VAZIO,
  lerCarrinho,
  type Carrinho,
} from "@/domain/carrinho/carrinho";
import { lerFavoritos, SEM_FAVORITOS, type Favoritos } from "@/domain/carrinho/favoritos";

/**
 * Armazenamento local do cliente público.
 *
 * RN-FAV-001 e RN-CART-001: favoritos e carrinho vivem no navegador. Não há
 * conta, não há login e NÃO há sincronização entre dispositivos — e a
 * interface não promete nenhuma das três coisas.
 *
 * Store fora do React, consumido por `useSyncExternalStore`. Assim o
 * servidor renderiza com estado vazio, o cliente re-renderiza com o que
 * estava guardado, e não há divergência de hidratação.
 *
 * Tudo que sai daqui passou pelos leitores do domínio, que tratam o conteúdo
 * guardado como entrada não confiável (CLAUDE.md §36).
 */

const CHAVE_CARRINHO = "shalon:carrinho";
const CHAVE_FAVORITOS = "shalon:favoritos";

export type EstadoLocal = {
  carrinho: Carrinho;
  favoritos: Favoritos;
  /** Verdadeiro quando o carrinho guardado passou do TTL e foi descartado. */
  expirou: boolean;
  /**
   * Falso enquanto o navegador ainda não leu o armazenamento local — o que
   * inclui a renderização no servidor. A tela usa isto para não piscar
   * "nenhum favorito" antes de saber se há algum.
   */
  hidratado: boolean;
};

const VAZIO: EstadoLocal = {
  carrinho: CARRINHO_VAZIO,
  favoritos: SEM_FAVORITOS,
  expirou: false,
  hidratado: false,
};

let estado: EstadoLocal = VAZIO;
let iniciado = false;
let ouvintes: (() => void)[] = [];

function lerJson(chave: string): unknown {
  try {
    const bruto = window.localStorage.getItem(chave);
    return bruto === null ? null : JSON.parse(bruto);
  } catch {
    // Armazenamento bloqueado ou JSON corrompido: segue sem nada guardado.
    return null;
  }
}

function gravarJson(chave: string, valor: unknown): void {
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem persistência, vale só esta visita. Não é erro de aplicação.
  }
}

function iniciar(): void {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;

  const agora = Date.now();
  const guardado = lerJson(CHAVE_CARRINHO);
  const carrinho = lerCarrinho(guardado, agora);

  // RN-CART-001: descarte previsível. Se havia itens guardados e a leitura
  // devolveu vazio, foi o TTL — e o cliente precisa ser avisado, não
  // descobrir sozinho que o carrinho sumiu.
  const tinhaItens =
    typeof guardado === "object" &&
    guardado !== null &&
    Array.isArray((guardado as { itens?: unknown }).itens) &&
    ((guardado as { itens: unknown[] }).itens.length > 0);

  const expirou = tinhaItens && carrinho.itens.length === 0;
  if (expirou) gravarJson(CHAVE_CARRINHO, carrinho);

  estado = {
    carrinho,
    favoritos: lerFavoritos(lerJson(CHAVE_FAVORITOS)),
    expirou,
    hidratado: true,
  };
}

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

export function inscrever(aoMudar: () => void): () => void {
  iniciar();
  ouvintes = [...ouvintes, aoMudar];
  return () => {
    ouvintes = ouvintes.filter((o) => o !== aoMudar);
  };
}

export function lerEstado(): EstadoLocal {
  iniciar();
  return estado;
}

/** No servidor não existe armazenamento local. */
export function estadoNoServidor(): EstadoLocal {
  return VAZIO;
}

export function definirCarrinho(carrinho: Carrinho): void {
  estado = { ...estado, carrinho, expirou: false };
  gravarJson(CHAVE_CARRINHO, carrinho);
  avisar();
}

export function definirFavoritos(favoritos: Favoritos): void {
  estado = { ...estado, favoritos };
  gravarJson(CHAVE_FAVORITOS, favoritos);
  avisar();
}

/** Some com o aviso de expiração depois que o cliente o viu. */
export function reconhecerExpiracao(): void {
  if (!estado.expirou) return;
  estado = { ...estado, expirou: false };
  avisar();
}
