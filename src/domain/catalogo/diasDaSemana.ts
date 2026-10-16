/**
 * Texto dos dias da semana de uma promoção ou banner (ISO 1 = segunda … 7 =
 * domingo). Domínio puro.
 *
 *   [2,3,4]   → "Terça a quinta"
 *   [6,7]     → "Sábado e domingo"
 *   [2]       → "Toda terça"
 *   [1,3,5]   → "Segunda, quarta e sexta"
 *   nulo/7    → null  (todos os dias: não precisa dizer)
 */
const NOMES: Record<number, string> = {
  1: "segunda",
  2: "terça",
  3: "quarta",
  4: "quinta",
  5: "sexta",
  6: "sábado",
  7: "domingo",
};

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function descreverDias(dias: readonly number[] | null | undefined): string | null {
  if (!dias) return null;
  const ordenados = [...new Set(dias)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (ordenados.length === 0 || ordenados.length === 7) return null;

  if (ordenados.length === 1) {
    const d = ordenados[0]!;
    return `Toda ${NOMES[d]}`;
  }

  const seguidos = ordenados.every((d, i) => i === 0 || d === ordenados[i - 1]! + 1);
  if (seguidos && ordenados.length >= 3) {
    return `${maiuscula(NOMES[ordenados[0]!]!)} a ${NOMES[ordenados.at(-1)!]}`;
  }

  const nomes = ordenados.map((d) => NOMES[d]!);
  const ultimo = nomes.pop()!;
  return `${maiuscula(nomes.join(", "))} e ${ultimo}`;
}
