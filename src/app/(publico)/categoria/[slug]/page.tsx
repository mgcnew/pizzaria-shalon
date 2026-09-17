import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Categoria" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Categoria"
      fase="Fase 4"
      descricao="A listagem por categoria é implementada aqui."
    />
  );
}
