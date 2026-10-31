"use client";

import { COLUNAS, type LinhaComanda } from "@/domain/pedidos/comanda";
import { montarDiebold } from "./diebold";
import { montarEscPos } from "./escpos";
import { ESPACO_FINAL_MM, MARGEM_ESQUERDA_MM, type ImpressoraDoAparelho } from "./impressoraDoAparelho";
import { AREA_UTIL_MM, colunasNaLargura, imprimirLinhas, type FaixaDeImpressao } from "./imprimir";
import { rasterizar } from "./rasterizar";
import { imprimirSerial, PORTA_USB } from "./serial";

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
  // Escolhido à mão na configuração: vale em qualquer modo.
  if (impressora.letrasPorLinha !== "auto") return Number(impressora.letrasPorLinha);
  if (impressora.modo === "serial") return COLUNAS[impressora.papel];
  return colunasNaLargura(faixaDoAparelho(impressora).larguraMm);
}

/**
 * Onde o documento é desenhado no papel: a área medida com a régua, se
 * houver; senão, a área útil padrão menos a margem dos dois lados.
 */
export function faixaDoAparelho(impressora: ImpressoraDoAparelho): FaixaDeImpressao {
  const area = impressora.areaMedida;
  if (area !== null) return { inicioMm: area.inicioMm, larguraMm: area.fimMm - area.inicioMm };
  const margem = MARGEM_ESQUERDA_MM[impressora.margemEsquerda];
  return { inicioMm: margem, larguraMm: AREA_UTIL_MM[impressora.papel] - 2 * margem };
}

export async function imprimirNoAparelho(
  linhas: LinhaComanda[],
  impressora: ImpressoraDoAparelho,
): Promise<void> {
  const espaco = ESPACO_FINAL_MM[impressora.espacoFinal];
  if (impressora.modo === "serial") {
    if (impressora.comandos === "diebold") {
      const imagem = rasterizar(linhas, colunasDoAparelho(impressora));
      await imprimirSerial(montarDiebold(imagem, espaco), PORTA_USB);
      return;
    }
    await imprimirSerial(montarEscPos(linhas, impressora.tabela, espaco));
    return;
  }
  await imprimirLinhas(linhas, impressora.papel, espaco, faixaDoAparelho(impressora));
}
