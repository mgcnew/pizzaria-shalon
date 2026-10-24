/**
 * Relatório de fechamento de caixa — o que a tela e o papel mostram.
 *
 * Um só lugar monta o relatório, para a tela e a impressão nunca divergirem.
 * Domínio puro: não consulta nada e não decide dinheiro. Os totais vêm do
 * servidor (`resumo_do_fechamento`, que também calcula o esperado); aqui só se
 * escolhe o que aparece e como se chama (CLAUDE.md §16).
 *
 * REGRAS DE LEITURA (D-2026-10-23-163):
 *  - SÓ O QUE TEVE MOVIMENTO. Sangria zerada, despesa zerada, fundo zerado:
 *    não saem. Linha vazia no papel é ruído.
 *  - NOMES CURTOS. O papel de 58 mm só comporta ~25 colunas, e cada linha leva
 *    o valor ("R$ 1.234,56") à direita. "Cartão de crédito" e "Pix na
 *    maquininha" quebravam e empurravam o valor para outra linha. Todo rótulo
 *    aqui tem até 12 caracteres.
 *  - A CONTA FECHA. fundo + o que entrou − o que saiu = esperado na gaveta.
 */

export type MovimentoDaGaveta = { tipo: string; sentido: "in" | "out"; total: number };

export type EntradaDoRelatorio = {
  recebimentos: { metodo: string; familia: string; total: number }[];
  /** Total recebido por todas as formas, vindo do servidor. */
  totalRecebido?: number | null;
  fundoInicial: number;
  /** O movimento da gaveta inteiro, por tipo e sentido (0171). */
  movimentos?: MovimentoDaGaveta[] | null;
  /** Totais do servidor (0171). Sem eles, a linha de total simplesmente não sai. */
  entrou?: number | null;
  saiu?: number | null;
  /**
   * Servidor sem a 0171: o que já existia no resumo. Só serve para o relatório
   * continuar saindo; com ele não há total de entradas e saídas.
   */
  legado?: {
    recebidoEmDinheiro: number;
    reforcos: number;
    sangrias: number;
    despesas: number;
    entradas: number;
    estornos: number;
    diferencasDeMotoboy: number;
  };
  contado: number;
  esperado: number;
  diferenca: number;
  dinheiroForaDaGaveta: number;
};

export type LinhaDoRelatorio = { rotulo: string; valor: number };

export type RelatorioDeFechamento = {
  recebidos: LinhaDoRelatorio[];
  totalRecebido: number | null;
  fundo: number;
  entradas: LinhaDoRelatorio[];
  totalEntrou: number | null;
  saidas: LinhaDoRelatorio[];
  totalSaiu: number | null;
  esperado: number;
  contado: number;
  diferenca: number;
  foraDaGaveta: number;
};

/**
 * Forma de pagamento em até 12 caracteres, pela FAMÍLIA — que não muda quando
 * alguém renomeia a forma no painel. Forma de família desconhecida mantém o
 * nome que tem (a linha quebra com juízo se for comprida; o valor nunca é cortado).
 */
export function nomeCurtoDaForma(metodo: string, familia: string): string {
  switch (familia) {
    case "cash":
      return "Dinheiro";
    case "credit":
      return "Crédito";
    case "debit":
      return "Débito";
    case "pix_machine":
      return "Pix máquina";
    case "pix_key":
      return "Pix chave";
    case "voucher":
      return "Voucher";
    default:
      return metodo;
  }
}

/** Ordem em que cada tipo aparece, e o rótulo (até 12 caracteres). */
const ENTRADAS: Record<string, { ordem: number; rotulo: string }> = {
  sale_receipt: { ordem: 1, rotulo: "Vendas" },
  supply: { ordem: 2, rotulo: "Reforços" },
  other: { ordem: 3, rotulo: "Outros" },
  adjustment: { ordem: 4, rotulo: "Ajuste" },
  driver_difference: { ordem: 5, rotulo: "Sobra moto" },
};

const SAIDAS: Record<string, { ordem: number; rotulo: string }> = {
  withdrawal: { ordem: 1, rotulo: "Sangrias" },
  expense: { ordem: 2, rotulo: "Despesas" },
  employee_advance: { ordem: 3, rotulo: "Adiantamento" },
  refund: { ordem: 4, rotulo: "Estornos" },
  other: { ordem: 5, rotulo: "Outros" },
  adjustment: { ordem: 6, rotulo: "Ajuste" },
  driver_difference: { ordem: 7, rotulo: "Falta moto" },
};

function linhasDe(
  movimentos: MovimentoDaGaveta[],
  sentido: "in" | "out",
  tabela: Record<string, { ordem: number; rotulo: string }>,
): LinhaDoRelatorio[] {
  return movimentos
    .filter((m) => m.sentido === sentido && m.total !== 0)
    .map((m) => ({
      ordem: tabela[m.tipo]?.ordem ?? 99,
      rotulo: tabela[m.tipo]?.rotulo ?? m.tipo.slice(0, 12),
      valor: m.total,
    }))
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ rotulo, valor }) => ({ rotulo, valor }));
}

/** O que o servidor antigo sabia dizer, no mesmo formato de grupos. */
function movimentosDoLegado(l: NonNullable<EntradaDoRelatorio["legado"]>): MovimentoDaGaveta[] {
  return [
    { tipo: "sale_receipt", sentido: "in", total: l.recebidoEmDinheiro },
    { tipo: "supply", sentido: "in", total: l.reforcos },
    { tipo: "other", sentido: "in", total: l.entradas },
    { tipo: "withdrawal", sentido: "out", total: l.sangrias },
    { tipo: "expense", sentido: "out", total: l.despesas },
    { tipo: "refund", sentido: "out", total: l.estornos },
    l.diferencasDeMotoboy >= 0
      ? { tipo: "driver_difference", sentido: "in", total: l.diferencasDeMotoboy }
      : { tipo: "driver_difference", sentido: "out", total: -l.diferencasDeMotoboy },
  ];
}

export function montarRelatorioDeFechamento(e: EntradaDoRelatorio): RelatorioDeFechamento {
  const movimentos = e.movimentos ?? (e.legado ? movimentosDoLegado(e.legado) : []);
  return {
    recebidos: e.recebimentos
      .filter((r) => r.total !== 0)
      .map((r) => ({ rotulo: nomeCurtoDaForma(r.metodo, r.familia), valor: r.total })),
    totalRecebido: e.totalRecebido ?? null,
    fundo: e.fundoInicial,
    entradas: linhasDe(movimentos, "in", ENTRADAS),
    totalEntrou: e.entrou ?? null,
    saidas: linhasDe(movimentos, "out", SAIDAS),
    totalSaiu: e.saiu ?? null,
    esperado: e.esperado,
    contado: e.contado,
    diferenca: e.diferenca,
    foraDaGaveta: e.dinheiroForaDaGaveta,
  };
}
