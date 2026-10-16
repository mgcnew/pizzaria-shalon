"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fileira rolável de cards (15/10/2026) — para seções com MUITOS itens, como
 * as Promoções, que numa grade viravam uma coluna interminável.
 *
 * ROLAGEM NATIVA, de propósito. Nada de arrastar por JavaScript: o toque do
 * celular rola a fileira pelo próprio navegador, com inércia e encaixe
 * (`scroll-snap`), e o dedo pode começar em cima de uma foto sem brigar com a
 * rolagem da página:
 *   · `touch-action: pan-x pan-y` — o gesto vertical continua rolando a
 *     página, mesmo começando sobre a fileira;
 *   · `overscroll-behavior-x: contain` — chegar ao fim da fileira não dispara
 *     o "voltar" do navegador;
 *   · fotos e links não são arrastáveis, então segurar e puxar uma foto não
 *     abre o gesto de arrastar imagem nem toca o card.
 *
 * Um card sempre aparece cortado na ponta: é o sinal de que há mais. No
 * computador (mouse), setas rolam uma "página".
 */
export function CarrosselDeCards({
  children,
  rotulo,
}: {
  children: ReactNode;
  /** Nome da fileira para leitor de tela (ex.: "Promoções"). */
  rotulo: string;
}) {
  const faixaRef = useRef<HTMLDivElement>(null);
  const [podeVoltar, setPodeVoltar] = useState(false);
  const [podeAvancar, setPodeAvancar] = useState(false);

  const atualizar = useCallback(() => {
    const faixa = faixaRef.current;
    if (!faixa) return;
    setPodeVoltar(faixa.scrollLeft > 4);
    setPodeAvancar(faixa.scrollLeft + faixa.clientWidth < faixa.scrollWidth - 4);
  }, []);

  useEffect(() => {
    atualizar();
    const faixa = faixaRef.current;
    if (!faixa) return;
    const observador = new ResizeObserver(atualizar);
    observador.observe(faixa);
    return () => observador.disconnect();
  }, [atualizar]);

  function rolar(sentido: 1 | -1) {
    const faixa = faixaRef.current;
    if (!faixa) return;
    faixa.scrollBy({ left: sentido * faixa.clientWidth * 0.85, behavior: "smooth" });
  }

  const seta =
    "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-pill border border-border-shalon bg-surface text-[20px] leading-none text-ink shadow-[0_6px_18px_rgb(0_0_0/0.18)] hover:bg-elev [@media(hover:hover)]:flex";

  return (
    <div className="relative">
      <div
        ref={faixaRef}
        role="region"
        aria-label={rotulo}
        tabIndex={0}
        onScroll={atualizar}
        className={[
          "scrollbar-hidden -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto overflow-y-hidden px-4 pb-1 sm:gap-3",
          "[touch-action:pan-x_pan-y] [overscroll-behavior-x:contain] scroll-px-4",
          // Cada filho é um card: largura fixa por faixa, encaixe no início.
          "[&>*]:w-[38%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-[28%] md:[&>*]:w-[22%] lg:[&>*]:w-[17%]",
          // Foto e link não são arrastáveis: segurar e puxar não "pega" a imagem.
          "[&_img]:select-none [&_img]:[-webkit-user-drag:none] [&_a]:[-webkit-user-drag:none]",
        ].join(" ")}
      >
        {children}
      </div>

      {podeVoltar ? (
        <button type="button" aria-label="Ver anteriores" onClick={() => rolar(-1)} className={`${seta} left-1`}>
          ‹
        </button>
      ) : null}
      {podeAvancar ? (
        <button type="button" aria-label="Ver mais" onClick={() => rolar(1)} className={`${seta} right-1`}>
          ›
        </button>
      ) : null}
    </div>
  );
}
