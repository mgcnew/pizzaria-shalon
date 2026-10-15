"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MENU_ADMIN, rotaBloqueada } from "@/ui/navegacao";

/**
 * Tela de "sem permissão" no lugar do módulo (15/10/2026).
 *
 * Sem isto, quem abria um endereço que não pode via uma página vazia — o
 * banco devolve lista vazia, e a tela parecia quebrada. Agora diz o que
 * aconteceu e para onde ir. É só interface: o RLS continua sendo quem barra.
 */
export function BarreiraDePermissao({
  permissoes,
  children,
}: {
  permissoes: readonly string[];
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (!rotaBloqueada(pathname, permissoes)) return <>{children}</>;

  const modulo = [...MENU_ADMIN]
    .sort((a, b) => b.href.length - a.href.length)
    .find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`));

  return (
    <div className="mx-auto flex max-w-[480px] flex-col items-center gap-3 px-4 py-16 text-center">
      <span
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-pill bg-elev text-ink-2"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
          <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      <h1 className="m-0 font-display text-[22px] font-extrabold text-ink">
        {modulo ? `${modulo.nome} está bloqueado para você` : "Acesso bloqueado"}
      </h1>
      <p className="m-0 text-[14.5px] text-ink-2">
        Seu perfil não tem permissão para abrir esta área. Se você precisa dela no trabalho, peça
        à proprietária para liberar.
      </p>
      <Link
        href="/admin"
        className="mt-2 inline-flex min-h-[48px] items-center rounded-13 bg-cta px-5 text-[15px] font-bold text-cta-fg no-underline shadow-cta"
      >
        Voltar ao painel
      </Link>
    </div>
  );
}
