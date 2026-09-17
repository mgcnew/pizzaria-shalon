import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Favoritos" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Favoritos"
      fase="Fase 4"
      descricao="Favoritos salvos localmente neste navegador."
    />
  );
}
