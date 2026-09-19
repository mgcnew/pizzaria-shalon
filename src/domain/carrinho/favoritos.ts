/**
 * Favoritos.
 *
 * RN-FAV-001: locais ao navegador/dispositivo, sem conta e SEM sincronização
 * entre dispositivos. O módulo guarda apenas ids de produto — nada de preço,
 * nome ou disponibilidade, que mudam e viriam desatualizados.
 *
 * RN-FAV-002: um favorito temporariamente indisponível continua salvo e
 * aparece marcado; produto estruturalmente inativo some do cardápio e, por
 * consequência, da tela de favoritos — porque o RLS não o entrega.
 *
 * Domínio puro: sem React e sem `localStorage`.
 */

export type Favoritos = readonly string[];

export const SEM_FAVORITOS: Favoritos = [];

export function ehFavorito(favoritos: Favoritos, produtoId: string): boolean {
  return favoritos.includes(produtoId);
}

export function alternarFavorito(favoritos: Favoritos, produtoId: string): Favoritos {
  return ehFavorito(favoritos, produtoId)
    ? favoritos.filter((id) => id !== produtoId)
    : [...favoritos, produtoId];
}

/** Entrada não confiável, como todo conteúdo de armazenamento local (§36). */
export function lerFavoritos(bruto: unknown): Favoritos {
  if (!Array.isArray(bruto)) return SEM_FAVORITOS;
  const ids = bruto.filter((v): v is string => typeof v === "string" && v.length > 0);
  // Sem duplicata e com teto: a lista é do dispositivo, mas não é ilimitada.
  return [...new Set(ids)].slice(0, 300);
}
