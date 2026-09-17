import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Remarketing" };

export default function Page() {
  return (
    <PlaceholderFase
      titulo="Remarketing"
      fase="Fase 9"
      descricao="Sugestão de recuperação, templates e registro de contato."
    />
  );
}
