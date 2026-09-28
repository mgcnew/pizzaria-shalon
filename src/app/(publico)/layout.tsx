import { CabecalhoPublico } from "./_ui/CabecalhoPublico";
import { PainelAdicionado } from "./_ui/PainelAdicionado";
import { AvisoCarrinhoExpirado } from "./_ui/AvisoCarrinhoExpirado";

/**
 * Shell público — o do design aprovado.
 *
 * Preserva: contêiner de 1120px, cabeçalho sticky, fundo --bg e AUSÊNCIA de
 * navegação inferior persistente (79.8).
 *
 * Desde 28/09/2026 (D-2026-09-28-85) não há barra fixa de carrinho no rodapé:
 * o carrinho mora no cabeçalho e cada adição abre o PainelAdicionado. O
 * respiro inferior encolheu junto com a barra.
 */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-shalon bg-bg">
      <CabecalhoPublico />
      <AvisoCarrinhoExpirado />
      <main className="pb-10">{children}</main>
      <PainelAdicionado />
    </div>
  );
}
