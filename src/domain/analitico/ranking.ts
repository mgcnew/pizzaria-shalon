/**
 * O recorte de menor movimentação (RN-REL-005).
 *
 * Vive no domínio, e não na tela, porque é REGRA: diz o que o bloco afirma e,
 * principalmente, o que ele não afirma. "Vendeu menos que os outros
 * comparáveis" é ordem relativa; "tem pouca demanda" seria diagnóstico, e o
 * sistema não tem como sustentar o segundo.
 *
 * Função pura: entra a lista do banco, sai o recorte. Sem I/O, sem data,
 * testável sozinha.
 */

/** O mínimo que o recorte precisa saber de cada produto. */
export type ProdutoComparavel = {
  /** Identidade da linha: a fogazza do sabor é linha própria (RN-FOG-008). */
  chave: string;
  nome: string;
  quantidade: number;
  /** Esteve no catálogo o período inteiro E continua disponível. */
  elegivel_para_baixa_venda: boolean;
};

/**
 * Cinco por decisão de apresentação da V1 — não é limiar estatístico, não
 * deriva de amostra e não significa que o sexto colocado esteja bem.
 */
export const LIMITE_DE_MENOR_MOVIMENTACAO = 5;

/**
 * Os produtos elegíveis que menos venderam no período.
 *
 * @param produtos    ranking completo do período, como o banco devolve
 * @param maisVendidos o grupo exibido como "mais vendidos" NA MESMA VISÃO
 */
export function recorteDeMenorMovimentacao<T extends ProdutoComparavel>(
  produtos: readonly T[],
  maisVendidos: readonly ProdutoComparavel[] = [],
  limite: number = LIMITE_DE_MENOR_MOVIMENTACAO,
): T[] {
  const noTopo = new Set(maisVendidos.map((p) => p.chave));

  return produtos
    .filter((p) => p.elegivel_para_baixa_venda && !noTopo.has(p.chave))
    .slice()
    .sort(
      // Desempate pelo nome: sem ele, dois produtos com a mesma quantidade
      // poderiam trocar de lugar entre uma consulta e outra, e a mesma
      // pergunta devolveria listas diferentes.
      (a, b) => a.quantidade - b.quantidade || a.nome.localeCompare(b.nome, "pt-BR"),
    )
    .slice(0, limite);
}
