import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Relatórios" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Relatórios"
      fase="Fase 9"
      descricao="Consultas por período, comparação e exportação."
    />
  );
}
