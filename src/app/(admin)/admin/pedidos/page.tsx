import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Pedidos" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Pedidos"
      fase="Fase 6"
      descricao="Fila, filtros, detalhe e comandos da máquina de estados."
    />
  );
}
