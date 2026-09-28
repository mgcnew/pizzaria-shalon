export type PosicaoPopover = { top: number; left: number; maxHeight: number };

/** Posiciona sem sair da viewport e prefere abrir acima quando falta altura. */
export function calcularPosicaoPopover(
  ancora: { top: number; bottom: number; left: number; right: number },
  viewport: { width: number; height: number },
  largura: number,
  alturaEstimada: number,
  alinhamento: "inicio" | "fim",
): PosicaoPopover {
  const margem = 8;
  const larguraDisponivel = Math.min(largura, viewport.width - margem * 2);
  const espacoAbaixo = viewport.height - ancora.bottom - margem;
  const espacoAcima = ancora.top - margem;
  const acima = espacoAbaixo < Math.min(alturaEstimada, 180) && espacoAcima > espacoAbaixo;
  const alturaDisponivel = acima ? espacoAcima : espacoAbaixo;
  const esquerdaDesejada = alinhamento === "fim"
    ? ancora.right - larguraDisponivel
    : ancora.left;
  return {
    left: Math.max(margem, Math.min(esquerdaDesejada, viewport.width - larguraDisponivel - margem)),
    top: acima
      ? Math.max(margem, ancora.top - Math.min(alturaEstimada, alturaDisponivel) - 4)
      : ancora.bottom + 4,
    maxHeight: Math.max(80, alturaDisponivel - 4),
  };
}
