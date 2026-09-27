"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function MenuUsuarioAdmin({
  nome,
  papeis,
  acaoSair,
}: {
  nome: string;
  papeis: string[];
  acaoSair: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;

    function fecharAoClicarFora(evento: MouseEvent) {
      if (!raizRef.current?.contains(evento.target as Node)) setAberto(false);
    }

    function fecharComEscape(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setAberto(false);
      botaoRef.current?.focus();
    }

    document.addEventListener("mousedown", fecharAoClicarFora);
    document.addEventListener("keydown", fecharComEscape);
    return () => {
      document.removeEventListener("mousedown", fecharAoClicarFora);
      document.removeEventListener("keydown", fecharComEscape);
    };
  }, [aberto]);

  return (
    <div ref={raizRef} className="relative ml-auto">
      <button
        ref={botaoRef}
        type="button"
        aria-label="Abrir menu do usuário"
        /* `aria-haspopup` estava faltando, e é a verdade sobre este botão: ele
           abre um menu. Além de acessibilidade, é por este atributo que o PDV
           reconhece que há algo por cima e para de responder aos atalhos — sem
           ele, F9 trocava de aba atrás do menu aberto (Etapa 9, §3). */
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls="menu-usuario-admin"
        onClick={() => setAberto((valor) => !valor)}
        className="motion-interactive group flex min-h-touch cursor-pointer items-center gap-2 rounded-12 border border-border-shalon bg-surface px-1.5 py-1.5 text-left transition-colors hover:border-brand-orange hover:bg-elev sm:pr-3"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-10 bg-tn text-[13px] font-extrabold uppercase text-ink">
          {nome.charAt(0)}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-[150px] truncate text-[12.5px] font-bold leading-tight text-ink">
            {nome}
          </span>
          <span className="mt-0.5 block max-w-[150px] truncate text-[10.5px] leading-tight text-muted">
            {papeis.join(" · ") || "Sem papel atribuído"}
          </span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className={["motion-interactive hidden h-4 w-4 text-muted transition-transform sm:block", aberto ? "rotate-180" : ""].join(" ")}
        >
          <path d="m7 9.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto ? (
        <div
          id="menu-usuario-admin"
          className="motion-popover-in absolute right-0 top-[calc(100%+8px)] z-60 w-[min(290px,calc(100vw-32px))] overflow-hidden rounded-16 border border-border-shalon bg-surface p-2 shadow-[0_18px_50px_rgb(30_24_20/0.2)]"
        >
          <div className="border-b border-border-shalon px-2.5 pb-2.5 pt-1">
            <p className="m-0 truncate text-[14px] font-bold text-ink">{nome}</p>
            <p className="mb-0 mt-0.5 truncate text-[11.5px] text-muted">
              {papeis.join(" · ") || "Sem papel atribuído"}
            </p>
          </div>

          <div className="py-1.5">
            <Link
              href="/admin/perfil"
              onClick={() => setAberto(false)}
              className="motion-interactive group flex min-h-touch items-center gap-3 rounded-11 px-2.5 py-2 transition-colors hover:bg-tn"
            >
              <span className="motion-interactive flex h-8 w-8 shrink-0 items-center justify-center rounded-10 bg-tn text-ink-2 transition-colors group-hover:bg-surface">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[17px] w-[17px]">
                  <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </span>
              <span>
                <span className="block text-[13px] font-bold text-ink">Alterar perfil</span>
                <span className="mt-0.5 block text-[11px] text-muted">Nome e papéis de acesso</span>
              </span>
            </Link>

            <Link
              href="/admin/configuracoes"
              onClick={() => setAberto(false)}
              className="motion-interactive group flex min-h-touch items-center gap-3 rounded-11 px-2.5 py-2 transition-colors hover:bg-tn"
            >
              <span className="motion-interactive flex h-8 w-8 shrink-0 items-center justify-center rounded-10 bg-tn text-ink-2 transition-colors group-hover:bg-surface">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[17px] w-[17px]">
                  <path d="M12 8.25A3.75 3.75 0 1 1 12 15.75 3.75 3.75 0 0 1 12 8.25Z" stroke="currentColor" strokeWidth="1.7" />
                  <path d="m9.8 3.8.45-1.55h3.5l.45 1.55 1.45.6 1.4-.78 2.48 2.48-.78 1.4.6 1.45 1.55.45v3.5l-1.55.45-.6 1.45.78 1.4-2.48 2.48-1.4-.78-1.45.6-.45 1.55h-3.5L9.8 18.5l-1.45-.6-1.4.78-2.48-2.48.78-1.4-.6-1.45-1.55-.45V9.4l1.55-.45.6-1.45-.78-1.4 2.48-2.48 1.4.78 1.45-.6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
              </span>
              <span>
                <span className="block text-[13px] font-bold text-ink">Configurações</span>
                <span className="mt-0.5 block text-[11px] text-muted">Loja, entrega e operação</span>
              </span>
            </Link>
          </div>

          <form action={acaoSair} className="border-t border-border-shalon pt-1.5">
            <button
              type="submit"
              className="motion-interactive flex min-h-touch w-full cursor-pointer items-center gap-3 rounded-11 border-0 bg-transparent px-2.5 py-2 text-[13px] font-bold text-danger transition-colors hover:bg-td"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-10 bg-td">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[17px] w-[17px]">
                  <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Sair
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
