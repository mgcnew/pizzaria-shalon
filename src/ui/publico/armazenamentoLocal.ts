"use client";

import {
  CARRINHO_VAZIO,
  lerCarrinho,
  type Carrinho,
} from "@/domain/carrinho/carrinho";
import { lerFavoritos, SEM_FAVORITOS, type Favoritos } from "@/domain/carrinho/favoritos";
import {
  ehTokenValido,
  lerPedidosLocais,
  registrarPedidoLocal,
  SEM_PEDIDOS,
  type PedidoLocal,
} from "@/domain/pedidos/locais";

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
const CHAVE_DISPOSITIVO = "shalon:dispositivo";
const CHAVE_PEDIDOS = "shalon:pedidos";

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
  /** Credencial deste navegador (03 §11). Criada na primeira compra. */
  dispositivo: string | null;
  /** Tokens dos pedidos feitos aqui. Não é histórico do cliente (§29). */
  pedidos: PedidoLocal[];
};

const VAZIO: EstadoLocal = {
  carrinho: CARRINHO_VAZIO,
  favoritos: SEM_FAVORITOS,
  expirou: false,
  hidratado: false,
  dispositivo: null,
  pedidos: SEM_PEDIDOS,
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

  const dispositivoGuardado = lerJson(CHAVE_DISPOSITIVO);

  estado = {
    carrinho,
    favoritos: lerFavoritos(lerJson(CHAVE_FAVORITOS)),
    expirou,
    hidratado: true,
    dispositivo: ehTokenValido(dispositivoGuardado) ? dispositivoGuardado : null,
    pedidos: lerPedidosLocais(lerJson(CHAVE_PEDIDOS)),
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

/**
 * Devolve a credencial deste navegador, criando-a se ainda não existir.
 *
 * 03 §11: é um identificador aleatório, gerado por `crypto`, guardado como
 * hash no banco. Não é login, não carrega dado do cliente e não vale nada em
 * outro aparelho.
 *
 * Só é chamada quando o cliente decide enviar um pedido — visitar o cardápio
 * não marca ninguém.
 */
export function garantirDispositivo(): string | null {
  iniciar();
  if (estado.dispositivo !== null) return estado.dispositivo;
  if (typeof window === "undefined" || !window.crypto?.getRandomValues) return null;

  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  estado = { ...estado, dispositivo: token };
  gravarJson(CHAVE_DISPOSITIVO, token);
  avisar();
  return token;
}

/** Guarda o token de acompanhamento do pedido recém-criado. */
export function registrarPedido(pedido: PedidoLocal): void {
  const pedidos = registrarPedidoLocal(lerEstado().pedidos, pedido);
  estado = { ...estado, pedidos };
  gravarJson(CHAVE_PEDIDOS, pedidos);
  avisar();
}
