"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Navegação da área do cliente direto na barra do topo (D-2026-11-19-185), no
 * lugar do menu hambúrguer: os três destinos ficam sempre à vista. Continua
 * sendo a navegação pública exigida pelo Documento Mestre §79.8.
 *
 * No computador, os botões ficam na mesma linha do logo. No celular não cabem
 * ali junto do carrinho, então descem para uma faixa logo abaixo, em três
 * colunas do mesmo tamanho.
 */
type ItemNavegacao = {
  nome: string;
  /** Na faixa do celular, as três colunas não comportam o nome inteiro. */
  curto?: string;
  href: string;
  icone: ReactNode;
};

const iconeClasse = "h-[19px] w-[19px] shrink-0";

const ITENS: ItemNavegacao[] = [
  {
    nome: "Meus pedidos",
    curto: "Pedidos",
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
    href: "/favoritos",
    icone: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={iconeClasse}>
        <path d="M12 20s-7.25-4.5-7.25-10A4.25 4.25 0 0 1 12 7a4.25 4.25 0 0 1 7.25 3c0 5.5-7.25 10-7.25 10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function NavegacaoPublica({ variante }: { variante: "linha" | "faixa" }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Área do cliente"
      className={
        variante === "linha"
          ? "hidden shrink-0 items-center gap-2 md:flex"
          : "mt-[10px] grid grid-cols-3 gap-2 md:hidden"
      }
    >
      {ITENS.map((item) => {
        const ativo = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? "page" : undefined}
            className={[
              "motion-interactive flex min-h-touch items-center justify-center gap-2 rounded-12 border-[1.5px] text-[13.5px] font-semibold transition-colors",
              variante === "linha" ? "px-3" : "px-1.5 text-[12.5px]",
              ativo
                ? "border-brand-orange bg-admin-nav-active text-admin-nav-active-fg"
                : "border-border-shalon bg-surface text-ink hover:border-brand-orange hover:bg-elev",
            ].join(" ")}
          >
            <span className="text-admin-nav-active-fg">{item.icone}</span>
            <span className="truncate">{variante === "faixa" ? (item.curto ?? item.nome) : item.nome}</span>
          </Link>
        );
      })}
    </nav>
  );
}
