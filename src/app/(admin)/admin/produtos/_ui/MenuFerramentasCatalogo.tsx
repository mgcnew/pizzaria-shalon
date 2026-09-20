"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Ferramenta = { nome: string; valor: string };

export function MenuFerramentasCatalogo({
  ferramentas,
  atual,
}: {
  ferramentas: readonly Ferramenta[];
  atual?: string | undefined;
}) {
  const [aberto, setAberto] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;

    function fecharAoClicarFora(evento: PointerEvent) {
      if (!raizRef.current?.contains(evento.target as Node)) setAberto(false);
    }

    function fecharComEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }

    document.addEventListener("pointerdown", fecharAoClicarFora);
    document.addEventListener("keydown", fecharComEscape);
    return () => {
      document.removeEventListener("pointerdown", fecharAoClicarFora);
      document.removeEventListener("keydown", fecharComEscape);
    };
  }, [aberto]);

  return (
    <div ref={raizRef} className="relative z-40 shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-11 border-[1.5px] border-border-shalon bg-surface px-[14px] text-[14px] font-semibold text-ink transition-colors hover:border-brand-orange"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" className="h-5 w-5">
          <circle cx="5" cy="12" r="1.7" fill="currentColor" />
          <circle cx="12" cy="12" r="1.7" fill="currentColor" />
          <circle cx="19" cy="12" r="1.7" fill="currentColor" />
        </svg>
        Mais
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          width="16"
          height="16"
          className={["h-4 w-4 transition-transform", aberto ? "rotate-180" : ""].join(" ")}
        >
          <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto ? (
        <div
          role="menu"
          aria-label="Ferramentas do cardápio"
          className="absolute right-0 top-[calc(100%+8px)] w-[min(290px,calc(100vw-32px))] overflow-hidden rounded-14 border border-border-shalon bg-surface p-2 shadow-[0_14px_38px_rgb(30_24_20/0.16)]"
        >
          <p className="m-0 px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Configurar cardápio
          </p>
          <div className="grid grid-cols-2 gap-1">
            {ferramentas.map((ferramenta) => {
              const ativa = ferramenta.valor === atual;
              return (
                <Link
                  key={ferramenta.valor}
                  href={`/admin/produtos?aba=${ferramenta.valor}`}
                  role="menuitem"
                  onClick={() => setAberto(false)}
                  className={[
                    "flex min-h-touch items-center rounded-10 px-3 text-[13px] font-semibold transition-colors",
                    ativa
                      ? "bg-cta text-cta-fg"
                      : "text-ink-2 hover:bg-tn hover:text-ink",
                  ].join(" ")}
                >
                  {ferramenta.nome}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
