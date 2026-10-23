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
export type TomVisual = "sucesso" | "atencao" | "perigo" | "info" | "neutro" | "producao" | "rota";

const ROTULOS_INTERNOS: Record<EstadoDoPedido, { rotulo: string; tom: TomVisual }> = {
  waiting_pix_confirmation: { rotulo: "Aguardando Pix", tom: "atencao" },
  waiting_delivery_approval: { rotulo: "Aprovar entrega", tom: "atencao" },
  waiting_store_confirmation: { rotulo: "Novo pedido", tom: "info" },
  change_requested_waiting_customer: { rotulo: "Aguardando cliente", tom: "atencao" },
  confirmed: { rotulo: "Aceito", tom: "sucesso" },
  in_production: { rotulo: "Em produção", tom: "producao" },
  ready_for_pickup: { rotulo: "Pronto — retirada", tom: "sucesso" },
  ready_for_delivery: { rotulo: "Pronto — entrega", tom: "sucesso" },
  out_for_delivery: { rotulo: "Saiu para entrega", tom: "rota" },
  delivery_failed: { rotulo: "Falha na entrega", tom: "perigo" },
  completed: { rotulo: "Concluído", tom: "neutro" },
  rejected: { rotulo: "Rejeitado", tom: "perigo" },
  cancelled: { rotulo: "Cancelado", tom: "perigo" },
};

/** Todos os estados que o banco aceita, para validar o que vem de uma URL. */
export const ESTADOS_DO_PEDIDO = Object.keys(ROTULOS_INTERNOS) as EstadoDoPedido[];

export function rotuloInterno(estado: string): { rotulo: string; tom: TomVisual } {
  return ROTULOS_INTERNOS[estado as EstadoDoPedido] ?? { rotulo: estado, tom: "neutro" };
}

/**
 * Estados "parados": o pedido não está na mão da equipe, está esperando alguém
 * ou deu errado — o cliente que respondeu a uma alteração, o cliente que vem
 * buscar, o motoboy que vai levar, a entrega que falhou.
 *
 * É a MESMA lista de "Prontos e parados", "Aguardando resposta do cliente" e
 * "Entregas com falha" da Central de Atenção do dashboard
 * (`central_de_atencao`). Duas telas contando "atenção" de jeitos diferentes
 * faziam o alerta do dashboard levar a uma fila em que o item alertado não
 * se destacava. Não há limite de tempo: o banco também não tem (o comentário
 * da própria função diz que aparece "sem carimbo de atraso").
 */
export const ESTADOS_PARADOS: readonly string[] = [
  "change_requested_waiting_customer",
  "ready_for_pickup",
  "ready_for_delivery",
  "delivery_failed",
];

export function parado(estado: string): boolean {
  return ESTADOS_PARADOS.includes(estado);
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

/**
 * De onde o pedido veio, e como o cliente o recebe — dois eixos, não um.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §0.3 · 02 §19
 *
 * `counter` é ORIGEM (entrou pelo balcão); `pickup` é MODALIDADE (o cliente
 * retira). Um pedido de WhatsApp para retirada tem os dois preenchidos e
 * diferentes, e é por isso que nunca se colapsa numa coluna só.
 *
 * Estes mapas eram privados do PDV e a fila de Pedidos mostrava os valores
 * CRUS — a tabela dizia "counter · Retirada" para quem opera em português.
 * Uma tradução só, nas duas telas, pelo mesmo motivo de `formatarEspera`.
 *
 * O `?? valor` no fim é deliberado: origem nova vinda do banco aparece como
 * veio, em vez de virar vazio. Rótulo desconhecido é problema de tradução;
 * célula em branco é perda de informação.
 */
const ORIGENS: Record<string, string> = {
  counter: "Balcão",
  shalon_link: "Link Shalon",
  whatsapp: "WhatsApp",
  phone: "Telefone",
  ifood: "iFood",
  other: "Outro",
};

const MODALIDADES: Record<string, string> = {
  pickup: "Retirada",
  delivery: "Entrega",
};

export function rotuloDeOrigem(origem: string): string {
  return ORIGENS[origem] ?? origem;
}

export function rotuloDeModalidade(modalidade: string): string {
  return MODALIDADES[modalidade] ?? modalidade;
}

/**
 * Estados em que dá para acrescentar itens a pedido do cliente
 * (D-2026-10-17-154). Espelha `acrescentar_itens`, que decide de novo.
 */
export const ESTADOS_COM_ACRESCIMO: readonly string[] = [
  "waiting_store_confirmation",
  "confirmed",
  "in_production",
  "ready_for_pickup",
  "ready_for_delivery",
];
