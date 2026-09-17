import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Produtos" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Produtos"
      fase="Fase 3"
      descricao="Categorias, tamanhos, produtos, variações, bordas, adicionais, combos e promoções."
    />
  );
}
