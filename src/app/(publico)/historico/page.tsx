import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Histórico" };

/**
 * Histórico de pedidos.
 *
 * Mesma situação de "Meus pedidos": a tela existe, o estado é real — não há
 * pedido — e nada é inventado. Pedido é da Fase 5; "Pedir novamente" (que
 * monta um carrinho NOVO com preços e disponibilidade atuais, 79.8) depende
 * dele.
 */
export default function Page() {
  return (
    <section className="px-4 py-4">
      <Link href="/" className="inline-flex min-h-touch items-center text-[15px] text-ink-2">
        ← Voltar ao cardápio
      </Link>
      <h1 className="m-0 mb-4 mt-2 font-display text-[26px] font-extrabold text-ink">
        Histórico
      </h1>

      <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
        <p className="m-0 font-display text-[20px] font-bold text-ink">
          Nada por aqui ainda
        </p>
        <p className="mb-[18px] mt-2 text-[14px] text-ink-2">
          Seus pedidos anteriores vão aparecer nesta tela, com a opção de pedir de novo pelos
          preços do dia.
        </p>
        <Link
          href="/favoritos"
          className="inline-flex min-h-touch-cta items-center rounded-12 border-[1.5px] border-border-shalon px-5 text-[16px] font-semibold text-ink"
        >
          Ver favoritos
        </Link>
      </div>
    </section>
  );
}
