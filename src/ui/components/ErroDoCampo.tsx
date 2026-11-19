/**
 * O que falta num campo sem `Input` próprio (seletor de menu, lista de
 * itens), no mesmo desenho do `erro` do `Input`.
 */
export function ErroDoCampo({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p className="m-0 mt-[6px] text-[12.5px] font-semibold text-tdf">{texto}</p>;
}
