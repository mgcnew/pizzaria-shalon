/**
 * Contrato do configurador compartilhado.
 *
 * O MESMO núcleo serve o cardápio público, o pedido manual do balcão e a
 * inclusão de item numa alteração. Não existe "configurador do admin":
 * existe UM configurador, com invólucros diferentes (CLAUDE.md §17).
 *
 * Aqui só vivem os tipos. As regras — quais tamanhos existem, quais sabores
 * cabem, quanto custa — continuam no banco, consultadas pelas mesmas
 * projeções públicas e precificadas pela mesma `montar_item`.
 */

import type {
  ItemMontado,
  OpcaoPreco,
  ProdutoDetalhe,
  SaborPublico,
  TamanhoPublico,
} from "@/application/publico/tipos";

/** Sabores, bordas e adicionais são POR TAMANHO (RN-BORDA-002, RN-ADD-002). */
export type DadosPorTamanho = Record<
  string,
  { sabores: SaborPublico[]; bordas: OpcaoPreco[]; adicionais: OpcaoPreco[] }
>;

/** Tudo que o núcleo precisa para funcionar, venha de onde vier. */
export type DadosDoConfigurador = {
  produto: ProdutoDetalhe;
  tamanhos: TamanhoPublico[];
  porTamanho: DadosPorTamanho;
  /** Primeiro preço, já calculado no servidor: a tela abre com valor. */
  montadoInicial: ItemMontado;
};

/** As escolhas do usuário, do jeito que a tela as mantém. */
export type Escolhas = {
  variacaoId: string | null;
  /** Sabores ADICIONAIS; o principal é a própria variação. */
  sabores: string[];
  bordaId: string | null;
  adicionais: string[];
  observacao: string;
  quantidade: number;
};

/**
 * O resultado de uma configuração confirmada.
 *
 * `montado` é a resposta do servidor: nome, rótulos, preço unitário e total.
 * Nenhum invólucro recalcula nada a partir dele.
 */
export type ItemConfigurado = {
  produtoId: string;
  produtoSlug: string;
  escolhas: Escolhas;
  /** Sabores completos, com o principal incluído — o que o servidor espera. */
  saboresCompletos: string[];
  montado: Extract<ItemMontado, { ok: true }>;
};
