"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { formatBRL } from "@/lib/format";
import { dispensarAviso, useAvisoAdicionado } from "@/ui/publico/avisoAdicionado";
import { useLoja } from "@/ui/publico/useLoja";

/**
 * Painel "adicionado ao carrinho" — D-2026-09-28-85.
 *
 * Substitui a barra fixa de carrinho do rodapé. Aparece SÓ no momento da
 * adição e dá ao cliente as duas saídas que importam, com o mesmo peso que
 * tem na cabeça dele: adicionar mais ou ir para o carrinho. Depois
 * disso o carrinho mora no ícone do cabeçalho.
 *
 * O subtotal é o VISTO ao montar cada item; o que vale é recalculado pelo
 * servidor na revalidação do carrinho (CLAUDE.md §16).
 */
export function PainelAdicionado() {
  const aviso = useAvisoAdicionado();
  const { quantidadeTotal, subtotal } = useLoja();
  const rota = usePathname();
  const router = useRouter();
  const botaoCarrinhoRef = useRef<HTMLAnchorElement>(null);

  // Houve navegação dentro da loja antes desta rota? Decide se "adicionar
  // mais" volta (preservando a rolagem do cardápio) ou vai ao início.
  const primeiraRota = useRef(true);
  const navegouDentro = useRef(false);

  // Mudou de página, o momento passou.
  useEffect(() => {
    if (primeiraRota.current) primeiraRota.current = false;
    else navegouDentro.current = true;
    dispensarAviso();
  }, [rota]);

  useEffect(() => {
    if (aviso === null) return;
    botaoCarrinhoRef.current?.focus();

    function aoPressionarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") dispensarAviso();
    }
    document.addEventListener("keydown", aoPressionarTecla);
    return () => document.removeEventListener("keydown", aoPressionarTecla);
  }, [aviso]);

  if (aviso === null) return null;

  function continuar() {
    dispensarAviso();
    if (aviso?.origem !== "produto") return;
    if (navegouDentro.current) router.back();
    else router.push("/");
  }

  return (
    <div className="fixed inset-0 z-80 flex items-end justify-center">
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={dispensarAviso}
        className="motion-backdrop-in absolute inset-0 cursor-default border-0 bg-[var(--shalon-scrim-drawer)]"
      />

      <section
        key={aviso.id}
        role="dialog"
        aria-modal="true"
        aria-labelledby="painel-adicionado-titulo"
        className="relative w-full max-w-shalon animate-shalon-up rounded-t-22 border-t border-border-shalon bg-surface px-4 pb-5 pt-4 shadow-toast"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tg text-tgf"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="m5.5 12.5 4 4 9-9"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="painel-adicionado-titulo"
              className="m-0 text-[16px] font-bold leading-[1.3] text-ink"
            >
              {aviso.nome} adicionado
            </h2>
            <p className="m-0 mt-[2px] text-[13.5px] text-ink-2">
              Carrinho: {quantidadeTotal} {quantidadeTotal === 1 ? "item" : "itens"} ·{" "}
              <span className="font-semibold tabular-nums text-ink">{formatBRL(subtotal)}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-[10px]">
          <button
            type="button"
            onClick={continuar}
            className="motion-interactive min-h-[52px] cursor-pointer rounded-14 border-[1.5px] border-border-shalon bg-surface px-3 text-[15px] font-bold text-ink transition-colors hover:bg-elev"
          >
            Adicionar mais
          </button>
          <Link
            ref={botaoCarrinhoRef}
            href="/carrinho"
            onClick={dispensarAviso}
            className="flex min-h-[52px] items-center justify-center rounded-14 bg-cta px-3 text-[15px] font-bold text-cta-fg no-underline shadow-cta"
          >
            Ver carrinho
          </Link>
        </div>
      </section>
    </div>
  );
}
