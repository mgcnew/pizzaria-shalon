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
  /**
   * O produto precisa ser preparado? Default do banco é `true`, e é o
   * conservador: produto existente continua indo para a produção até alguém
   * marcá-lo como "Não" no cadastro.
   */
  exige_producao: boolean;
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

export type SituacaoPromocao =
  | "vigente"
  /** No período e ligada, mas hoje não é um dos dias da semana dela. */
  | "fora_do_dia"
  | "agendada"
  | "encerrada"
  | "inativa";

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
  /** Linhas criadas juntas para vários itens; a tela trata como uma promoção. */
  campanha_id: string;
  /** ISO: 1 = segunda … 7 = domingo. Nulo = todos os dias. */
  dias: number[] | null;
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
  /**
   * "fogazza": o tamanho em que um sabor de pizza é vendido como fogazza
   * (RN-FOG-002). Aceita 1 sabor, não tem borda e só vale para sabor de pizza.
   */
  sold_as: "pizza" | "fogazza";
};

/** Card de entrada de fogazza: de onde vêm os sabores e em qual tamanho (RN-FOG-003). */
export type EscolhaDeSabor = {
  categoria_sabores_id: string | null;
  tamanho_fogazza_id: string | null;
};

/** Um sabor de pizza na montagem do card de fogazza (RN-FOG-003). */
export type SaborParaFogazza = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  /** Menor preço da pizza (tamanho de pizza ou preço único), só referência. */
  preco_pizza: number | null;
  /** O preço de fogazza gravado, mesmo quando o sabor está fora. */
  preco_fogazza: number | null;
  /**
   * Preço de sexta, sábado e domingo (D-2026-10-14-119). Nulo = o mesmo
   * preço todo dia.
   */
  preco_fogazza_fim_de_semana: number | null;
  /** Está à venda como fogazza. */
  entra: boolean;
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
