import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Caixa" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Caixa"
      fase="Fase 7"
      descricao="Sessão, sangria, reforço, despesa, conferência e fechamento."
    />
  );
}
