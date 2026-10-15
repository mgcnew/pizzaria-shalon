"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Popup de abertura do cardápio (D-2026-10-15-127).
 *
 * Aparece quando a pessoa entra, com a arte em retrato (1:2) do banner e, se
 * o banner tem destino, o botão para ir até o item. Quem decide se existe
 * popup é o servidor: só chega aqui um banner VISÍVEL e COM imagem de popup.
 *
 * Uma vez por dia, por banner, neste aparelho: quem fechou não é
 * interrompido de novo no mesmo dia, e um banner novo aparece na hora.
 */

const semInscricao = () => () => {};

function hoje(): string {
  return new Date().toLocaleDateString("sv-SE");
}

function jaVisto(chave: string): boolean {
  try {
    return window.localStorage.getItem(chave) === hoje();
  } catch {
    return false;
  }
}

function marcarVisto(chave: string) {
  try {
    window.localStorage.setItem(chave, hoje());
  } catch {
    // Sem armazenamento, só vale nesta visita.
  }
}

export function PopupDeAbertura({
  bannerId,
  imagemUrl,
  titulo,
  href,
  externo,
}: {
  bannerId: string;
  imagemUrl: string;
  titulo: string | null;
  href: string | null;
  externo: boolean;
}) {
  const chave = `shalon:popup:${bannerId}`;
  // No servidor, "já visto": o popup só nasce depois da hidratação.
  const visto = useSyncExternalStore(
    semInscricao,
    () => jaVisto(chave),
    () => true,
  );
  const [fechado, setFechado] = useState(false);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const aberto = !visto && !fechado;

  function fechar() {
    marcarVisto(chave);
    setFechado(true);
  }

  useEffect(() => {
    if (!aberto) return;
    fecharRef.current?.focus();
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        marcarVisto(chave);
        setFechado(true);
      }
    };
    document.addEventListener("keydown", aoTecla);
    return () => document.removeEventListener("keydown", aoTecla);
  }, [aberto, chave]);

  if (!aberto) return null;

  const rotulo = titulo ?? "Promoção";

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={fechar}
        className="motion-backdrop-in absolute inset-0 cursor-default border-0 bg-[var(--shalon-scrim-drawer)]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        className="motion-popover-in relative flex w-[min(320px,calc(100vw-32px))] flex-col gap-3"
      >
        <button
          ref={fecharRef}
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          className="absolute -top-3 -right-3 z-10 flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-pill border border-border-shalon bg-surface text-[22px] leading-none text-ink shadow-[0_6px_18px_rgb(0_0_0/0.25)]"
        >
          ×
        </button>

        <div className="relative aspect-[1/2] max-h-[72svh] w-full overflow-hidden rounded-20 bg-elev shadow-[0_16px_42px_rgb(0_0_0/0.35)]">
          <Image
            src={imagemUrl}
            alt={rotulo}
            fill
            sizes="320px"
            priority
            className="object-cover"
          />
        </div>

        {href ? (
          externo ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={fechar}
              className="flex min-h-[52px] items-center justify-center rounded-14 bg-cta px-4 text-[16px] font-bold text-cta-fg no-underline shadow-cta"
            >
              Ver agora
            </a>
          ) : (
            <Link
              href={href}
              onClick={fechar}
              className="flex min-h-[52px] items-center justify-center rounded-14 bg-cta px-4 text-[16px] font-bold text-cta-fg no-underline shadow-cta"
            >
              Ver agora
            </Link>
          )
        ) : null}
      </div>
    </div>
  );
}
