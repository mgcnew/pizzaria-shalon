"use client";

import { COLUNAS, type LinhaComanda } from "@/domain/pedidos/comanda";
import { montarEscPos } from "./escpos";
import { ESPACO_FINAL_MM, MARGEM_ESQUERDA_MM, type ImpressoraDoAparelho } from "./impressoraDoAparelho";
import { AREA_UTIL_MM, colunasNaLargura, imprimirLinhas } from "./imprimir";
import { imprimirSerial } from "./serial";

/**
 * Manda o documento pela impressora configurada NESTE aparelho
 * (D-2026-10-08-116). Um ponto só para a comanda, o balcão e o teste de
 * impressão não decidirem o caminho cada um do seu jeito.
 *
 * Só para os modos que imprimem aqui (`sistema` e `serial`). Lança erro se
 * não conseguiu entregar à impressora.
 */
/**
 * Quantas colunas o documento deve ter para ESTE aparelho.
 *
 * - Bluetooth direto: as colunas da fonte da impressora (32 no 58 mm);
 * - impressão pelo sistema: as que cabem, com a letra fixa, na largura que
 *   sobra depois das margens (`colunasNaLargura`).
 */
export function colunasDoAparelho(impressora: ImpressoraDoAparelho): number {
  if (impressora.modo === "serial") return COLUNAS[impressora.papel];
  const margem = MARGEM_ESQUERDA_MM[impressora.margemEsquerda];
  return colunasNaLargura(AREA_UTIL_MM[impressora.papel] - 2 * margem);
}

export async function imprimirNoAparelho(
  linhas: LinhaComanda[],
  impressora: ImpressoraDoAparelho,
): Promise<void> {
  const espaco = ESPACO_FINAL_MM[impressora.espacoFinal];
  if (impressora.modo === "serial") {
    await imprimirSerial(montarEscPos(linhas, impressora.tabela, espaco));
    return;
  }
  await imprimirLinhas(linhas, impressora.papel, espaco, MARGEM_ESQUERDA_MM[impressora.margemEsquerda]);
}
