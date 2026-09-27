"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

export function EstruturaModalPedido({
  titulo,
  subtitulo,
  fecharEm,
  largura = "ampla",
  children,
}: {
  titulo: string;
  subtitulo?: string;
  fecharEm: string;
  largura?: "regular" | "ampla";
  children: React.ReactNode;
}) {
  const router = useRouter();
  const painelRef = useRef<HTMLElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const fechar = useCallback(() => router.replace(fecharEm), [fecharEm, router]);

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fecharRef.current?.focus();

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        fechar();
        return;
      }
      if (evento.key !== "Tab" || !painelRef.current) return;
      const focaveis = Array.from(
        painelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const primeiro = focaveis[0];
      const ultimo = focaveis.at(-1);
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo?.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro?.focus();
      }
    }

    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [fechar]);

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Fechar modal"
        onClick={fechar}
        tabIndex={-1}
        className="motion-backdrop-in absolute inset-0 cursor-default border-0 bg-[var(--shalon-scrim-sheet)]"
      />
      <section
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-pedido-titulo"
        className={[
          "motion-modal-in relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-18 border border-border-shalon bg-surface shadow-[0_22px_70px_rgb(30_24_20/0.28)]",
          largura === "ampla" ? "max-w-[900px]" : "max-w-[640px]",
        ].join(" ")}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border-shalon px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="modal-pedido-titulo" className="m-0 font-display text-[20px] font-extrabold text-ink">
              {titulo}
            </h2>
            {subtitulo ? <p className="mb-0 mt-0.5 text-[12.5px] text-muted">{subtitulo}</p> : null}
          </div>
          <button
            ref={fecharRef}
            type="button"
            aria-label="Fechar"
            onClick={fechar}
            className="flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-11 border border-border-shalon bg-surface text-[22px] leading-none text-ink-2 hover:border-brand-orange hover:text-ink"
          >
            ×
          </button>
        </header>
        <div className="scrollbar-subtle min-h-0 overflow-y-auto bg-bg p-4 sm:p-5">{children}</div>
      </section>
    </div>
  );
}
