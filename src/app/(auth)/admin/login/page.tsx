import type { Metadata } from "next";
import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

export const metadata: Metadata = { title: "Entrar" };

/**
 * Login da equipe interna.
 *
 * Fica fora do shell administrativo (sem sidebar), por isso está no grupo
 * de rotas (auth). Supabase Auth é escopo da Fase 2 — aqui só existe a rota.
 * O design aprovado NÃO possui esta tela; ela será proposta dentro do design
 * system aprovado quando a Fase 2 chegar (pendência A-06).
 */
export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[420px]">
        <PlaceholderFase
          titulo="Entrar"
          fase="Fase 2"
          descricao="Autenticação da equipe interna com Supabase Auth. Cliente público não usa login."
        />
      </div>
    </main>
  );
}
