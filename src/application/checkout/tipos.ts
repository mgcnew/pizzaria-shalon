/**
 * Tipos do checkout.
 *
 * Regra que atravessa o arquivo inteiro: NENHUM tipo enviado pelo navegador
 * carrega valor monetário com poder de decisão. O único número que o cliente
 * manda e que é comparado — nunca aceito — é `preco_unitario_visto`, usado
 * para detectar que o preço mudou desde que ele viu (RN-VALID-003).
 */

export type Modalidade = "delivery" | "pickup";

/** Endereço como o cliente digita. */
export type EnderecoInformado = {
  /** Endereço já salvo do cliente; quando vem, os campos abaixo o descrevem. */
  id?: string | null | undefined;
  rotulo?: string | null | undefined;
  logradouro: string;
  numero: string;
  complemento?: string | null | undefined;
  bairro: string;
  cidade: string;
  uf: string;
  cep?: string | null | undefined;
  referencia?: string | null | undefined;
};

export type FormaDePagamento = {
  id: string;
  nome: string;
  familia: "cash" | "debit" | "credit" | "pix_machine" | "pix_key" | "voucher" | "other";
  exige_bandeira: boolean;
  permite_troco: boolean;
  ordem: number;
  bandeiras: { id: string; nome: string }[];
};

/** Cotação de entrega: informativa. A autoridade é o recálculo em `criar_pedido`. */
export type CotacaoEntrega =
  | {
      ok: true;
      distancia_km: number;
      taxa: number;
      exige_aprovacao: boolean;
      pedido_minimo_ativo: boolean;
      pedido_minimo_valor: number | null;
      endereco_formatado: string;
      latitude: number;
      longitude: number;
      confianca: "exata" | "aproximada";
      provedor: string;
    }
  | {
      ok: false;
      erro: string;
      /** Distingue "não sei onde é" de "sei, mas é longe demais". */
      motivo:
        | "endereco_nao_encontrado"
        | "endereco_ambiguo"
        | "fora_de_area"
        | "rota_indisponivel"
        | "nao_configurado";
      distancia_km?: number;
      distancia_maxima_km?: number | null;
    };

/** Item enviado ao criar o pedido: escolhas, não preço. */
export type ItemDoPedido = {
  linha: string;
  produto_id: string;
  variacao_id?: string | null | undefined;
  sabores?: string[] | undefined;
  borda_id?: string | null | undefined;
  adicionais?: string[] | undefined;
  observacao?: string | undefined;
  quantidade: number;
  /** O que o cliente viu. Comparado, jamais aceito (RN-VALID-003). */
  preco_unitario_visto?: number | null | undefined;
};

export type PedidoParaEnviar = {
  /** Gerada no navegador e reenviada em cada tentativa: clique duplo vira um pedido. */
  idempotency_key: string;
  modalidade: Modalidade;
  cliente: {
    nome: string;
    whatsapp: string;
    consentimento_marketing?: boolean | undefined;
  };
  endereco?: EnderecoInformado | null | undefined;
  itens: ItemDoPedido[];
  pagamento: {
    forma_id: string;
    bandeira_id?: string | null | undefined;
    precisa_troco?: boolean | undefined;
    troco_para?: number | null | undefined;
  };
  observacao_geral?: string | null | undefined;
  /** Credencial do navegador para "Meus pedidos". Não é login (03 §11). */
  dispositivo_token?: string | null | undefined;
};

export type ResultadoEnvio =
  | {
      ok: true;
      ja_existia: boolean;
      numero: number;
      status: string;
      total: number;
      token: string;
    }
  | {
      ok: false;
      erro: string;
      /** Divergência comercial: exige reconfirmação, não é erro técnico. */
      reconfirmar?: boolean;
      divergencias?: unknown[];
      loja_fechada?: boolean;
      fora_de_area?: boolean;
      pedido_minimo?: boolean;
      minimo?: number;
      troco_invalido?: boolean;
      endereco_ambiguo?: boolean;
      rota_indisponivel?: boolean;
    };

/** Projeção pública do acompanhamento (03 §10). Sem telefone completo. */
export type PedidoPublico = {
  ok: true;
  numero: number;
  status: string;
  modalidade: Modalidade;
  criado_em: string;
  cliente_nome: string;
  itens: {
    nome: string;
    quantidade: number;
    total: number;
    tamanho: string | null;
    borda: string | null;
    observacao: string | null;
    sabores: string[] | null;
    adicionais: string[] | null;
  }[];
  subtotal: number;
  taxa_entrega: number;
  total: number;
  observacao: string | null;
  estimativa_min: number | null;
  estimativa_max: number | null;
  aguarda_aprovacao_entrega: boolean;
  endereco: Record<string, string | null> | null;
  loja: Record<string, string | null>;
  pagamento: {
    forma: string | null;
    bandeira: string | null;
    troco_para: number | null;
    troco_esperado: number | null;
    pix_status: string | null;
  };
  motivo_rejeicao: string | null;
  motivo_cancelamento: string | null;
};

export type PixParaPagamento =
  | {
      ok: true;
      tipo: string;
      chave: string;
      titular: string;
      instrucoes: string | null;
      valor: number;
    }
  | { ok: false };
