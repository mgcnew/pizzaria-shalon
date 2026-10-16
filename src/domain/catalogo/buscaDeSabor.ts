/**
 * Busca dentro da lista de sabores de um card de fogazza (RN-FOG-003).
 *
 * A lista já chegou inteira do banco — são dezenas de sabores, não
 * milhares —, então filtrar aqui é mais rápido que perguntar de novo ao
 * servidor a cada tecla. A regra é a MESMA da busca do cardápio
 * (`buscar_catalogo`, RN-BUSCA-001): sem acento, sem caixa, cada palavra do
 * termo precisa aparecer no nome ou na descrição, e palavras de ligação não
 * contam. Filtrar não decide preço nem disponibilidade: só esconde linhas.
 *
 * Domínio puro: sem I/O, sem React.
 */

const LIGACAO = new Set([
  "a", "o", "as", "os", "e", "de", "da", "do", "das", "dos",
  "com", "c/", "c", "na", "no", "em",
]);

export function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Palavras que contam; se só houver ligação, vale o termo inteiro. */
export function palavrasDoTermo(termo: string): string[] {
  const limpo = semAcento(termo).trim();
  if (limpo === "") return [];
  const palavras = limpo.split(/\s+/).filter((p) => !LIGACAO.has(p));
  return palavras.length > 0 ? palavras : [limpo];
}

export function filtrarSabores<T extends { nome: string; descricao: string | null }>(
  sabores: readonly T[],
  termo: string,
): T[] {
  const palavras = palavrasDoTermo(termo);
  if (palavras.length === 0) return [...sabores];
  return sabores.filter((s) => {
    const texto = semAcento(`${s.nome} ${s.descricao ?? ""}`);
    return palavras.every((p) => texto.includes(p));
  });
}

/**
 * Casa o termo SÓ com o que identifica o item — nome, categoria — e não com os
 * ingredientes da descrição (15/10/2026, painel).
 *
 * Digitar "calabresa" no balcão devolvia toda pizza que leva calabresa; quem
 * atende procura a PIZZA de calabresa. A busca do cardápio público continua
 * por ingrediente, de propósito: o cliente quer descobrir o que leva o quê.
 */
export function casaPeloNome(termo: string, campos: readonly (string | null | undefined)[]): boolean {
  const palavras = palavrasDoTermo(termo);
  if (palavras.length === 0) return true;
  const texto = semAcento(campos.filter(Boolean).join(" "));
  return palavras.every((p) => texto.includes(p));
}
