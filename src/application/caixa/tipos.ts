/**
 * Tipos da operação de caixa e do financeiro.
 *
 * Todo valor monetário aqui é `number` vindo de `numeric(12,2)` do banco, já
 * calculado pelo servidor. Nada nesta camada soma, subtrai ou arredonda
 * dinheiro: quem faz a conta é o Postgres (CLAUDE.md §16 e §24).
 */

export type TomDoCaixa = "sucesso" | "atencao" | "perigo" | "info" | "neutro";

export type MovimentoDoCaixa = {
  id: string;
  tipo: "opening" | "sale_receipt" | "supply" | "withdrawal" | "expense" | "refund" | "adjustment" | "other";
  sentido: "in" | "out";
  valor: number;
  motivo: string | null;
  em: string;
  por: string | null;
  estornado: boolean;
  e_estorno: boolean;
  pedido_id: string | null;
};

export type RecebimentoPorMetodo = {
  metodo: string;
  familia: string;
  total: number;
  na_gaveta?: boolean;
};

export type CaixaFechado = {
  aberto: false;
  dinheiro_fora_da_gaveta: number;
  ultima: {
    sessao_id: string;
    fechada_em: string;
    esperado: number;
    contado: number;
    diferenca: number;
  } | null;
};

export type CaixaAberto = {
  aberto: true;
  sessao_id: string;
  data_operacional: string;
  aberta_em: string;
  aberta_por: string | null;
  fundo: number;
  esperado_em_dinheiro: number;
  alerta_caixa_antigo: boolean;
  dinheiro_fora_da_gaveta: number;
  recebimentos_por_metodo: RecebimentoPorMetodo[];
  movimentos: MovimentoDoCaixa[];
};

export type EstadoDoCaixa = CaixaAberto | CaixaFechado;

export type ResumoDeFechamento = {
  ok: true;
  sessao_id: string;
  status: "open" | "closed";
  data_operacional: string;
  aberta_em: string;
  fechada_em: string | null;
  fundo_inicial: number;
  recebimentos_por_metodo: RecebimentoPorMetodo[];
  recebido_em_dinheiro: number;
  reforcos: number;
  sangrias: number;
  despesas_pelo_caixa: number;
  entradas_pelo_caixa: number;
  estornos: number;
  esperado_em_dinheiro: number;
  contado: number | null;
  diferenca: number | null;
  justificativa: string | null;
  dinheiro_fora_da_gaveta: number;
  correcoes: { tipo: string; motivo: string; em: string; antes: unknown }[];
};

export type SessaoHistorica = {
  sessao_id: string;
  status: "open" | "closed";
  data_operacional: string;
  aberta_em: string;
  fechada_em: string | null;
  fundo: number;
  esperado: number | null;
  contado: number | null;
  diferenca: number | null;
  justificativa: string | null;
  fora_da_gaveta: number | null;
  corrigida: boolean;
};

export type CategoriaFinanceira = {
  id: string;
  nome: string;
  tipo: "income" | "expense" | "both";
  ativa: boolean;
  ordem: number;
  em_uso: boolean;
};

export type LancamentoFinanceiro = {
  id: string;
  tipo: "income" | "expense";
  valor: number;
  quando: string;
  descricao: string;
  categoria: string | null;
  forma: string | null;
  pelo_caixa: boolean;
  status: "confirmed" | "reversed";
  motivo_estorno: string | null;
  corrige: string | null;
  por: string | null;
};

/** O esperado do checkout ao lado do que realmente entrou (RN-PGTO-002). */
export type PagamentoDoPedido = {
  esperado: {
    metodo: string;
    familia: string;
    bandeira: string | null;
    valor: number;
    precisa_troco: boolean;
    troco_para: number | null;
    troco_esperado: number | null;
    pix: string | null;
  } | null;
  realizado: {
    id: string;
    metodo: string | null;
    familia: string | null;
    bandeira: string | null;
    valor: number;
    recebido: number | null;
    troco: number | null;
    status: "pending" | "confirmed" | "reversed";
    em: string | null;
    na_gaveta: boolean;
    motivo_estorno: string | null;
  }[];
  total_realizado: number;
  total_do_pedido: number;
  situacao: "pending" | "confirmed" | "reversed";
};

export type Resultado =
  | { ok: true; mensagem?: string }
  | { ok: false; erro: string; exigeJustificativa?: boolean; semCaixa?: boolean };
