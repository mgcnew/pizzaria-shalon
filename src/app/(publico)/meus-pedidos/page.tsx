import type { Metadata } from "next";
import Link from "next/link";
import { ListaDePedidos } from "../_ui/ListaDePedidos";

export const metadata: Metadata = { title: "Meus pedidos" };

/**
 * Meus pedidos — os que ainda estão em andamento.
 *
 * A associação ao aparelho é uma credencial local imprevisível (03 §11), e
 * cada pedido tem URL individual com token seguro, que dá acesso só àquele
 * pedido. Continua PROIBIDO liberar histórico digitando WhatsApp.
 */
export default function Page() {
  return (
    <section className="px-4 py-4">
      <Link href="/" className="inline-flex min-h-touch items-center text-[15px] text-ink-2">
        ← Voltar ao cardápio
      </Link>
      <h1 className="m-0 mb-4 mt-2 font-display text-[26px] font-extrabold text-ink">
        Meus pedidos
      </h1>

      <ListaDePedidos mostrar="abertos" />

      <p className="m-0 mt-4 text-[12.5px] text-muted">
        Esta lista é deste aparelho. Por segurança, o histórico nunca é liberado apenas
        informando um número de WhatsApp.
      </p>
    </section>
  );
}
