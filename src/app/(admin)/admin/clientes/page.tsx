import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Clientes" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Clientes"
      fase="Fase 9"
      descricao="Histórico, endereços, recorrência e bloqueio."
    />
  );
}
