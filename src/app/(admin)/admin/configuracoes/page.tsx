import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Configurações" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Configurações"
      fase="Fase 3"
      descricao="Loja, horários, entrega, pagamentos, impressão e auditoria."
    />
  );
}
