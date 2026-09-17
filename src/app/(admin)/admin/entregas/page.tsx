import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Entregas" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Entregas"
      fase="Fase 8"
      descricao="Saída de entrega, motoboys e prestação de contas."
    />
  );
}
