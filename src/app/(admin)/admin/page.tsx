import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Dashboard"
      fase="Fase 9"
      descricao="Fila de atenção operacional e indicadores derivados dos registros reais."
    />
  );
}
