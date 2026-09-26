/**
 * Tipos do catálogo compartilhados entre casos de uso e interface.
 *
 * Espelham o retorno das funções de listagem do banco (migration 0028).
 * Nenhum cálculo comercial acontece aqui: preço efetivo e disponibilidade
 * chegam prontos do banco, que é a autoridade (CLAUDE.md §16 e §17).
 */

export type TipoProduto = "pizza" | "fogazza" | "drink" | "combo" | "other";

export const TIPOS_PRODUTO: { valor: TipoProduto; rotulo: string }[] = [
  { valor: "pizza", rotulo: "Pizza" },
  { valor: "fogazza", rotulo: "Fogazza" },
  { valor: "drink", rotulo: "Bebida" },
  { valor: "combo", rotulo: "Combo" },
  { valor: "other", rotulo: "Outro" },
];

export type ProdutoAdmin = {
  id: string;
  nome: string;
  slug: string;
  tipo: TipoProduto;
  descricao: string | null;
  categoria_id: string;
  categoria_nome: string;
  categoria_pausada: boolean;
  ativo: boolean;
  disponivel_hoje: boolean;
  disponivel: boolean;
  destaque: boolean;
  preco_base: number | null;
  preco_min: number | null;
  preco_max: number | null;
  em_promocao: boolean;
  tamanhos: number;
  limite_por_pedido: number | null;
  limite_adicionais: number | null;
  imagem_path: string | null;
  ordem: number;
};

export type VariacaoAdmin = {
  id: string;
  tamanho_id: string;
  tamanho_nome: string;
  fatias: number;
  max_sabores: number;
  preco: number;
  preco_efetivo: number;
  ativa: boolean;
  disponivel_hoje: boolean;
  disponivel: boolean;
  em_promocao: boolean;
};

export type SituacaoPromocao = "vigente" | "agendada" | "encerrada" | "inativa";

export type PromocaoAdmin = {
  id: string;
  nome: string;
  alvo_tipo: "product" | "variant";
  alvo_nome: string | null;
  preco_promocional: number;
  preco_normal: number | null;
  inicio: string;
  fim: string | null;
  ativa: boolean;
  situacao: SituacaoPromocao;
  limite_por_pedido: number | null;
};

export type ComboAdmin = {
  id: string;
  nome: string;
  slug: string;
  preco: number | null;
  preco_efetivo: number | null;
  ativo: boolean;
  disponivel: boolean;
  componentes: number;
  composicao: string | null;
  soma_componentes: number | null;
};

export type BannerAdmin = {
  id: string;
  titulo: string | null;
  corpo: string | null;
  imagem_path: string;
  destino_tipo: "product" | "category" | "promotion" | "external" | "none";
  destino_nome: string | null;
  url_externa: string | null;
  inicio: string | null;
  fim: string | null;
  ativo: boolean;
  visivel_agora: boolean;
  ordem: number;
};

export type Categoria = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  is_temporarily_available: boolean;
  temporary_unavailable_note: string | null;
  sort_order: number;
};

export type Tamanho = {
  id: string;
  name: string;
  slice_count: number;
  max_flavors: number;
  is_active: boolean;
  sort_order: number;
};

export type Borda = {
  id: string;
  name: string;
  is_active: boolean;
  is_temporarily_available: boolean;
  sort_order: number;
};

export type Adicional = Borda;

export type PrecoPorTamanho = {
  id: string;
  size_id: string;
  price: number;
  is_active: boolean;
};

/** Estado devolvido por toda Server Action de formulário desta fase. */
export type EstadoFormulario = { erro?: string; ok?: string };

/**
 * Código de barras de venda (09 §2.3). O `codigo_normalizado` é gerado pelo
 * banco e é sobre ele que existe a unicidade global — nunca recalcule no
 * cliente.
 *
 * `ean_valido` tem TRÊS estados de propósito: `null` significa "não é um EAN",
 * que é diferente de "é um EAN errado". Só o `false` gera aviso.
 */
export type CodigoDeBarras = {
  id: string;
  codigo: string;
  codigo_normalizado: string;
  primario: boolean;
  ean_valido: boolean | null;
  aviso_ean: string | null;
  criado_em: string;
};
