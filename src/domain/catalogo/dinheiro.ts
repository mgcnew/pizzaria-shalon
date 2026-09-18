/**
 * Leitura de valores monetários digitados.
 *
 * O design aceita "56,90" (vírgula decimal, padrão brasileiro). Converter
 * texto em número é fronteira de confiança: CLAUDE.md §36 manda validar
 * entrada, e §16 lembra que o frontend nunca é autoridade — o banco ainda
 * recusa valor negativo por constraint.
 *
 * Domínio puro: sem I/O.
 */

export type ValorLido =
  | { ok: true; valor: number }
  | { ok: false; erro: string };

/**
 * Lê um valor em reais digitado pela pessoa.
 *
 * Aceita "56,90", "56.90", "1.234,56" e "R$ 56,90". Recusa vazio, texto sem
 * número e valor negativo.
 */
export function lerValorBR(entrada: string): ValorLido {
  const bruto = entrada.trim().replace(/^R\$\s*/i, "");
  if (bruto === "") return { ok: false, erro: "Informe um valor." };

  // "1.234,56" -> o ponto é separador de milhar; a vírgula é o decimal.
  const temVirgula = bruto.includes(",");
  const normalizado = temVirgula
    ? bruto.replace(/\./g, "").replace(",", ".")
    : bruto;

  if (!/^\d+(\.\d+)?$/.test(normalizado)) {
    return { ok: false, erro: "Valor inválido. Use o formato 56,90." };
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) {
    return { ok: false, erro: "Valor inválido. Use o formato 56,90." };
  }
  // Duas casas: dinheiro não tem terceira casa decimal no cadastro.
  return { ok: true, valor: Math.round(valor * 100) / 100 };
}

/** Lê um valor opcional: vazio vira `null` em vez de erro. */
export function lerValorOpcionalBR(entrada: string): ValorLido | null {
  return entrada.trim() === "" ? null : lerValorBR(entrada);
}
