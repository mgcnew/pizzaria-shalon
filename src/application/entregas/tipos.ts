/**
 * Entregas, corridas de motoboy e acerto.
 *
 * O VOCABULÁRIO IMPORTA AQUI mais que em qualquer outro módulo, porque quatro
 * coisas que parecem uma só são quatro (CLAUDE.md §26):
 *
 *   `situacao`             — o pedido chegou ao cliente?
 *   `recebido`             — a Shalon registrou recebimento por esse pedido?
 *   `dinheiro_na_rua`      — quanto está fisicamente com o motoboy?
 *   `ja_entrou_na_gaveta`  — esse dinheiro já virou caixa?
 *
 * Um pedido pode estar entregue, pago, e ainda assim NÃO ser caixa. Os nomes
 * abaixo existem para que ninguém escreva `total` onde deveria ler `recebido`.
 */

export type SituacaoDaEntrega = "pending" | "delivered" | "failed" | "reassigned";
export type StatusDaCorrida = "open" | "out" | "settling" | "settled";

/** Pedido pronto para sair, ainda sem motoboy. */
export type EntregaAguardando = {
  pedido_id: string;
  numero: number;
  cliente: string;
  endereco: Record<string, unknown> | null;
  total: number;
  taxa: number;
  pagamento_esperado: string | null;
  familia_esperada: string | null;
  /** Já pago ANTES de sair. Não muda o fluxo; muda o que o motoboy cobra. */
  ja_pago: boolean;
  pronto_desde: string | null;
};

/** Uma corrida viva, como o painel a resume. */
export type CorridaResumo = {
  corrida_id: string;
  status: StatusDaCorrida;
  motoboy_id: string;
  motoboy: string;
  criada_em: string;
  saiu_em: string | null;
  voltou_em: string | null;
  pedidos: number;
  pendentes: number;
  /** RN-CAIXA-014: dinheiro COM O MOTOBOY. Não é caixa. */
  dinheiro_na_rua: number;
};

export type MotoboyDisponivel = {
  funcionario_id: string;
  nome: string;
  ocupado: boolean;
};

export type CentralDeEntregas = {
  aguardando: EntregaAguardando[];
  corridas: CorridaResumo[];
  motoboys: MotoboyDisponivel[];
};

/** Um pedido dentro da corrida, com a separação entregue ≠ recebido ≠ caixa. */
export type PedidoDaCorrida = {
  vinculo_id: string;
  pedido_id: string;
  numero: number;
  cliente: string;
  endereco: Record<string, unknown> | null;
  total: number;
  situacao: SituacaoDaEntrega;
  motivo_da_falha: string | null;
  entregue_em: string | null;
  pagamento_esperado: string | null;
  familia_esperada: string | null;
  recebido: number;
  recebido_em_dinheiro: number;
  ja_entrou_na_gaveta: boolean;
};

export type AcertoDaCorrida = {
  acerto_id: string;
  esperado: number;
  devolvido: number;
  diferenca: number;
  motivo: string | null;
  observacao: string | null;
  acertado_em: string;
  /** RN-RUN-006: a diferença virou lançamento do funcionário? */
  lancamento_id: string | null;
};

export type Corrida = {
  corrida_id: string;
  status: StatusDaCorrida;
  motoboy_id: string;
  motoboy: string;
  criada_em: string;
  saiu_em: string | null;
  voltou_em: string | null;
  acertada_em: string | null;
  observacao: string | null;
  pedidos: PedidoDaCorrida[];
  esperado_em_dinheiro: number;
  /** Entregue e sem recebimento registrado. Não trava o acerto; é avisado. */
  pedidos_sem_pagamento: number;
  acerto: AcertoDaCorrida | null;
};

export type CorridaHistorica = {
  corrida_id: string;
  motoboy: string;
  saiu_em: string | null;
  acertada_em: string | null;
  pedidos: number;
  falhas: number;
  esperado: number | null;
  devolvido: number | null;
  diferenca: number | null;
  motivo: string | null;
};

export type Resultado =
  | { ok: true }
  | {
      ok: false;
      erro: string;
      /** RN-RUN-004: há diferença; a tela precisa pedir o motivo. */
      exigeMotivo?: boolean;
      /** Dinheiro a recolher sem caixa aberto. */
      semCaixa?: boolean;
      /** Quanto o servidor calculou que deveria voltar. */
      esperado?: number;
    };
