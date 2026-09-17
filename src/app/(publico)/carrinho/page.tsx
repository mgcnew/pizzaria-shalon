import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Carrinho" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Seu carrinho"
      fase="Fase 4"
      descricao="Itens, quantidades e resumo do pedido."
    />
  );
}
