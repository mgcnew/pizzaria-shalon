import { CabecalhoPublico } from "./_ui/CabecalhoPublico";
import { BarraCarrinho } from "./_ui/BarraCarrinho";
import { AvisoCarrinhoExpirado } from "./_ui/AvisoCarrinhoExpirado";

/**
 * Shell público — o do design aprovado.
 *
 * Preserva: contêiner de 1120px, cabeçalho sticky, fundo --bg, respiro
 * inferior de 110px para a barra de carrinho e AUSÊNCIA de navegação
 * inferior persistente (79.8).
 */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-shalon bg-bg">
      <CabecalhoPublico />
      <AvisoCarrinhoExpirado />
      <main className="pb-[110px]">{children}</main>
      <BarraCarrinho />
    </div>
  );
}
