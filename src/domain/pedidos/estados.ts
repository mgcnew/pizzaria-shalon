/**
 * Como cada estado do pedido é dito ao cliente.
 *
 * 04-REGRAS-NEGOCIO.md RN-EST-001 a RN-EST-014 · 01 §79.12
 *
 * Domínio puro: apenas a tradução do estado técnico para a frase que o
 * cliente lê. Nenhuma transição acontece aqui — mudar estado é operação de
 * domínio no servidor (CLAUDE.md §21), nunca efeito de renderizar uma tela.
 */

export type EstadoDoPedido =
  | "waiting_pix_confirmation"
  | "waiting_delivery_approval"
  | "waiting_store_confirmation"
  | "change_requested_waiting_customer"
  | "confirmed"
  | "in_production"
  | "ready_for_pickup"
  | "ready_for_delivery"
  | "out_for_delivery"
  | "delivery_failed"
  | "completed"
  | "rejected"
  | "cancelled";

export type TomDoEstado = "aguardando" | "andamento" | "concluido" | "problema";

export type DescricaoDoEstado = {
  titulo: string;
  detalhe: string;
  tom: TomDoEstado;
  /** Verdadeiro enquanto o pedido ainda depende de algo que a Shalon fará. */
  emAberto: boolean;
};

const DESCRICOES: Record<EstadoDoPedido, DescricaoDoEstado> = {
  waiting_pix_confirmation: {
    titulo: "Aguardando o Pix",
    detalhe:
      "Faça o Pix com a chave abaixo. O preparo começa quando a pizzaria confirmar o recebimento.",
    tom: "aguardando",
    emAberto: true,
  },
  waiting_delivery_approval: {
    titulo: "Aguardando aprovação da entrega",
    detalhe:
      "Seu endereço fica além da nossa área automática. A pizzaria vai avaliar e responder.",
    tom: "aguardando",
    emAberto: true,
  },
  waiting_store_confirmation: {
    titulo: "Pedido enviado",
    detalhe: "A pizzaria recebeu seu pedido e vai confirmar em instantes.",
    tom: "aguardando",
    emAberto: true,
  },
  change_requested_waiting_customer: {
    titulo: "A pizzaria propôs uma alteração",
    detalhe: "Confira a proposta: nada muda no seu pedido sem o seu aceite.",
    tom: "aguardando",
    emAberto: true,
  },
  confirmed: {
    titulo: "Pedido confirmado",
    detalhe: "A pizzaria aceitou seu pedido.",
    tom: "andamento",
    emAberto: true,
  },
  in_production: {
    titulo: "Em preparo",
    detalhe: "Sua pizza está no forno.",
    tom: "andamento",
    emAberto: true,
  },
  ready_for_pickup: {
    titulo: "Pronto para retirada",
    detalhe: "Pode vir buscar.",
    tom: "andamento",
    emAberto: true,
  },
  ready_for_delivery: {
    titulo: "Pronto, aguardando o entregador",
    detalhe: "Seu pedido está pronto e sai para entrega em instantes.",
    tom: "andamento",
    emAberto: true,
  },
  out_for_delivery: {
    titulo: "Saiu para entrega",
    detalhe: "O entregador está a caminho.",
    tom: "andamento",
    emAberto: true,
  },
  delivery_failed: {
    titulo: "Não conseguimos entregar",
    detalhe: "A pizzaria vai falar com você pelo WhatsApp.",
    tom: "problema",
    emAberto: true,
  },
  completed: {
    titulo: "Pedido concluído",
    detalhe: "Obrigado! Esperamos você de novo.",
    tom: "concluido",
    emAberto: false,
  },
  rejected: {
    titulo: "Pedido recusado",
    detalhe: "A pizzaria não pôde atender este pedido.",
    tom: "problema",
    emAberto: false,
  },
  cancelled: {
    titulo: "Pedido cancelado",
    detalhe: "Este pedido foi cancelado.",
    tom: "problema",
    emAberto: false,
  },
};

const DESCONHECIDO: DescricaoDoEstado = {
  titulo: "Pedido em andamento",
  detalhe: "A pizzaria está cuidando do seu pedido.",
  tom: "andamento",
  emAberto: true,
};

/**
 * Traduz o estado.
 *
 * Um estado desconhecido não quebra a tela nem expõe o código técnico: o
 * cliente vê uma frase genérica e verdadeira.
 */
export function descreverEstado(estado: string): DescricaoDoEstado {
  return DESCRICOES[estado as EstadoDoPedido] ?? DESCONHECIDO;
}

/**
 * Como cada estado é dito para QUEM OPERA.
 *
 * Diferente de `descreverEstado`, que fala com o cliente. No balcão o que
 * importa é o que precisa ser feito agora, e o rótulo é curto porque
 * convive com muitos pedidos na mesma tela.
 *
 * O tom acompanha as famílias tonais do design. Ele NUNCA é a única pista:
 * o rótulo sempre aparece junto (CLAUDE.md §38).
 */
export type TomVisual = "sucesso" | "atencao" | "perigo" | "info" | "neutro";

const ROTULOS_INTERNOS: Record<EstadoDoPedido, { rotulo: string; tom: TomVisual }> = {
  waiting_pix_confirmation: { rotulo: "Aguardando Pix", tom: "atencao" },
  waiting_delivery_approval: { rotulo: "Aprovar entrega", tom: "atencao" },
  waiting_store_confirmation: { rotulo: "Novo pedido", tom: "info" },
  change_requested_waiting_customer: { rotulo: "Aguardando cliente", tom: "atencao" },
  confirmed: { rotulo: "Aceito", tom: "sucesso" },
  in_production: { rotulo: "Em produção", tom: "info" },
  ready_for_pickup: { rotulo: "Pronto — retirada", tom: "sucesso" },
  ready_for_delivery: { rotulo: "Pronto — entrega", tom: "sucesso" },
  out_for_delivery: { rotulo: "Saiu para entrega", tom: "info" },
  delivery_failed: { rotulo: "Falha na entrega", tom: "perigo" },
  completed: { rotulo: "Concluído", tom: "neutro" },
  rejected: { rotulo: "Rejeitado", tom: "perigo" },
  cancelled: { rotulo: "Cancelado", tom: "perigo" },
};

export function rotuloInterno(estado: string): { rotulo: string; tom: TomVisual } {
  return ROTULOS_INTERNOS[estado as EstadoDoPedido] ?? { rotulo: estado, tom: "neutro" };
}

/**
 * Estados que exigem alguém agora.
 *
 * Usado para ordenar a fila e para o alerta: pedido novo, Pix por conferir e
 * entrega por aprovar são interrupções, o resto é andamento.
 */
export function exigeAtencao(estado: string): boolean {
  return (
    estado === "waiting_store_confirmation" ||
    estado === "waiting_pix_confirmation" ||
    estado === "waiting_delivery_approval"
  );
}
