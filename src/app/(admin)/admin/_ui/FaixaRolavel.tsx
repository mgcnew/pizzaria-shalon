"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fileira de chips/links que no celular vira uma faixa de rolagem lateral, em
 * vez de ocupar metade da tela quebrando em várias linhas; do `md` para cima
 * volta a quebrar linha normalmente.
 *
 * O item atual (`aria-current`) é centralizado ao montar: sem isso, quem abre
 * "Sessões de caixa" num celular não vê qual relatório está selecionado.
 */
export function FaixaRolavel({
  children,
  rotulo,
  className = "",
}: {
  children: ReactNode;
  rotulo: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const faixa = ref.current;
    const atual = faixa?.querySelector<HTMLElement>("[aria-current]");
    if (!faixa || !atual || faixa.scrollWidth <= faixa.clientWidth) return;
    faixa.scrollLeft = atual.offsetLeft - (faixa.clientWidth - atual.offsetWidth) / 2;
  }, []);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={rotulo}
      className={[
        "relative flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "md:flex-wrap md:overflow-visible md:pb-0",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
