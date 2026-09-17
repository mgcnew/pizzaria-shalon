import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Acompanhar pedido" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Acompanhamento do pedido"
      fase="Fase 5"
      descricao="Acompanhamento individual por token seguro e imprevisível."
    />
  );
}
