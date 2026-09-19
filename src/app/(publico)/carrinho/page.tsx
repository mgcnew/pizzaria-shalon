import type { Metadata } from "next";
import { Carrinho } from "../_ui/Carrinho";

export const metadata: Metadata = { title: "Carrinho" };

/**
 * Carrinho público.
 *
 * O conteúdo é cliente porque o carrinho mora no navegador (RN-CART-001),
 * mas toda decisão comercial — preço, disponibilidade, limite, loja aberta —
 * vem do servidor a cada revalidação.
 */
export default function Page() {
  return <Carrinho />;
}
