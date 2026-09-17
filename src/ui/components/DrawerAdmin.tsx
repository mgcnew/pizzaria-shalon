"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MENU_ADMIN } from "@/ui/navegacao";

/**
 * DrawerAdmin — menu lateral mobile do administrativo, conforme o design.
 *
 * Preserva do protótipo: botão ☰ no cabeçalho, véu escuro cobrindo a tela,
 * painel de 76% da largura limitado a 280px, fundo --sidebar, logo e botão de
 * fechar no topo, itens de 46px e a animação shalonUp.
 *
 * DIFERENÇA DELIBERADA: o protótipo controlava a visibilidade do botão ☰
 * medindo `window.innerWidth` em JavaScript. Aqui quem decide é o CSS
 * (`lg:hidden`), conforme PI-004. O estado em JS controla somente
 * aberto/fechado do drawer — que é comportamento, não breakpoint.
 *
 * Fase 1: navegação apenas. Sem badge de contagem, sem permissões, sem troca
 * de perfil — tudo isso depende de RBAC (Fase 2).
 */
export function DrawerAdmin() {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Abrir menu"
        aria-expanded={aberto}
        onClick={() => setAberto(true)}
        className="min-h-touch min-w-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-transparent text-[17px] text-ink lg:hidden"
      >
        ☰
      </button>

      {aberto ? (
        <div
          className="fixed inset-0 z-80 flex bg-[var(--shalon-scrim-drawer)] lg:hidden"
          onClick={() => setAberto(false)}
        >
          <nav
            aria-label="Navegação principal do administrativo"
            onClick={(e) => e.stopPropagation()}
            className="flex w-[76%] max-w-drawer animate-shalon-up flex-col gap-1 overflow-y-auto bg-sidebar px-3 py-4"
          >
            <div className="flex items-center justify-between px-2 pb-[14px] pt-1">
              <Image
                src="/marca/logo-shalon.png"
                alt="Pizzaria Shalon"
                width={1774}
                height={887}
                className="h-[34px] w-auto"
              />
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setAberto(false)}
                className="min-h-[40px] min-w-[40px] cursor-pointer rounded-pill border-0 bg-white/10 text-[17px] text-white"
              >
                ×
              </button>
            </div>

            {MENU_ADMIN.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setAberto(false)}
                className="flex min-h-[46px] items-center gap-[10px] rounded-10 px-3 text-[15px] font-semibold text-sidebar-ink hover:bg-white/10"
              >
                <span className="flex-1">{item.nome}</span>
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
}
