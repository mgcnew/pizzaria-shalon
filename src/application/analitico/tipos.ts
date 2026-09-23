/**
 * Inteligência operacional: o que aconteceu, medido nos registros reais.
 *
 * O VOCABULÁRIO É O PRODUTO AQUI. Quatro coisas que viram "faturamento" em
 * quase todo sistema são quatro coisas diferentes neste (CLAUDE.md §24, §27):
 *
 *   `vendas_registradas`    — pedidos concluídos no período. É venda.
 *   `faturamento_recebido`  — pagamentos confirmados no período. É dinheiro.
 *   `ainda_fora_da_gaveta`  — recebido que ainda não virou caixa físico.
 *   `internos`              — cortesia, consumo e perda. NÃO é receita.
 *
 * Nenhum tipo aqui tem `lucro`, `margem` ou `cmv`: sem custo no sistema,
 * esses números não existem, e nomeá-los seria convidar a inventá-los (§28).
 */

/** Chaves de período aceitas pelo banco. `personalizado` exige as duas datas. */
export type ChaveDePeriodo =
  | "hoje"
  | "ontem"
  | "7d"
  | "30d"
  | "mes_atual"
  | "personalizado";

export type Periodo = {
  ok: boolean;
  chave: ChaveDePeriodo;
  rotulo: string;
  de: string;
  ate: string;
  dias: number;
  /** Instantes absolutos no fuso da loja, fronteira [inicio, fim). */
  inicio: string;
  fim: string;
  inicio_anterior: string;
  fim_anterior: string;
  fuso: string;
};

/**
 * Variação contra o período anterior de MESMA duração.
 *
 * `comparavel: false` quando a base é zero — e aí `percentual` é nulo, em vez
 * de um "+100%" que não significa nada.
 */
export type Variacao = {
  de: number | null;
  para: number | null;
  diferenca: number;
  comparavel: boolean;
  percentual: number | null;
};

export type MedidasDoPeriodo = {
  pedidos: number;
  vendas_registradas: number;
  em_produtos: number;
  em_taxa_de_entrega: number;
  /** Nulo quando não houve pedido — zero diria algo diferente. */
  ticket_medio: number | null;
  faturamento_recebido: number;
  ainda_fora_da_gaveta: number;
  estornado_no_periodo: number;
  cancelados: number;
  rejeitados: number;
  falhas_de_entrega: number;
  valor_cancelado: number;
  por_origem: { origem: string; pedidos: number; valor: number }[];
  por_modalidade: { modalidade: string; pedidos: number; valor: number }[];
  por_forma: { forma: string; familia: string; pagamentos: number; valor: number }[];
};

export type MovimentoInterno = {
  tipo: string;
  movimentos: number;
  /** De REFERÊNCIA. Dimensiona o movimento; não é cobrança de ninguém. */
  valor_referencia: number;
};

export type ResumoAnalitico = {
  ok: true;
  periodo: Periodo;
  atual: MedidasDoPeriodo;
  anterior: MedidasDoPeriodo;
  internos: MovimentoInterno[];
  /** Vendido e ainda não recebido. Dito, não escondido. */
  nao_recebido_do_periodo: number;
  variacao: {
    vendas_registradas: Variacao;
    faturamento_recebido: Variacao;
    pedidos: Variacao;
    ticket_medio: Variacao;
  };
};

export type SemPermissao = { ok: false; sem_permissao?: boolean; erro: string };

/** Uma pendência da central: quantidade, espera e — quando houver régua — atraso. */
export type Pendencia = {
  quantidade: number;
  valor: number;
  mais_antigo_em: string | null;
  minutos_do_mais_antigo: number | null;
  /** Nulo = limite não configurado. A espera é real; o atraso é que não tem régua. */
  limite_minutos: number | null;
  atrasado: boolean | null;
  pedidos: {
    pedido_id: string;
    numero: number;
    cliente: string | null;
    total: number;
    modalidade: string;
    origem: string;
    criado_em: string;
    minutos: number;
  }[];
};

export type CentralDeAtencao = {
  ok: true;
  em: string;
  /** Ausente quando a pessoa não tem a permissão daquele domínio. */
  pedidos?: {
    aguardando_confirmacao: Pendencia;
    aguardando_pix: Pendencia;
    aguardando_aprovacao_de_entrega: Pendencia;
    aguardando_cliente: Pendencia;
    prontos_parados: Pendencia;
    entregas_com_falha: Pendencia;
  } | null;
  entregas?: {
    aguardando_acerto: {
      quantidade: number;
      mais_antiga_em: string | null;
      minutos_da_mais_antiga: number | null;
      limite_minutos: number | null;
      atrasada: boolean | null;
    };
    na_rua: { corridas: number; dinheiro_na_rua: number };
  } | null;
  caixa?: {
    aberto: boolean;
    sessao_id: string | null;
    data_operacional: string | null;
    aberto_de_ontem: boolean;
    esperado_em_dinheiro: number | null;
    dinheiro_fora_da_gaveta: number;
    ultimo_fechamento_com_diferenca: {
      sessao_id: string;
      fechada_em: string;
      diferenca: number;
      justificativa: string | null;
    } | null;
  } | null;
  clientes?: {
    em_atencao: number;
    afastados: number;
    exemplos: {
      cliente_id: string;
      nome: string;
      classificacao: string;
      dias_sem_comprar: number;
      intervalo_tipico: number | null;
      aceita_promocao: boolean;
    }[];
  } | null;
};

export type ProdutoNoRanking = {
  produto_id: string;
  nome: string;
  categoria: string | null;
  tipo: string;
  quantidade: number;
  pedidos: number;
  valor: number;
  quantidade_anterior: number;
  entrou_em: string;
  novo_no_periodo: boolean;
  disponivel_agora: boolean;
  /** Só quem esteve no catálogo o período inteiro E está disponível hoje. */
  elegivel_para_baixa_venda: boolean;
  motivo_da_inelegibilidade: string | null;
  tendencia: Variacao | null;
};

export type MovimentoDoPeriodo = {
  ok: true;
  periodo: Periodo;
  por_dia: { dia: string; pedidos: number; valor: number }[];
  por_dia_da_semana: {
    /** 0 = domingo, como o `extract(dow)` do Postgres. */
    dia_semana: number;
    pedidos: number;
    valor: number;
    /** Quantos dias daquele nome couberam no período. Sem isso a média engana. */
    dias_com_amostra: number;
    media_de_pedidos: number | null;
  }[];
  por_faixa_de_horario: { hora: number; pedidos: number; valor: number }[];
};

export type RankingDeProdutos = {
  ok: true;
  periodo: Periodo;
  limite: number;
  produtos: ProdutoNoRanking[];
  por_categoria: {
    categoria: string | null;
    quantidade: number;
    valor: number;
    produtos: number;
  }[];
  /** A-22: não há histórico de disponibilidade, e a tela diz isso. */
  ressalva_de_disponibilidade: string;
};
