/**
 * Diebold IM433T pela porta USB virtual (D-2026-10-31-180).
 *
 * A IM433T não fala o ESC/POS de `escpos.ts`: no conjunto de comandos de
 * fábrica dela (IM4X3T), `ESC d` liga a altura dupla e `ESC t 3` escolhe a
 * tabela CP437. Por isso tem caminho próprio, com os comandos do Manual do
 * Firmware I4X.51.01.PD5.XX (seção 7.2).
 *
 * O DOCUMENTO VAI COMO IMAGEM. A cabeça tem 576 pontos (72 mm, 72 bytes por
 * linha de pontos). Mandando exatamente isso, não há driver, margem nem
 * tamanho de página do navegador no caminho: não tem como sair cortado, e
 * acentos e QR code não dependem de tabela da impressora.
 */

/** 72 mm a 8 pontos/mm. */
export const PONTOS_DA_CABECA = 576;
export const BYTES_POR_LINHA = PONTOS_DA_CABECA / 8;
export const PONTOS_POR_MM = 8;

/**
 * Papel em branco antes do corte, nunca menos que isto. A lâmina fica acima
 * da cabeça, e `ESC w` corta onde o papel está: com menos, o corte passa por
 * cima do fim do documento (visto no QR do cupom em 13/10/2026).
 */
export const AVANCO_MINIMO_MM = 20;

/** Maior avanço de um `ESC J`: 255 pontos, cerca de 32 mm. */
const AVANCO_MAXIMO_PONTOS = 255;

const ESC = 0x1b;

/** Imagem de 1 bit, uma linha de pontos após a outra. Bit mais alto à esquerda. */
export type ImagemDeImpressao = { altura: number; dados: Uint8Array };

/**
 * Bytes do documento: reinicia, imprime a imagem (`ESC k`), avança o papel
 * (`ESC J`) e corta (`ESC w`). Modelo com serrilha ignora o corte.
 */
export function montarDiebold(imagem: ImagemDeImpressao, espacoFinalMm: number): Uint8Array {
  const { altura, dados } = imagem;
  if (altura < 1 || altura > 0xffff || dados.length !== altura * BYTES_POR_LINHA) {
    throw new RangeError("Imagem fora do formato da cabeça da Diebold.");
  }
  const avanco = Math.min(
    AVANCO_MAXIMO_PONTOS,
    Math.max(espacoFinalMm, AVANCO_MINIMO_MM) * PONTOS_POR_MM,
  );
  const inicio = [ESC, 0x40, ESC, 0x6b, altura & 0xff, altura >> 8];
  const fim = [ESC, 0x4a, avanco, ESC, 0x77];

  const bytes = new Uint8Array(inicio.length + dados.length + fim.length);
  bytes.set(inicio, 0);
  bytes.set(dados, inicio.length);
  bytes.set(fim, inicio.length + dados.length);
  return bytes;
}

/**
 * Pontos por caractere: a letra de `colunas` por linha, em número inteiro de
 * pontos para todas saírem iguais. Linha mais longa que as colunas (comanda
 * que o celular manda ao balcão) encolhe a letra só o necessário.
 */
export function pontosPorCaractere(colunas: number, maisLonga: number): number {
  return Math.floor(PONTOS_DA_CABECA / Math.max(colunas, maisLonga, 1));
}
