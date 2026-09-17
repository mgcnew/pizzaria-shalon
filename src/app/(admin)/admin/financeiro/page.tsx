import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Financeiro" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Entradas / Despesas"
      fase="Fase 7"
      descricao="Categorias, lançamentos, comprovantes e estorno."
    />
  );
}
