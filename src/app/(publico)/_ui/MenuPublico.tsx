"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

type ItemMenu = {
  nome: string;
  descricao: string;
  href: string;
  icone: ReactNode;
};

const iconeClasse = "h-[19px] w-[19px]";

const ITENS: ItemMenu[] = [
  {
    nome: "Meus pedidos",
    descricao: "Acompanhe pedidos em andamento",
    href: "/meus-pedidos",
    icone: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={iconeClasse}>
        <path d="M6.75 3.75h10.5v16.5l-2.6-1.65L12 20.25 9.35 18.6l-2.6 1.65V3.75Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9.5 8h5M9.5 11.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    nome: "Histórico",
    descricao: "Consulte seus pedidos anteriores",
    href: "/historico",
    icone: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={iconeClasse}>
        <path d="M4.7 7.35A8 8 0 1 1 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M4.7 3.8v3.55h3.55M12 7.5v5l3.2 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    nome: "Favoritos",
    descricao: "Encontre os sabores que você salvou",
    href: "/favoritos",
    icone: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={iconeClasse}>
        <path d="M12 20s-7.25-4.5-7.25-10A4.25 4.25 0 0 1 12 7a4.25 4.25 0 0 1 7.25 3c0 5.5-7.25 10-7.25 10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
];

/**
 * Navegação pública exigida pelo Documento Mestre §79.8, com o comportamento
 * acessível de dialog.
 *
 * As cores são as do menu do painel administrativo (tokens `admin-nav-*`):
 * superfície clara, borda suave, ícone laranja e item ativo no amarelo-claro.
 * Assim o menu segue o tema claro/escuro do sistema. O marrom escuro que
 * estava aqui pesava sobre o cardápio claro (D-2026-09-29-95).
 */
export function MenuPublico() {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  const botaoAbrirRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLElement>(null);
  const botaoFecharRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;

    const overflowAnterior = document.body.style.overflow;
    const botaoAbrir = botaoAbrirRef.current;
    document.body.style.overflow = "hidden";
    botaoFecharRef.current?.focus();

    function aoPressionarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        setAberto(false);
        return;
      }

      if (evento.key !== "Tab" || !painelRef.current) return;

      const focaveis = Array.from(
        painelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

    document.addEventListener("keydown", aoPressionarTecla);

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoPressionarTecla);
      botaoAbrir?.focus();
    };
  }, [aberto]);

  return (
    <>
      <button
        ref={botaoAbrirRef}
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        aria-expanded={aberto}
        aria-controls="menu-publico"
        className="motion-interactive group flex min-h-touch min-w-touch shrink-0 cursor-pointer items-center justify-center rounded-12 border-[1.5px] border-border-shalon bg-surface text-ink transition-colors hover:border-brand-orange hover:bg-elev"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path d="M5 7.5h14M5 12h14M5 16.5h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </button>

      {aberto ? (
        <div
          className="motion-backdrop-in fixed inset-0 z-80 flex justify-end bg-[var(--shalon-scrim-drawer)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="menu-publico-titulo"
        >
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setAberto(false)}
            className="flex-1 cursor-default border-0 bg-transparent"
            tabIndex={-1}
          />

          <aside
            ref={painelRef}
            id="menu-publico"
            className="motion-drawer-right-in flex h-full w-[min(88vw,340px)] shrink-0 flex-col overflow-y-auto rounded-l-22 border-l border-admin-nav-border bg-admin-nav-bg px-4 pb-5 pt-4 shadow-[-16px_0_40px_rgb(41_37_36/0.14)]"
          >
            <div className="flex items-center justify-between gap-4 border-b border-admin-nav-border pb-4 pl-1">
              <div>
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-admin-nav-active-fg">
                  Seu cardápio
                </p>
                <h2 id="menu-publico-titulo" className="mb-0 mt-1 font-display text-[20px] font-extrabold text-admin-nav-text">
                  Pizzaria Shalon
                </h2>
              </div>
              <button
                ref={botaoFecharRef}
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="motion-interactive flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-12 border border-admin-nav-border bg-admin-nav-icon text-admin-nav-text transition-colors hover:border-brand-orange"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <nav aria-label="Área do cliente" className="mt-4 flex flex-col gap-2">
              {ITENS.map((item) => {
                const ativo = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setAberto(false)}
                    aria-current={ativo ? "page" : undefined}
                    className={[
                      "motion-interactive group flex min-h-[66px] items-center gap-3 rounded-14 border px-3 py-[10px] transition-colors",
                      ativo
                        ? "border-brand-orange bg-admin-nav-active"
                        : "border-admin-nav-border bg-surface hover:border-brand-orange hover:bg-admin-nav-icon",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-12",
                        ativo
                          ? "bg-surface text-admin-nav-active-fg shadow-sm"
                          : "bg-admin-nav-icon text-admin-nav-active-fg",
                      ].join(" ")}
                    >
                      {item.icone}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold text-admin-nav-text">{item.nome}</span>
                      <span className="mt-0.5 block text-[11px] leading-[1.35] text-admin-nav-muted">
                        {item.descricao}
                      </span>
                    </span>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="motion-interactive h-4 w-4 shrink-0 text-admin-nav-muted transition-transform group-hover:translate-x-0.5">
                      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto rounded-14 border border-admin-nav-border bg-admin-nav-icon px-4 py-3">
              <p className="m-0 text-[12px] leading-[1.55] text-admin-nav-muted">
                Seus favoritos e pedidos ficam salvos somente neste aparelho. Não é necessário criar conta.
              </p>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
