"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Navegação do cardápio no rodapé (D-2026-11-19-185), no lugar do menu
 * hambúrguer: Cardápio, Pedidos, Histórico e Favoritos sempre à vista, como
 * num aplicativo. É a navegação pública do Documento Mestre §79.8.
 *
 * No celular ela é a barra encostada no rodapé, respeitando a área do gesto do
 * iPhone; no computador, uma pílula flutuante no centro. Some nas telas que já
 * têm botão próprio no rodapé ou que são uma tarefa só: a página do produto
 * (barra de "Adicionar"), o checkout e o acompanhamento do pedido.
 */
type Aba = { nome: string; href: string; ativa: (pathname: string) => boolean; icone: ReactNode };

const ICONE = "h-[22px] w-[22px]";

const ABAS: Aba[] = [
  {
    nome: "Cardápio",
    href: "/",
    ativa: (p) => p === "/" || ["/categoria/", "/destaque/", "/promocao/"].some((r) => p.startsWith(r)),
    icone: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={ICONE}>
        <path d="M12 3.5 20.5 19a.9.9 0 0 1-.8 1.3H4.3a.9.9 0 0 1-.8-1.3L12 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M6.2 15.4c3.7-1 7.9-1 11.6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="10.6" cy="12.4" r="1.1" fill="currentColor" />
        <circle cx="13.9" cy="17.7" r="1.1" fill="currentColor" />
      </svg>
    ),
  },
  {
    nome: "Pedidos",
    href: "/meus-pedidos",
    ativa: (p) => p === "/meus-pedidos",
    icone: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={ICONE}>
        <path d="M6.75 3.75h10.5v16.5l-2.6-1.65L12 20.25 9.35 18.6l-2.6 1.65V3.75Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9.5 8h5M9.5 11.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    nome: "Histórico",
    href: "/historico",
    ativa: (p) => p === "/historico",
    icone: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={ICONE}>
        <path d="M4.7 7.35A8 8 0 1 1 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M4.7 3.8v3.55h3.55M12 7.5v5l3.2 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    nome: "Favoritos",
    href: "/favoritos",
    ativa: (p) => p === "/favoritos",
    icone: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={ICONE}>
        <path d="M12 20s-7.25-4.5-7.25-10A4.25 4.25 0 0 1 12 7a4.25 4.25 0 0 1 7.25 3c0 5.5-7.25 10-7.25 10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
];

/** Telas com botão próprio no rodapé, ou que são uma tarefa só. */
const SEM_BARRA = ["/produto/", "/checkout", "/pedido/"];

export function NavegacaoPublica() {
  const pathname = usePathname();
  if (SEM_BARRA.some((r) => pathname.startsWith(r))) return null;

  return (
    <>
      {/* Reserva o lugar da barra: o fim da página não fica coberto. */}
      <div aria-hidden="true" className="h-[calc(72px+env(safe-area-inset-bottom))] md:h-[88px]" />

      <nav
        aria-label="Área do cliente"
        className={[
          "fixed inset-x-0 bottom-0 z-40 border-t border-border-shalon bg-surface/95 px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgb(41_37_36/0.08)] backdrop-blur",
          // Computador: pílula flutuante no centro, em vez de faixa de ponta a ponta.
          "md:inset-x-auto md:bottom-5 md:left-1/2 md:w-[460px] md:-translate-x-1/2 md:rounded-22 md:border md:px-2 md:py-2 md:shadow-[0_12px_36px_rgb(41_37_36/0.16)]",
        ].join(" ")}
      >
        <ul className="m-0 flex list-none items-stretch gap-1 p-0">
          {ABAS.map((aba) => {
            const ativa = aba.ativa(pathname);
            return (
              <li key={aba.href} className="flex min-w-0 flex-1">
                <Link
                  href={aba.href}
                  aria-current={ativa ? "page" : undefined}
                  className={[
                    "motion-interactive group flex min-h-[58px] w-full flex-col items-center justify-center gap-1 rounded-16 text-[11.5px] leading-none no-underline transition-colors",
                    ativa ? "font-bold text-admin-nav-active-fg" : "font-semibold text-muted hover:text-ink",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-8 w-14 items-center justify-center rounded-pill transition-colors",
                      ativa ? "bg-admin-nav-active" : "group-hover:bg-elev",
                    ].join(" ")}
                  >
                    {aba.icone}
                  </span>
                  {aba.nome}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
