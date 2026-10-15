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

/**
 * Funcionário, acesso e papel são TRÊS COISAS. O motoboy é a prova: ele
 * trabalha, recebe entrega, presta contas — e `acesso` é `null`, porque ele
 * não entra no sistema (CLAUDE.md §10.1, RN-MOTO-001).
 */
export type AcessoDoFuncionario = {
  app_user_id: string;
  ativo: boolean;
  ultimo_acesso: string | null;
  papeis: { id: string; nome: string }[];
};

export type MembroDaEquipe = {
  funcionario_id: string;
  nome: string;
  telefone: string | null;
  tipo: "owner" | "counter" | "driver" | "other";
  entregador: boolean;
  ativo: boolean;
  admitido_em: string | null;
  /** RN-FUNC-001: desligamento é data, nunca exclusão. */
  desligado_em: string | null;
  observacao: string | null;
  acesso: AcessoDoFuncionario | null;
};

/** Dados protegidos por `employees.finance.view`, separados de `equipe()`. */
export type ReferenciaSalarial = {
  funcionario_id: string;
  valor: number | null;
  base: "daily" | "monthly";
};

export type LancamentoParaConferencia = {
  id: string;
  tipo: TipoDeLancamento;
  valor: number;
  quando: string;
  motivo: string;
};

export type PapelAtribuivel = {
  id: string;
  nome: string;
  descricao: string | null;
  /**
   * RN-RBAC-005: falso quando este papel concede alguma permissão que quem
   * está olhando não possui. A interface não oferece o que a RPC recusaria.
   */
  pode_conceder: boolean;
};

export type LancamentoDoFuncionario = {
  lancamento_id: string;
  tipo: TipoDeLancamento;
  valor: number;
  quando: string;
  motivo: string;
  observacao: string | null;
  status: "confirmed" | "reversed";
  /** RN-EMPFIN-001: como o adiantamento foi pago, quando se sabe. */
  forma_pagamento: string | null;
  /** RN-EMPFIN-004: o outro lado do mesmo fato, quando saiu da gaveta. */
  movimento_caixa_id: string | null;
  pago_pela_gaveta: boolean;
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
      /** Adiantamento pela gaveta sem caixa aberto. */
      semCaixa?: boolean;
      /** RN-RBAC-005: o papel concede permissão que o ator não possui. */
      escalada?: boolean;
      /** Quais permissões faltam a quem tentou conceder. */
      faltam?: string;
      /** O funcionário já tem acesso ao sistema. */
      jaTemAcesso?: boolean;
      /** Não existe conta no Auth com esse e-mail. */
      contaInexistente?: boolean;
      /** Entregador com corrida por acertar. */
      temCorridaAberta?: boolean;
    };

/**
 * Diferença do acerto de um motoboy e o que a dona decidiu (RN-RUN-006, 0144).
 * Negativa é falta (ele trouxe menos); positiva é sobra.
 */
export type DiferencaDeAcerto = {
  acerto_id: string;
  corrida_id: string;
  funcionario_id: string;
  funcionario: string;
  acertado_em: string;
  esperado: number;
  devolvido: number;
  diferenca: number;
  motivo: string | null;
  situacao: "pendente" | "lancada" | "dispensada";
  lancamento_id: string | null;
  dispensada_em: string | null;
  motivo_da_dispensa: string | null;
};

/** Uma permissão do catálogo, com o que ela libera em linguagem de balcão. */
export type PermissaoDoCatalogo = { id: string; codigo: string };

/** Um papel com o conjunto de permissões que ele concede hoje. */
export type PapelComPermissoes = {
  id: string;
  nome: string;
  descricao: string | null;
  /** Papel da proprietária: sempre completo, não editável. */
  somenteLeitura: boolean;
  /** Códigos concedidos (ex.: `orders.view`). */
  codigos: string[];
};
