"use client";

import { useSyncExternalStore } from "react";
import type { Papel } from "@/domain/pedidos/comanda";
import type { TabelaDeAcentos } from "./escpos";

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
  /** Fala direto com a impressora Bluetooth pela Web Serial (ESC/POS). */
  | "serial"
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
   * que os outros aparelhos pedirem. Só vale imprimindo direto (sistema ou
   * Bluetooth).
   */
  estacao: boolean;
  /** Tabela de acentos do Bluetooth direto. Escolhida pelo teste de impressão. */
  tabela: TabelaDeAcentos;
  /** Língua da impressora no modo `serial` (D-2026-10-31-180). */
  comandos: ComandosDaImpressora;
  /** Papel em branco depois do documento, antes do corte. */
  espacoFinal: EspacoFinal;
  /** Margem nas duas laterais (o nome do campo ficou da primeira versão). */
  margemEsquerda: MargemEsquerda;
  /**
   * Área de impressão medida com a régua de alinhamento: onde a impressora
   * começa e termina de imprimir, em mm a partir da borda esquerda. Quando
   * existe, vale no lugar da margem.
   */
  areaMedida: AreaMedida | null;
  /**
   * Letras por linha (17/10/2026). "auto" usa a conta de sempre (32 no 58 mm,
   * 42 no 80 mm, ou a da régua). Um número força a largura — para impressora
   * que alcança MENOS do que o padrão e corta o fim das linhas (ex.: a
   * KD-1025 cortando "57,00" em "57,0"). Vale em todos os modos.
   */
  letrasPorLinha: string;
};

export type ComandosDaImpressora =
  /** Térmica comum, como a KD-1025 no Bluetooth. */
  | "escpos"
  /** Diebold IM433T: conjunto próprio, recebe o documento como imagem. */
  | "diebold";

export type AreaMedida = { inicioMm: number; fimMm: number };

/** Área medida que faz sentido: dentro do papel e com pelo menos 30 mm. */
export function areaValida(area: AreaMedida, papel: Papel): boolean {
  return (
    Number.isFinite(area.inicioMm) &&
    Number.isFinite(area.fimMm) &&
    area.inicioMm >= 0 &&
    area.fimMm <= Number(papel) &&
    area.fimMm - area.inicioMm >= 30
  );
}

/**
 * Margem nas laterais (13/10/2026). A área que a cabeça alcança na Diebold
 * IM433TP é mais estreita que os 72 mm previstos e não começa na borda: o
 * documento encostado à esquerda perdia a primeira letra ("enda" em vez de
 * "VENDA"), e só deslocado para a direita passava a cortar do outro lado.
 * A margem vale dos dois lados: o documento fica afastado das duas bordas.
 */
export type MargemEsquerda = "nenhuma" | "pequena" | "media" | "grande";

export const MARGEM_ESQUERDA_MM: Record<MargemEsquerda, number> = {
  nenhuma: 0,
  pequena: 2,
  media: 4,
  grande: 6,
};

/**
 * Espaço no fim do papel (13/10/2026). Impressora com guilhotina, como a
 * Diebold IM433TP do balcão, tem a lâmina alguns milímetros acima da cabeça
 * de impressão: sem papel em branco depois da última linha, o corte passa
 * por cima do fim do documento — que é o QR code do convite.
 */
export type EspacoFinal = "normal" | "medio" | "grande";

export const ESPACO_FINAL_MM: Record<EspacoFinal, number> = { normal: 6, medio: 12, grande: 20 };

export const PADRAO: ImpressoraDoAparelho = {
  papel: "58",
  modo: "tela",
  estacao: false,
  tabela: "cp860",
  comandos: "escpos",
  espacoFinal: "normal",
  margemEsquerda: "nenhuma",
  areaMedida: null,
  letrasPorLinha: "auto",
};

/** Opções de letras por linha para cada papel. */
export const LETRAS_POR_LINHA: Record<Papel, number[]> = {
  "58": [28, 29, 30, 31, 32],
  "80": [38, 40, 42, 44, 46, 48],
};

/** Modos em que este próprio aparelho manda para uma impressora. */
export function imprimeDireto(modo: ModoDeImpressao): boolean {
  return modo === "sistema" || modo === "serial";
}

/**
 * Pode ser o balcão: imprime direto e em 80 mm. O celular manda a comanda
 * já quebrada em 42 colunas, que não cabe num papel de 58.
 */
export function podeSerBalcao(i: Pick<ImpressoraDoAparelho, "modo" | "papel">): boolean {
  return imprimeDireto(i.modo) && i.papel === "80";
}

const CHAVE = "shalon:impressora";

/** O que está guardado é entrada não confiável (CLAUDE.md §36). */
function interpretar(bruto: string | null): ImpressoraDoAparelho {
  if (bruto === null) return PADRAO;
  try {
    const valor: unknown = JSON.parse(bruto);
    if (typeof valor !== "object" || valor === null) return PADRAO;
    const { papel, modo, estacao, tabela, comandos, espacoFinal, margemEsquerda, areaMedida, letrasPorLinha } = valor as Record<
      string,
      unknown
    >;
    const modoLido: ModoDeImpressao =
      modo === "sistema" || modo === "serial" || modo === "balcao" ? modo : "tela";
    const papelLido = papel === "80" ? "80" : "58";
    return {
      papel: papelLido,
      modo: modoLido,
      estacao: estacao === true && podeSerBalcao({ modo: modoLido, papel: papelLido }),
      tabela: tabela === "cp850" || tabela === "sem-acento" ? tabela : "cp860",
      comandos: comandos === "diebold" ? "diebold" : "escpos",
      espacoFinal: espacoFinal === "medio" || espacoFinal === "grande" ? espacoFinal : "normal",
      margemEsquerda:
        margemEsquerda === "pequena" || margemEsquerda === "media" || margemEsquerda === "grande"
          ? margemEsquerda
          : "nenhuma",
      areaMedida: lerAreaMedida(areaMedida, papelLido),
      letrasPorLinha:
        typeof letrasPorLinha === "string" && LETRAS_POR_LINHA[papelLido].includes(Number(letrasPorLinha))
          ? letrasPorLinha
          : "auto",
    };
  } catch {
    return PADRAO;
  }
}

function lerAreaMedida(bruto: unknown, papel: Papel): AreaMedida | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const { inicioMm, fimMm } = bruto as Record<string, unknown>;
  if (typeof inicioMm !== "number" || typeof fimMm !== "number") return null;
  const area = { inicioMm, fimMm };
  return areaValida(area, papel) ? area : null;
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
  const nova = { ...pedida, estacao: pedida.estacao && podeSerBalcao(pedida) };
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
