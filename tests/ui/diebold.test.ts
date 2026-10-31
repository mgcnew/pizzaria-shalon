import { describe, expect, it } from "vitest";
import { BYTES_POR_LINHA, montarDiebold, pontosPorCaractere } from "@/ui/impressao/diebold";

const imagem = (altura: number) => ({ altura, dados: new Uint8Array(altura * BYTES_POR_LINHA).fill(0xaa) });

describe("Diebold IM433T pela porta USB (D-2026-10-31-180)", () => {
  it("a cabeça recebe 72 bytes por linha de pontos", () => {
    expect(BYTES_POR_LINHA).toBe(72);
  });

  it("reinicia, manda a imagem com ESC k, avança e corta com ESC w", () => {
    const bytes = Array.from(montarDiebold(imagem(300), 20));
    expect(bytes.slice(0, 6)).toEqual([0x1b, 0x40, 0x1b, 0x6b, 300 & 0xff, 300 >> 8]);
    expect(bytes.length).toBe(6 + 300 * 72 + 5);
    expect(bytes.slice(-5)).toEqual([0x1b, 0x4a, 160, 0x1b, 0x77]);
  });

  it("nunca corta com menos de 20 mm de avanço, mesmo no espaço Normal", () => {
    expect(Array.from(montarDiebold(imagem(1), 6)).slice(-5, -2)).toEqual([0x1b, 0x4a, 160]);
  });

  it("o avanço não passa do limite de um byte", () => {
    expect(Array.from(montarDiebold(imagem(1), 200)).slice(-3)[0]).toBe(255);
  });

  it("recusa imagem que não tem a largura da cabeça", () => {
    expect(() => montarDiebold({ altura: 2, dados: new Uint8Array(100) }, 20)).toThrow(RangeError);
  });

  it("42 colunas ocupam a cabeça em pontos inteiros, e linha longa encolhe a letra", () => {
    expect(pontosPorCaractere(42, 30)).toBe(13);
    expect(pontosPorCaractere(42, 48)).toBe(12);
  });
});
