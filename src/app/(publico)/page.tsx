import { PlaceholderFase } from "@/ui/patterns/PlaceholderFase";

/**
 * Cardápio público.
 *
 * FASE 1 entrega o shell (cabeçalho, contêiner, tokens, tipografia). Hero,
 * busca, chips de categoria, "Mais pedidos", combos, promoções e cards de
 * produto dependem do catálogo real e são escopo da Fase 4
 * (05-PLANO-IMPLEMENTACAO.md §8). Nada de cardápio é inventado aqui.
 */
export default function Home() {
  return (
    <PlaceholderFase
      titulo="Cardápio"
      fase="Fase 4"
      descricao="Hero, busca, categorias, mais pedidos, combos e promoções são conectados ao catálogo real nesta etapa."
    />
  );
}
