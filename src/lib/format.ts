/**
 * Formatação de apresentação.
 *
 * ATENÇÃO: isto NÃO é regra de negócio. Não calcula preço, desconto, taxa
 * nem total — apenas formata um número já calculado. O cálculo comercial é
 * autoridade do servidor (CLAUDE.md §16) e será implementado em src/domain
 * nas fases correspondentes.
 */

/** Formata um valor em reais no padrão usado no design: `R$ 62,90`. */
export function formatBRL(value: number): string {
  const arredondado = Math.round(value * 100) / 100;
  return `R$ ${arredondado.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Máscara de WhatsApp conforme o checkout do design: `(11) 98812-4477`. */
export function maskWhatsApp(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
