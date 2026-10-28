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
 *  - PIX É UMA LINHA SÓ (D-2026-10-27-170). Pix na maquininha e Pix antecipado
 *    somam na linha "Pix"; o detalhe por origem vai logo abaixo, porque cada um
 *    cai num lugar (maquininha × conta da loja) e a conferência precisa saber.
 */

export type MovimentoDaGaveta = { tipo: string; sentido: "in" | "out"; total: number };

export type ItensVendidos = { pizzas: number; fogazzas: number; bebidas: number };

/** Pedido do turno que não teve recebimento no caixa (0176, D-2026-10-27-169). */
export type PedidoSemRecebimento = {
  pedido_id: string;
  numero: number;
  cliente: string | null;
  modalidade: string;
  status: string;
  total: number;
  pago_fora_do_caixa: boolean;
  fiado: boolean;
};

export type EntradaDoRelatorio = {
  /** Unidades vendidas na sessão, contadas pelo servidor (0173). Servidor sem a 0173: não sai. */
  itensVendidos?: ItensVendidos | null;
  /** Pedidos do turno sem recebimento no caixa (0176). Servidor sem a 0176: lista vazia. */
  semRecebimento?: PedidoSemRecebimento[] | null;
  /** Descontos dados nos pedidos recebidos neste caixa (0180). Servidor sem a 0180: não sai. */
  descontos?: { total: number; pedidos: number } | null;
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

export type LinhaDoRelatorio = {
  rotulo: string;
  valor: number;
  /** Partes da linha, para mostrar logo abaixo (o Pix por origem). */
  detalhe?: { rotulo: string; valor: number }[];
};

export type LinhaDeQuantidade = { rotulo: string; quantidade: number };

export type RelatorioDeFechamento = {
  /** Pizzas, fogazzas e bebidas; só o que vendeu, em linhas. Vazio = nada a mostrar. */
  vendidos: LinhaDeQuantidade[];
  semRecebimento: PedidoSemRecebimento[];
  /** Já descontados do recebido; dito à parte para a dona saber quanto deu. */
  descontos: { total: number; pedidos: number } | null;
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

const FAMILIAS_PIX: Record<string, string> = { pix_machine: "máquina", pix_key: "antecipado" };

/**
 * Recebido por forma, com os Pix somados numa linha só, no lugar do primeiro
 * Pix que aparecer. O detalhe guarda cada origem, em até 10 caracteres.
 */
function linhasDeRecebidos(recebimentos: EntradaDoRelatorio["recebimentos"]): LinhaDoRelatorio[] {
  const linhas: LinhaDoRelatorio[] = [];
  let pix: LinhaDoRelatorio | null = null;
  for (const r of recebimentos) {
    if (r.total === 0) continue;
    const origem = FAMILIAS_PIX[r.familia];
    if (origem === undefined) {
      linhas.push({ rotulo: nomeCurtoDaForma(r.metodo, r.familia), valor: r.total });
      continue;
    }
    if (pix === null) {
      pix = { rotulo: "Pix", valor: 0, detalhe: [] };
      linhas.push(pix);
    }
    // Centavos inteiros: somar reais em ponto flutuante deixa 0,30000000000000004.
    pix.valor = Math.round((pix.valor + r.total) * 100) / 100;
    const parte = pix.detalhe!.find((d) => d.rotulo === origem);
    if (parte) parte.valor = Math.round((parte.valor + r.total) * 100) / 100;
    else pix.detalhe!.push({ rotulo: origem, valor: r.total });
  }
  pix?.detalhe!.sort((a, b) => (a.rotulo === "máquina" ? -1 : b.rotulo === "máquina" ? 1 : 0));
  return linhas;
}

/** Ordem em que cada tipo aparece, e o rótulo (até 12 caracteres). */
const ENTRADAS: Record<string, { ordem: number; rotulo: string }> = {
  sale_receipt: { ordem: 1, rotulo: "Vendas" },
  supply: { ordem: 2, rotulo: "Reforços" },
  other: { ordem: 3, rotulo: "Outros" },
  adjustment: { ordem: 4, rotulo: "Ajuste" },
  driver_difference: { ordem: 5, rotulo: "Sobra moto" },
  driver_change: { ordem: 6, rotulo: "Troco volta" },
};

const SAIDAS: Record<string, { ordem: number; rotulo: string }> = {
  withdrawal: { ordem: 1, rotulo: "Sangrias" },
  expense: { ordem: 2, rotulo: "Despesas" },
  employee_advance: { ordem: 3, rotulo: "Adiantamento" },
  refund: { ordem: 4, rotulo: "Estornos" },
  other: { ordem: 5, rotulo: "Outros" },
  adjustment: { ordem: 6, rotulo: "Ajuste" },
  driver_difference: { ordem: 7, rotulo: "Falta moto" },
  driver_change: { ordem: 8, rotulo: "Troco moto" },
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

/** Só o que teve venda: "0 fogazzas" é ruído, como linha de dinheiro zerada. */
function linhasDeVendidos(v: ItensVendidos | null | undefined): LinhaDeQuantidade[] {
  if (!v) return [];
  return [
    { rotulo: "Pizzas", quantidade: v.pizzas },
    { rotulo: "Fogazzas", quantidade: v.fogazzas },
    { rotulo: "Bebidas", quantidade: v.bebidas },
  ].filter((l) => l.quantidade > 0);
}

export function montarRelatorioDeFechamento(e: EntradaDoRelatorio): RelatorioDeFechamento {
  const movimentos = e.movimentos ?? (e.legado ? movimentosDoLegado(e.legado) : []);
  return {
    vendidos: linhasDeVendidos(e.itensVendidos),
    semRecebimento: e.semRecebimento ?? [],
    descontos: e.descontos && Number(e.descontos.total) > 0
      ? { total: Number(e.descontos.total), pedidos: Number(e.descontos.pedidos) }
      : null,
    recebidos: linhasDeRecebidos(e.recebimentos),
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
