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

/**
 * `reassigned` é troca ANTES de sair — o pedido nunca esteve na rua com aquele
 * motoboy. `transferred` é transferência DEPOIS: ele estava levando. A
 * diferença entre "ia levar" e "estava levando" importa no acerto.
 */
export type SituacaoDaEntrega =
  | "pending"
  | "delivered"
  | "failed"
  | "reassigned"
  | "transferred";
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
  /** Fiado (D-2026-10-17-153): o motoboy não cobra este pedido. */
  fiado?: boolean;
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
  /** Entregas que saíram com este motoboy e passaram a outro (RN-RUN-008). */
  transferidos: number;
  /** RN-CAIXA-014: dinheiro COM O MOTOBOY. Não é caixa, e pertence a uma corrida só. */
  dinheiro_na_rua: number;
  /** Troco que o motoboy levou da gaveta (0179). Ausente num servidor sem a 0179. */
  troco?: number;
};

export type MotoboyDisponivel = {
  funcionario_id: string;
  nome: string;
  ocupado: boolean;
  /**
   * Presença de HOJE (dia de trabalho, que vira às 5h): `present`, `absent` ou
   * `null` quando ninguém marcou. Ausente num servidor sem a 0172.
   */
  presenca?: "present" | "absent" | null;
};

/** O mês de presença dos entregadores (0172). */
export type PresencaDoMes = {
  /** Primeiro dia do mês, `YYYY-MM-DD`. */
  mes: string;
  funcionarios: {
    funcionario_id: string;
    nome: string;
    ativo: boolean;
    veio: number;
    faltou: number;
    dias: { data: string; status: "present" | "absent" }[];
  }[];
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
  /** Para quem esta entrega foi, se saiu daqui. */
  transferida_para: string | null;
  motivo_da_transferencia: string | null;
  /** De quem esta entrega veio, se chegou aqui transferida. */
  recebida_de: string | null;
  /**
   * RN-RUN-009: o dinheiro deste pedido ficou com quem saiu, não com quem
   * entregou. O acerto desta corrida NÃO vai cobrá-lo.
   */
  dinheiro_com_o_anterior: boolean;
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
      /** Diferença no acerto que só quem concilia (`deliveries.settle`) aceita. */
      exigeConciliacao?: boolean;
      /** Dinheiro a recolher sem caixa aberto. */
      semCaixa?: boolean;
      /** Quanto o servidor calculou que deveria voltar. */
      esperado?: number;
      /** A entrega já foi conferida: não se transfere por fluxo comum. */
      jaConferida?: boolean;
      /** A corrida ainda não saiu — o caminho é a atribuição, não a transferência. */
      naoEstaEmRota?: boolean;
      /** O dinheiro deste pedido já entrou no caixa. */
      jaConciliado?: boolean;
    };

/** Uma entrega da corrida, na tela "Motoboy voltou" (D-2026-10-27-174). */
export type EntregaAReceber = {
  pedido_id: string;
  numero: number;
  cliente: string | null;
  bairro: string | null;
  total: number;
  forma_esperada: string | null;
  fiado: boolean;
  /** Já recebido do cliente, em qualquer forma. */
  pago: number;
  /** Dinheiro recebido que ainda está com o motoboy. */
  dinheiro_com_ele: number;
};

/** O que o motoboy precisa entregar ao voltar: as entregas e o troco. */
export type AReceberDoMotoboy = {
  corrida_id: string;
  status: StatusDaCorrida;
  motoboy: string;
  saiu_em: string | null;
  troco: number;
  /** Receber exige caixa aberto (RN-CAIXA-001). */
  caixa_aberto: boolean;
  pedidos: EntregaAReceber[];
  /** Dinheiro das entregas com ele mais o troco — o que o acerto cobra. */
  a_entregar: number;
};

/** Uma saída do dia, no histórico da página Entregas. */
export type SaidaDoDia = {
  corrida_id: string;
  status: StatusDaCorrida;
  motoboy: string;
  saiu_em: string | null;
  voltou_em: string | null;
  acertada_em: string | null;
  troco: number;
  entregas: { numero: number; cliente: string | null; bairro: string | null; total: number; situacao: SituacaoDaEntrega }[];
  esperado: number | null;
  devolvido: number | null;
  diferenca: number | null;
  motivo: string | null;
};
