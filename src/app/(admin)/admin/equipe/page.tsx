import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Equipe" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Funcionários / Equipe"
      fase="Fase 8"
      descricao="Cadastro, movimentações e dados sensíveis separados por permissão."
    />
  );
}
