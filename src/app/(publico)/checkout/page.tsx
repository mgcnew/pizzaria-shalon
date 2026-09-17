import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Checkout" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Finalizar pedido"
      fase="Fase 5"
      descricao="Identificação, entrega ou retirada, endereço, pagamento e revisão final."
    />
  );
}
