import type { Metadata } from "next";
import Link from "next/link";
import { ListaDePedidos } from "../_ui/ListaDePedidos";

export const metadata: Metadata = { title: "Histórico" };

/**
 * Histórico — os pedidos já encerrados neste aparelho.
 *
 * "Pedir novamente" monta um carrinho NOVO, com preços e disponibilidade do
 * dia (79.8), e depende das operações internas da Fase 6. Até lá a tela não
 * oferece o botão, em vez de oferecer um que não cumpre o que promete.
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

      <ListaDePedidos mostrar="concluidos" />

      <p className="m-0 mt-4 text-[12.5px] text-muted">
        Esta lista é deste aparelho e não é sincronizada entre dispositivos.
      </p>
    </section>
  );
}
