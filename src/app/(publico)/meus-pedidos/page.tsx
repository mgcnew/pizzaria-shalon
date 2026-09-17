import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Meus pedidos" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Meus pedidos"
      fase="Fase 5"
      descricao="Pedidos deste dispositivo, por credencial local segura."
    />
  );
}
