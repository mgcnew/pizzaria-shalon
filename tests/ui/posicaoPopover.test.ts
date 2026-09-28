import { describe, expect, it } from "vitest";
import { calcularPosicaoPopover } from "../../src/ui/posicaoPopover";

describe("posição de menus fora da tabela", () => {
  it("abre acima quando a última linha não tem espaço abaixo", () => {
    const posicao = calcularPosicaoPopover(
      { top: 600, bottom: 644, left: 850, right: 894 },
      { width: 920, height: 700 },
      220,
      150,
      "fim",
    );
    expect(posicao.top).toBeLessThan(600);
    expect(posicao.left).toBeGreaterThanOrEqual(8);
    expect(posicao.left + 220).toBeLessThanOrEqual(912);
  });

  it("abre abaixo e limita a posição horizontal quando há espaço", () => {
    const posicao = calcularPosicaoPopover(
      { top: 100, bottom: 144, left: 4, right: 36 },
      { width: 320, height: 700 },
      280,
      160,
      "inicio",
    );
    expect(posicao.top).toBe(148);
    expect(posicao.left).toBe(8);
  });
});
