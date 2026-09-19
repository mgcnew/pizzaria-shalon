import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obterLojaPublica } from "@/application/publico/consultas";
import { formasDePagamento } from "@/application/checkout/consultas";
import { Checkout } from "../_ui/Checkout";

export const metadata: Metadata = { title: "Finalizar pedido" };

/**
 * Checkout.
 *
 * As duas listas de formas de pagamento vêm prontas do servidor porque a
 * modalidade muda com um toque e ir ao servidor a cada troca daria uma
 * espera sem motivo — são poucas linhas em cada uma.
 */
export default async function Page() {
  const [loja, entrega, retirada] = await Promise.all([
    obterLojaPublica(),
    formasDePagamento("delivery"),
    formasDePagamento("pickup"),
  ]);

  if (loja === null) notFound();

  return (
    <Checkout
      loja={loja}
      formasPorModalidade={{ delivery: entrega, pickup: retirada }}
    />
  );
}
