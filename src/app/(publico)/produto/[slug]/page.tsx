import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Produto" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Produto"
      fase="Fase 4"
      descricao="A personalização de tamanho, sabores, borda, adicionais e observação é implementada aqui."
    />
  );
}
