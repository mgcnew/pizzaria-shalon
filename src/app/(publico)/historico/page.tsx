import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Histórico" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Histórico de pedidos"
      fase="Fase 5"
      descricao="Histórico deste dispositivo, sem consulta por WhatsApp."
    />
  );
}
