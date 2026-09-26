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
};
