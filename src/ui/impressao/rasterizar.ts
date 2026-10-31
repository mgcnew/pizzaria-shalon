"use client";

import type { LinhaComanda } from "@/domain/pedidos/comanda";
import { caminhoDoQr, MODULO_MM } from "./convite";
import {
  BYTES_POR_LINHA,
  PONTOS_DA_CABECA,
  PONTOS_POR_MM,
  pontosPorCaractere,
  type ImagemDeImpressao,
} from "./diebold";

/**
 * Linhas do documento → imagem de 1 bit na largura da cabeça da Diebold
 * (D-2026-10-31-180).
 *
 * Cada caractere é desenhado na sua casa da grade, então a largura não
 * depende da fonte que o computador tiver. Preto ou branco, sem cinza: a
 * térmica não tem meio-tom, e o limiar deixa a borda da letra nítida.
 */

/** Courier New avança 0,6 em por caractere. */
const AVANCO_DA_FONTE = 0.6;
const ENTRELINHA = 1.3;
const MARGEM_SUPERIOR = 16;
const MARGEM_DO_QR = 8;
const LIMIAR = 150;

export function rasterizar(linhas: LinhaComanda[], colunas: number): ImagemDeImpressao {
  const textos = linhas.filter((l) => l.estilo !== "qrcode");
  const maisLonga = Math.max(1, ...textos.map((l) => Array.from(l.texto).length));
  const avanco = pontosPorCaractere(colunas, maisLonga);
  const fonte = avanco / AVANCO_DA_FONTE;
  const alturaDaLinha = Math.round(fonte * ENTRELINHA);
  const pontosDoModulo = MODULO_MM * PONTOS_POR_MM;

  const qrs = new Map(
    linhas.filter((l) => l.estilo === "qrcode").map((l) => [l.texto, caminhoDoQr(l.texto)]),
  );
  const alturaDe = (l: LinhaComanda) => {
    const qr = l.estilo === "qrcode" ? qrs.get(l.texto) : undefined;
    return qr ? qr.tamanho * pontosDoModulo + MARGEM_DO_QR * 2 : alturaDaLinha;
  };
  const altura = MARGEM_SUPERIOR + linhas.reduce((soma, l) => soma + alturaDe(l), 0);

  const quadro = document.createElement("canvas");
  quadro.width = PONTOS_DA_CABECA;
  quadro.height = altura;
  const ctx = quadro.getContext("2d", { willReadFrequently: true });
  if (ctx === null) throw new Error("O navegador não conseguiu desenhar o documento.");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PONTOS_DA_CABECA, altura);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.font = `700 ${fonte}px "Courier New", Courier, monospace`;
  ctx.textBaseline = "middle";

  // Bloco de texto centralizado na cabeça.
  const inicioX = Math.floor((PONTOS_DA_CABECA - avanco * Math.max(colunas, maisLonga)) / 2);
  let y = MARGEM_SUPERIOR;
  for (const linha of linhas) {
    const qr = linha.estilo === "qrcode" ? qrs.get(linha.texto) : undefined;
    if (qr) {
      const lado = qr.tamanho * pontosDoModulo;
      ctx.save();
      ctx.translate(Math.floor((PONTOS_DA_CABECA - lado) / 2), y + MARGEM_DO_QR);
      ctx.scale(pontosDoModulo, pontosDoModulo);
      ctx.fill(new Path2D(qr.d));
      ctx.restore();
    } else {
      const forte = linha.estilo === "titulo" || linha.estilo === "destaque";
      Array.from(linha.texto).forEach((caractere, i) => {
        const x = inicioX + i * avanco;
        ctx.fillText(caractere, x, y + alturaDaLinha / 2);
        if (forte) ctx.strokeText(caractere, x, y + alturaDaLinha / 2);
      });
    }
    y += alturaDe(linha);
  }

  return { altura, dados: paraUmBit(ctx.getImageData(0, 0, PONTOS_DA_CABECA, altura).data, altura) };
}

function paraUmBit(rgba: Uint8ClampedArray, altura: number): Uint8Array {
  const dados = new Uint8Array(altura * BYTES_POR_LINHA);
  for (let linha = 0; linha < altura; linha++) {
    for (let x = 0; x < PONTOS_DA_CABECA; x++) {
      if ((rgba[(linha * PONTOS_DA_CABECA + x) * 4] ?? 255) < LIMIAR) {
        dados[linha * BYTES_POR_LINHA + (x >> 3)]! |= 0x80 >> (x & 7);
      }
    }
  }
  return dados;
}
