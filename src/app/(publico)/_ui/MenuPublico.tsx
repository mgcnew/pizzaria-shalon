"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Menu hambúrguer do topo público.
 *
 * ADAPTAÇÃO REGISTRADA (A-06): o protótipo do Claude Design **não tem** este
 * menu — a experiência pública dele vai direto ao cardápio. Quem exige o menu
 * é o documento normativo: 79.8 determina "menu hambúrguer com Meus pedidos,
 * Histórico de pedidos e Favoritos" e "não haverá navegação inferior
 * persistente".
 *
 * Por isso o menu foi montado com a linguagem do administrativo aprovado —
 * botão de 44px, painel escuro #2A201A, itens de 46px, scrim 50% — sem
 * inventar visual novo.
 */

const ITENS = [
  { nome: "Meus pedidos", href: "/meus-pedidos" },
  { nome: "Histórico", href: "/historico" },
  { nome: "Favoritos", href: "/favoritos" },
] as const;

export function MenuPublico() {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        aria-expanded={aberto}
        className="flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-11 border-[1.5px] border-border-shalon bg-surface text-[18px] text-ink"
      >
        <span aria-hidden="true">☰</span>
      </button>

      {aberto ? (
        <div
          className="fixed inset-0 z-80 flex bg-[var(--shalon-scrim-drawer)]"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          {/* Fechar tocando fora: o scrim é o alvo, como no drawer do admin. */}
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setAberto(false)}
            className="flex-1 cursor-default border-0 bg-transparent"
          />
          <nav className="flex h-full w-[280px] max-w-drawer shrink-0 animate-shalon-up flex-col gap-1 overflow-y-auto bg-sidebar px-3 py-4">
            <div className="flex items-center justify-between px-2 pb-3">
              <span className="font-display text-[17px] font-extrabold text-sidebar-ink">
                Pizzaria Shalon
              </span>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="min-h-touch min-w-touch cursor-pointer rounded-10 border-0 bg-transparent text-[18px] text-sidebar-ink"
              >
                ×
              </button>
            </div>

            {ITENS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setAberto(false)}
                className="flex min-h-[46px] items-center rounded-10 px-3 text-[14px] font-semibold text-sidebar-ink hover:bg-white/10"
              >
                {item.nome}
              </Link>
            ))}

            <p className="mt-auto px-3 pt-4 text-[12px] text-white/45">
              Favoritos e pedidos ficam neste aparelho. Não há cadastro nem senha.
            </p>
          </nav>
        </div>
      ) : null}
    </>
  );
}
