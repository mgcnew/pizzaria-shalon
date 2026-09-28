"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { useLoja } from "@/ui/publico/useLoja";

/**
 * Carrinho no cabeçalho — D-2026-09-28-85.
 *
 * Substitui a barra fixa do rodapé. Fica SEMPRE no mesmo lugar, para o
 * cliente que desistiu de escolher mais saber onde continuar; o contador só
 * aparece com itens. Vazio, o ícone leva ao estado vazio do carrinho, que já
 * explica o que fazer.
 *
 * O contador reaparece com um pequeno salto a cada mudança: é o que liga a
 * adição, feita lá embaixo, ao lugar onde o carrinho mora.
 */
export function IconeCarrinho() {
  const { quantidadeTotal, subtotal } = useLoja();
  const rota = usePathname();

  const rotulo =
    quantidadeTotal === 0
      ? "Carrinho vazio"
      : `Ver carrinho: ${quantidadeTotal} ${quantidadeTotal === 1 ? "item" : "itens"}, ${formatBRL(subtotal)}`;

  return (
    <Link
      href="/carrinho"
      aria-label={rotulo}
      title={rotulo}
      aria-current={rota === "/carrinho" ? "page" : undefined}
      className="motion-interactive relative flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-12 border-[1.5px] border-border-shalon bg-surface text-ink transition-colors hover:border-brand-orange hover:bg-elev"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[21px] w-[21px]">
        <path
          d="M3.5 4.5h2.1l2.2 10.4a1.6 1.6 0 0 0 1.57 1.27h7.9a1.6 1.6 0 0 0 1.55-1.2L20.5 8H6.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9.6" cy="19.6" r="1.35" fill="currentColor" />
        <circle cx="17" cy="19.6" r="1.35" fill="currentColor" />
      </svg>

      {quantidadeTotal > 0 ? (
        <span
          key={quantidadeTotal}
          aria-hidden="true"
          className="absolute -right-[7px] -top-[7px] flex h-[21px] min-w-[21px] animate-shalon-up items-center justify-center rounded-pill border-2 border-surface bg-cta px-[5px] text-[11.5px] font-bold tabular-nums leading-none text-cta-fg"
        >
          {quantidadeTotal > 99 ? "99+" : quantidadeTotal}
        </span>
      ) : null}
    </Link>
  );
}
