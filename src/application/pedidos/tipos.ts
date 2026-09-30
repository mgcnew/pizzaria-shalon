/**
 * Tipos da operação interna de pedidos.
 *
 * Espelham as projeções do banco (migrations 0050, 0054 e 0055). O que a
 * interface pode fazer com um pedido NÃO é decidido aqui: vem em `acoes`,
 * já filtrado por permissão e por estado. Reimplementar a máquina de estados
 * em TypeScript criaria uma segunda verdade (CLAUDE.md §21).
 */

import type { EstadoDoPedido } from "@/domain/pedidos/estados";

export type Modalidade = "delivery" | "pickup";

export type AcaoDoPedido = {
  comando: string;
  rotulo: string;
  exige_motivo: boolean;
  destrutivo: boolean;
};

/** A aba Encerrados: a janela que o banco escolheu e os pedidos dentro dela. */
export type JanelaDeEncerrados = {
  /** Início da janela; `null` quando a consulta falhou. */
  desde: string | null;
  /** "caixa": desde a abertura do caixa aberto. "dia": começo de um dia de calendário. */
  origem: "caixa" | "dia";
  diasAnteriores: number;
  /** Há pedido encerrado antes do início da janela. */
  haMais: boolean;
  pedidos: PedidoNaFila[];
};

export type PedidoNaFila = {
  id: string;
  numero: number;
  status: EstadoDoPedido | string;
  modalidade: Modalidade;
  origem: string;
  cliente: string;
  subtotal: number;
  taxa_entrega: number;
  total: number;
  criado_em: string;
  aceito_em: string | null;
  estimativa_min: number | null;
  estimativa_max: number | null;
  observacao: string | null;
  distancia_km: number | null;
  itens: number;
  forma_pagamento: string | null;
  troco: number | null;
  /** Os bloqueios, cada um por nome — a tela diz o que falta resolver. */
  aguarda_pix: boolean;
  aguarda_aprovacao_entrega: boolean;
  aguarda_cliente: boolean;
  encerrado: boolean;
  acoes: AcaoDoPedido[];
};

export type ItemDoPedido = {
  linha: number;
  nome: string;
  categoria: string | null;
  quantidade: number;
  preco_unitario: number;
  total: number;
  tamanho: string | null;
  borda: string | null;
  observacao: string | null;
  sabores: { nome: string; porcao: number }[] | null;
  adicionais: string[] | null;
  combo: { nome: string; tamanho: string | null; quantidade: number }[] | null;
  /**
   * As ESCOLHAS que geraram o item — ids, não nomes.
   *
   * Serve para remontar o item numa alteração, onde `montar_item` precisa
   * reprecificar. O snapshot ao lado continua sendo o histórico do que foi
   * vendido; nome não é chave e não serve para reprecificar.
   */
  configuracao: {
    produto_id: string;
    variacao_id: string | null;
    sabores: string[];
    borda_id: string | null;
    adicionais: string[];
    observacao: string;
    quantidade: number;
  };
};

export type RevisaoDoPedido = {
  id: string;
  numero: number;
  status: "pending_customer" | "approved" | "rejected" | "withdrawn" | "applied";
  motivo: string;
  proposta_em: string;
  exige_cliente: boolean;
  total_antes: number;
  total_depois: number;
  itens_antes: { quantidade: number; nome: string }[];
};

export type ImpressaoDoPedido = {
  id: string;
  tipo: "comanda" | "alteracao";
  via: number;
  /** `requested` não significa impresso. Só `confirmed` significa. */
  status: "requested" | "sent" | "confirmed" | "error";
  transporte: string | null;
  erro: string | null;
  em: string;
};

