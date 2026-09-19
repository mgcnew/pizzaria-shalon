"use client";

import { useLoja } from "@/ui/publico/useLoja";
import type { ProdutoPublico } from "@/application/publico/tipos";
import { ListaFavoritos } from "./ListaFavoritos";

/**
 * Ponte entre os ids guardados no navegador e os dados do servidor.
 *
 * A página de favoritos é renderizada no servidor sem saber o que está
 * salvo — o servidor não tem acesso ao armazenamento local, e é exatamente
 * isso que RN-FAV-001 determina. Este componente recebe o cardápio publicável
 * e filtra pelos ids locais, de modo que a lista de quem acessa nunca é
 * enviada para lugar nenhum.
 *
 * Enquanto o navegador não leu o armazenamento (o que inclui a renderização
 * no servidor), mostra o esqueleto: sem isso a tela piscaria "nenhum
 * favorito" antes de saber se há algum.
 */
export function CarregarFavoritos({ cardapio }: { cardapio: ProdutoPublico[] }) {
  const { favoritos, hidratado } = useLoja();

  if (!hidratado) {
    return (
      <div
        role="status"
        aria-label="Carregando favoritos"
        className="h-[120px] animate-pulse rounded-16 border border-border-shalon bg-elev"
      />
    );
  }

  const salvos = new Set(favoritos);
  return <ListaFavoritos produtos={cardapio.filter((p) => salvos.has(p.id))} />;
}
