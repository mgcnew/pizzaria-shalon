/**
 * Tipos da experiência pública.
 *
 * Espelham as funções de projeção pública (migrations 0031 a 0033). Tudo que
 * chega aqui já passou pelo RLS e já vem com preço efetivo e disponibilidade
 * calculados no banco — a interface exibe, não recalcula.
 */

export type ProdutoPublico = {
  id: string;
  nome: string;
  slug: string;
  tipo: "pizza" | "fogazza" | "drink" | "combo" | "other";
  descricao: string | null;
  categoria_id: string;
  categoria_nome: string;
  categoria_slug: string;
  categoria_ordem: number;
  preco_de: number | null;
  preco: number | null;
  preco_max: number | null;
  em_promocao: boolean;
  disponivel: boolean;
  destaque: boolean;
  tem_tamanhos: boolean;
  imagem_path: string | null;
  ordem: number;
  limite_por_pedido: number | null;
};

export type ProdutoDetalhe = Omit<
  ProdutoPublico,
  "categoria_id" | "categoria_ordem" | "ordem" | "limite_por_pedido"
> & {
  limite_por_pedido: number | null;
  limite_adicionais: number | null;
  adicionais_ligados: boolean;
};

export type CategoriaPublica = {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  pausada: boolean;
  produtos: number;
  ordem: number;
};

export type TamanhoPublico = {
  variacao_id: string;
  tamanho_id: string;
  tamanho_nome: string;
  fatias: number;
  max_sabores: number;
  preco_de: number;
  preco: number;
  em_promocao: boolean;
  disponivel: boolean;
};

export type SaborPublico = {
  variacao_id: string;
  produto_id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  preco: number;
  disponivel: boolean;
};

/**
 * Um sabor dentro de um card de fogazza (`sabores_da_fogazza`, RN-FOG-003).
 * A variação é a do sabor no tamanho de fogazza; preço e disponibilidade já
 * vêm calculados, com a promoção e o card pausado considerados.
 */
export type SaborDaFogazza = {
  variacao_id: string;
  produto_id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  preco_de: number;
  preco: number;
  em_promocao: boolean;
  disponivel: boolean;
  imagem_path: string | null;
  tamanho_id: string;
  tamanho_nome: string;
  fatias: number;
};

export type OpcaoPreco = { id: string; nome: string; preco: number };

export type ComponenteCombo = {
  nome: string;
  tamanho: string | null;
  quantidade: number;
  ordem: number;
};

export type ResultadoBusca = {
  id: string;
  nome: string;
  slug: string;
  tipo: string;
  descricao: string | null;
  categoria_nome: string;
  categoria_slug: string;
  preco_de: number | null;
  preco: number | null;
  em_promocao: boolean;
  disponivel: boolean;
  imagem_path: string | null;
};

export type BannerPublico = {
  id: string;
  titulo: string | null;
  corpo: string | null;
  imagem_path: string;
  destino_tipo: "product" | "products" | "category" | "promotion" | "external" | "none";
  destino_slug: string | null;
  url_externa: string | null;
  ordem: number;
};

/** Projeção pública da loja (03 §7.1). Sem coordenadas e sem dado interno. */
export type LojaPublica = {
  nome: string;
  nome_exibicao: string | null;
  whatsapp: string;
  telefone: string | null;
  endereco_logradouro: string;
  endereco_numero: string;
  endereco_complemento: string | null;
  endereco_bairro: string;
  endereco_cidade: string;
  endereco_uf: string;
  endereco_cep: string;
  aberta: boolean;
  fechada_temporariamente: boolean;
  motivo_fechamento: string | null;
  entrega_eta_min: number;
  entrega_eta_max: number;
  retirada_eta_min: number;
  retirada_eta_max: number;
  pedido_minimo_ativo: boolean;
  pedido_minimo_valor: number | null;
  adicionais_habilitados: boolean;
  fuso: string;
};

export type HorarioPublico = {
  dia_semana: number;
  fechado: boolean;
  abre: string | null;
  fecha: string | null;
};

/** Resposta de `montar_item`: o preço vem daqui, nunca do navegador. */
export type ItemMontado =
  | {
      ok: true;
      nome: string;
      produto_nome: string;
      rotulos: string[];
      preco_base: number;
      preco_borda: number;
      preco_adicionais: number;
      preco_unitario: number;
      quantidade: number;
      total: number;
      limite: number | null;
      em_promocao: boolean;
    }
  | { ok: false; nome?: string; erro: string; limite?: number };

export type LinhaRevalidada = {
  linha: string;
  ok: boolean;
  erro?: string;
  nome?: string;
  rotulos?: string[];
  preco_unitario?: number;
  preco_visto: number | null;
  mudou_preco: boolean;
  quantidade?: number;
  total?: number;
  limite?: number | null;
};

export type Revalidacao =
  | {
      ok: true;
      loja_aberta: boolean;
      itens: LinhaRevalidada[];
      subtotal: number;
      exige_reconfirmacao: boolean;
      motivos: string[];
    }
  | { ok: false; erro: string };

/** Configuração que o cliente envia para montar um item. Sem preço. */
export type ConfiguracaoItem = {
  produto_id: string;
  variacao_id?: string | null;
  sabores?: string[];
  borda_id?: string | null;
  adicionais?: string[];
  observacao?: string;
  quantidade?: number;
};