export type PedidoAdministrativo = {
  id: string;
  numero: number;
  status: EstadoDoPedido | string;
  /**
   * `updated_at` do pedido. Viaja com a proposta de alteração para que o
   * servidor recuse uma edição feita sobre versão obsoleta (CLAUDE.md §34).
   */
  versao: string;
  modalidade: Modalidade;
  origem: string;
  criado_em: string;
  aceito_em: string | null;
  cliente: { nome: string; whatsapp: string };
  endereco: Record<string, string | null> | null;
  distancia_km: number | null;
  subtotal: number;
  taxa_entrega: number;
  total: number;
  observacao: string | null;
  estimativa_min: number | null;
  estimativa_max: number | null;
  motivo_rejeicao: string | null;
  motivo_cancelamento: string | null;
  aguarda_aprovacao_entrega: boolean;
  aprovacao_entrega: "pending" | "approved" | "rejected" | null;
  aguarda_cliente: boolean;
  pode_alterar: boolean;
  pode_retirar_alteracao: boolean;
  itens: ItemDoPedido[];
  pagamento: {
    forma: string | null;
    familia: string | null;
    bandeira: string | null;
    valor_esperado: number | null;
    troco_para: number | null;
    troco_esperado: number | null;
    pix_status: "pending" | "confirmed" | null;
    pix_confirmado_em: string | null;
  } | null;
  historico: {
    de: string | null;
    para: string;
    em: string;
    ator: string;
    motivo: string | null;
  }[];
  revisoes: RevisaoDoPedido[];
  impressoes: ImpressaoDoPedido[];
  acoes: AcaoDoPedido[];
};

export type ResultadoComando =
  | { ok: true; status: string }
  | { ok: false; erro: string; bloqueio?: "pix" | "entrega" | "alteracao" };

/**
 * Os canais previstos para pedido manual (RN-MAN-001).
 *
 * Os valores são os NORMATIVOS de `orders.source` (02 §19) — não strings
 * novas. `shalon_link` não aparece aqui de propósito: ele identifica o
 * pedido que veio do próprio link, e o balcão não o escolhe.
 */
export const ORIGENS_MANUAIS = [
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "phone", rotulo: "Telefone" },
  { valor: "counter", rotulo: "Balcão" },
  { valor: "ifood", rotulo: "iFood" },
  { valor: "other", rotulo: "Outro" },
] as const;

export type OrigemManual = (typeof ORIGENS_MANUAIS)[number]["valor"];

/** Um item já configurado, aguardando virar pedido. */
export type ItemDoRascunho = {
  linha: string;
  produtoId: string;
  produtoSlug: string;
  nome: string;
  variacaoId: string | null;
  sabores: string[];
  bordaId: string | null;
  adicionais: string[];
  observacao: string;
  quantidade: number;
  /** Preço que o SERVIDOR calculou para esta configuração. */
  precoUnitario: number;
  total: number;
  rotulos: string[];
};

/** Configuração de item como `configuracao_do_item` a devolve. */
export type ConfiguracaoSalva = {
  produto_id: string;
  variacao_id: string | null;
  sabores: string[];
  borda_id: string | null;
  adicionais: string[];
  observacao: string;
  quantidade: number;
};

export type EnderecoSalvo = {
  id: string;
  rotulo: string | null;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string | null;
  referencia: string | null;
  preferido: boolean;
};

/**
 * O que o balcão sabe do cliente pelo WhatsApp exato (RN-MAN-007). Espelha
 * `cliente_para_balcao` (migration 0140). Tudo aqui é SUGESTÃO: preço,
 * disponibilidade e bloqueio são decididos de novo na criação do pedido.
 */
export type ClienteNoBalcao = {
  cliente: {
    id: string;
    nome: string;
    desde: string;
    pedidos: number;
    ultimo_em: string | null;
    ticket_medio: number | null;
    bloqueado: boolean;
    motivo_bloqueio: string | null;
  };
  enderecos: EnderecoSalvo[];
  ultimo_pedido: {
    numero: number;
    em: string;
    modalidade: Modalidade;
    itens: { nome: string; produto_slug: string | null; configuracao: ConfiguracaoSalva }[];
  } | null;
  mais_pedidos: { nome: string; vezes: number; configuracao: ConfiguracaoSalva }[];
  pagamento_habitual: { forma_id: string; forma: string; pede_troco: boolean } | null;
};

export type ResultadoClienteNoBalcao =
  | { ok: true; encontrado: false }
  | ({ ok: true; encontrado: true } & ClienteNoBalcao)
  | { ok: false; erro: string };

/** Item remontado pelo motor para entrar no rascunho, ou o motivo de não entrar. */
export type ItemRemontado =
  | { ok: true; item: ItemDoRascunho }
  | { ok: false; nome: string; erro: string };
