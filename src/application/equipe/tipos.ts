/**
 * Movimentações internas e o histórico financeiro do funcionário.
 *
 * DUAS COISAS SEPARADAS, e a separação é de permissão, não de tela
 * (CLAUDE.md §15, §27):
 *
 *   MovimentoInterno   — saída de produto que NÃO é venda. Quem registra
 *                        consumo precisa de `internal.register`.
 *   LancamentoDoFuncionario — o livro de quem deve o quê. Só aparece com
 *                        `employees.finance.view`, e só se escreve com
 *                        `employees.finance.manage`.
 *
 * Registrar o consumo de alguém NÃO abre o livro dessa pessoa, e o livro
 * NUNCA contém salário: salário mora em `employee_financial_profiles`, com
 * a permissão dele (RN-EMPFIN-001).
 */

export type TipoDeMovimento =
  | "courtesy"
  | "employee_consumption"
  | "owner_consumption"
  | "loss";

export type TipoDeLancamento =
  | "consumption"
  | "advance"
  | "discrepancy"
  | "adjustment"
  | "other";

export type ItemDoMovimento = {
  nome: string;
  tamanho: string | null;
  quantidade: number;
  /**
   * Preço DE REFERÊNCIA, vindo do mesmo configurador do cardápio. Serve para
   * dimensionar o movimento no relatório — não é receita e não é cobrança.
   */
  preco_referencia: number | null;
  observacao: string | null;
};

export type MovimentoInterno = {
  movimento_id: string;
  tipo: TipoDeMovimento;
  status: "confirmed" | "reversed";
  funcionario_id: string | null;
  funcionario: string | null;
  motivo: string;
  observacao: string | null;
  quando: string;
  autorizado_por: string | null;
  estornado_em: string | null;
  motivo_do_estorno: string | null;
  itens: ItemDoMovimento[];
  valor_referencia: number;
  /**
   * Virou lançamento no livro de alguém? Quem não tem permissão financeira
   * recebe `false` — a RLS do livro não devolve a linha, e está certo.
   */
  tem_lancamento: boolean;
};

export type LancamentoDoFuncionario = {
  lancamento_id: string;
  tipo: TipoDeLancamento;
  valor: number;
  quando: string;
  motivo: string;
  observacao: string | null;
  status: "confirmed" | "reversed";
  corrida_id: string | null;
  movimento_id: string | null;
  anexo_id: string | null;
  estornado_em: string | null;
  motivo_do_estorno: string | null;
};

export type HistoricoDoFuncionario = {
  funcionario_id: string;
  lancamentos: LancamentoDoFuncionario[];
  /**
   * Somatório de CONFERÊNCIA. Não é saldo devedor exigível, não desconta de
   * salário e não vira folha (RN-EMPFIN-003).
   */
  total_confirmado: number;
};

export type Resultado =
  | { ok: true }
  | {
      ok: false;
      erro: string;
      /** O movimento já virou lançamento: estorne o lançamento primeiro. */
      temLancamento?: boolean;
      /** Corrida ou movimento já lançado uma vez. */
      jaLancado?: boolean;
    };
