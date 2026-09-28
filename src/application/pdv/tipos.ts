/**
 * Tipos do PDV — Fase 12, Etapa 4.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §2.1, §2.3, §6.1
 *
 * Nenhum cálculo comercial aqui: preço efetivo, disponibilidade e a decisão de
 * "precisa escolher tamanho" chegam prontos do banco, que é a autoridade
 * (CLAUDE.md §16).
 */

/** Uma variante oferecida, como o configurador do PDV precisa dela. */
export type VarianteDoPdv = {
  id: string;
  tamanho_id: string;
  tamanho_nome: string;
  fatias: number;
  max_sabores: number;
  preco: number;
  preco_de: number;
  em_promocao: boolean;
  disponivel: boolean;
};

/**
 * O resultado de um bipe.
 *
 * É UMA UNIÃO DISCRIMINADA DE PROPÓSITO, e isso não é preciosismo de tipo: no
 * caso `precisa_escolher_variante: true` **não existe** o campo `variante_id`.
 * O compilador passa a impedir que a tela leia um tamanho escolhido que ninguém
 * escolheu — a mesma garantia que a RPC dá em SQL, repetida onde o erro seria
 * cometido.
 *
 * Os cinco casos cobrem exatamente o que a RPC devolve, e a tela tem de tratar
 * todos: sem permissão, não encontrado, variante, produto simples, e produto que
 * exige escolha.
 */
export type ResolucaoDeCodigo =
  | { ok: false; bloqueio: "sem_permissao"; erro: string }
  | { ok: true; encontrado: false; codigo_normalizado: string }
  | {
      ok: true;
      encontrado: true;
      alvo: "variante";
      precisa_escolher_variante: false;
      codigo: string;
      codigo_normalizado: string;
      variante_id: string;
      produto_id: string;
      produto_nome: string;
      produto_slug: string;
      tipo: string;
      tamanho_id: string;
      tamanho_nome: string;
      fatias: number;
      max_sabores: number;
      preco: number;
      preco_de: number;
      em_promocao: boolean;
      ativo: boolean;
      disponivel: boolean;
      /** Exige preparo: a Nova Venda recusa e manda para a área de Pedidos. */
      exige_producao: boolean;
    }
  | {
      ok: true;
      encontrado: true;
      alvo: "produto";
      precisa_escolher_variante: false;
      codigo: string;
      codigo_normalizado: string;
      produto_id: string;
      produto_nome: string;
      produto_slug: string;
      tipo: string;
      preco: number;
      preco_de: number | null;
      em_promocao: boolean;
      ativo: boolean;
      disponivel: boolean;
      /** Exige preparo: a Nova Venda recusa e manda para a área de Pedidos. */
      exige_producao: boolean;
    }
  | {
      ok: true;
      encontrado: true;
      alvo: "produto";
      precisa_escolher_variante: true;
      codigo: string;
      codigo_normalizado: string;
      produto_id: string;
      produto_nome: string;
      produto_slug: string;
      tipo: string;
      ativo: boolean;
      disponivel: boolean;
      /** Exige preparo: a Nova Venda recusa e manda para a área de Pedidos. */
      exige_producao: boolean;
      /** As variantes ATIVAS, para o configurador abrir sem outra ida ao servidor. */
      variantes: VarianteDoPdv[];
    };

/** Uma linha da busca interna do PDV. */
export type ItemCatalogoPdv = {
  id: string;
  nome: string;
  slug: string;
  tipo: string;
  descricao: string | null;
  categoria_nome: string;
  preco_de: number | null;
  preco: number | null;
  em_promocao: boolean;
  /** Cadastro ativo. Item inativo APARECE na busca interna, com a bandeira. */
  ativo: boolean;
  disponivel: boolean;
  tem_variante_ativa: boolean;
  variantes: VarianteDoPdv[];
  codigo_primario: string | null;
  /** Verdadeiro quando o termo casou um código exato deste item. */
  casou_codigo: boolean;
  /**
   * Exige preparo, e por isso NÃO se vende pela Nova Venda do PDV.
   *
   * Vem do servidor, de `buscar_catalogo_pdv` — não de uma lista que a tela
   * montou. A Nova Venda é venda rápida de balcão; pizza e fogazza entram
   * pela área de Pedidos, que é onde o pedido de produção pertence.
   */
  exige_producao: boolean;
};

/**
 * Uma linha da fila de recebimento — Fase 12, Etapa 5.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §1.3, §4.2, §6.1 · D-2026-09-26-79 · D-2026-09-26-80
 *
 * OS DOIS EIXOS SÃO DOIS CAMPOS, e é deliberado que nenhum dos dois derive do
 * outro: `status_operacional` diz onde está a pizza, `status_financeiro` diz se
 * o cliente pagou. Um pedido `in_production` com `pending` é normal, e é
 * exatamente o caso de uso 3 do documento (§1.3).
 *
 * `status_financeiro` chega COMO ESTÁ, `pending` ou `reversed`, e a tela mostra
 * rótulos diferentes para os dois. Colapsar `reversed` em "Pendente" esconderia
 * do operador que aquele dinheiro já foi devolvido por decisão da casa
 * (D-2026-09-26-79).
 *
 * `origem` e `modalidade` também são coisas distintas: `counter` é Balcão e
 * responde "de onde veio o pedido"; `pickup`/`delivery` é Retirada/Entrega e
 * responde "como o cliente recebe". Não existe modalidade `balcao`
 * (D-2026-09-26-80).
 *
 * Os campos `*_esperado` vêm de `order_payment_intents`: são a INTENÇÃO
 * declarada pelo cliente, nunca um pagamento (CLAUDE.md §24). Nada aqui é
 * autoridade sobre dinheiro recebido — isto é uma lista.
 */
export type PedidoAReceber = {
  id: string;
  numero: number;
  /** `counter`, `whatsapp`, `phone`, `shalon_link`, `ifood`, `other`. */
  origem: string;
  /** `pickup` ou `delivery`. Somente esses dois. */
  modalidade: string;
  cliente_nome: string | null;
  cliente_whatsapp: string | null;
  total: number;
  status_operacional: string;
  /** `pending` ou `reversed`. NUNCA apresentados com o mesmo rótulo. */
  status_financeiro: string;
  criado_em: string;
  /** Idade calculada NO BANCO, para não depender do relógio do navegador. */
  idade_minutos: number;
  forma_esperada: string | null;
  bandeira_esperada: string | null;
  valor_esperado: number | null;
  precisa_troco: boolean;
  troco_para: number | null;
  troco_esperado: number | null;
};

/** Venda que já passou pelo caixa, qualquer que seja sua origem operacional. */
export type VendaNoHistoricoDoPdv = {
  pedido_id: string;
  numero: number;
  origem: string;
  cliente: string | null;
  modalidade: string;
  status_pedido: string;
  situacao_pagamento: "confirmed" | "reversed" | string;
  exige_producao: boolean;
  total_pedido: number;
  valor_pago: number;
  formas: string;
  criado_em: string;
  pago_em: string;
  estornado_em: string | null;
  pode_estornar: boolean;
};
