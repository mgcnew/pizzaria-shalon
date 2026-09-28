"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { calcularPosicaoPopover, type PosicaoPopover } from "@/ui/posicaoPopover";

/** Portal com posição fixa: não é recortado pelo scroll horizontal da tabela. */
export function usePopoverFixo(
  ancora: RefObject<HTMLElement | null>,
  aberto: boolean,
  largura: number,
  alturaEstimada: number,
  alinhamento: "inicio" | "fim" = "fim",
): PosicaoPopover | null {
  const [posicao, setPosicao] = useState<PosicaoPopover | null>(null);

  useLayoutEffect(() => {
    if (!aberto) return;
    const atualizar = () => {
      const elemento = ancora.current;
      if (!elemento) return;
      const retangulo = elemento.getBoundingClientRect();
      setPosicao(calcularPosicaoPopover(
        retangulo,
        { width: window.innerWidth, height: window.innerHeight },
        largura,
        alturaEstimada,
        alinhamento,
      ));
    };

    atualizar();
    window.addEventListener("resize", atualizar);
    // Captura também o scroll do contêiner horizontal da tabela.
    window.addEventListener("scroll", atualizar, true);
    return () => {
      window.removeEventListener("resize", atualizar);
      window.removeEventListener("scroll", atualizar, true);
    };
  }, [ancora, aberto, largura, alturaEstimada, alinhamento]);

  return aberto ? posicao : null;
}
