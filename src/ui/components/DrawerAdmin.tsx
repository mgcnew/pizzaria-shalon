"use client";

import { useState } from "react";
import { useFecharAoNavegar } from "@/ui/hooks/useFecharAoNavegar";
import { MenuLateralAdmin } from "./MenuLateralAdmin";

/**
 * DrawerAdmin — menu lateral mobile do administrativo, conforme o design.
 *
 * Preserva do protótipo: botão ☰ no cabeçalho, véu escuro cobrindo a tela,
 * painel de 76% da largura limitado a 280px, cabeçalho e navegação na mesma
 * superfície leve, itens com alvo mínimo de 44px e animação de entrada.
 *
 * DIFERENÇA DELIBERADA: o protótipo controlava a visibilidade do botão ☰
 * medindo `window.innerWidth` em JavaScript. Aqui quem decide é o CSS
 * (`lg:hidden`), conforme PI-004. O estado em JS controla somente
 * aberto/fechado do drawer — que é comportamento, não breakpoint.
 *
 * Fase 1: navegação apenas. Sem badge de contagem, sem permissões, sem troca
 * de perfil — tudo isso depende de RBAC (Fase 2).
 *
 * A gaveta fecha quando a navegação conclui, não no toque: até lá, o item
 * escolhido mostra o indicador de carregamento (`useFecharAoNavegar`).
 */
export function DrawerAdmin() {
  const [aberto, setAberto] = useState(false);
  const aoClicarEmLink = useFecharAoNavegar(() => setAberto(false));

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
          className="motion-backdrop-in fixed inset-0 z-80 flex bg-[var(--shalon-scrim-drawer)] lg:hidden"
          onClick={() => setAberto(false)}
        >
          <nav
            aria-label="Navegação principal do administrativo"
            onClick={(e) => e.stopPropagation()}
            className="motion-drawer-left-in flex w-[76%] max-w-drawer flex-col overflow-hidden border-r border-admin-nav-border bg-admin-nav-bg"
          >
            <div className="flex h-[53px] shrink-0 items-center justify-between border-b border-admin-nav-border bg-admin-nav-bg px-4">
              <p className="m-0 text-[10px] font-bold uppercase tracking-[0.14em] text-admin-nav-active-fg">
                Painel administrativo
              </p>
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setAberto(false)}
                className="min-h-[40px] min-w-[40px] cursor-pointer rounded-pill border border-admin-nav-border bg-admin-nav-icon text-[17px] text-admin-nav-text"
              >
                ×
              </button>
            </div>

            <MenuLateralAdmin aoClicarEmLink={aoClicarEmLink} />
          </nav>
        </div>
      ) : null}
    </>
  );
}
