import "server-only";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import type {
  BannerPublico,
  CategoriaPublica,
  ComponenteCombo,
  HorarioPublico,
  LojaPublica,
  OpcaoPreco,
  ProdutoDetalhe,
  ProdutoPublico,
  ResultadoBusca,
  SaborPublico,
  TamanhoPublico,
} from "./tipos";

/**
 * Leituras da experiência pública.
 *
 * Tudo passa pelas projeções públicas do banco. O cliente anônimo nunca
 * consulta tabela de configuração, mídia, auditoria ou funcionário — nem
 * poderia: o RLS não entrega (03 §8.1).
 *
 * Preço efetivo e disponibilidade chegam calculados. Esta camada não faz
 * conta comercial nenhuma (CLAUDE.md §16 e §17).
 */

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc(nome, args ?? {});
  if (error) throw error;
  return (data ?? []) as T[];
}

/** A loja pode não estar configurada ainda; `null` é estado legítimo. */
export async function obterLojaPublica(): Promise<LojaPublica | null> {
  const linhas = await rpc<LojaPublica>("loja_publica");
  return linhas[0] ?? null;
}

export function listarHorariosPublicos(): Promise<HorarioPublico[]> {
  return rpc<HorarioPublico>("horarios_publicos");
}

export function listarCategoriasPublicas(): Promise<CategoriaPublica[]> {
  return rpc<CategoriaPublica>("categorias_publicas");
}

export function listarCardapio(categoriaSlug?: string): Promise<ProdutoPublico[]> {
  return rpc<ProdutoPublico>("cardapio_publico", {
    p_categoria_slug: categoriaSlug ?? null,
  });
}

/** RN-LINK-001/002: o link abre sempre o estado comercial ATUAL. */
export async function obterProdutoPublico(slug: string): Promise<ProdutoDetalhe | null> {
  const linhas = await rpc<ProdutoDetalhe>("produto_publico", { p_slug: slug });
  return linhas[0] ?? null;
}

export function listarTamanhos(produtoId: string): Promise<TamanhoPublico[]> {
  return rpc<TamanhoPublico>("tamanhos_publicos", { p_product_id: produtoId });
}

/**
 * RN-PIZZA-004: a consulta é por TAMANHO. Sabor que não é oferecido naquele
 * tamanho simplesmente não existe como opção de meio a meio.
 */
export function listarSabores(tamanhoId: string): Promise<SaborPublico[]> {
  return rpc<SaborPublico>("sabores_publicos", { p_size_id: tamanhoId });
}

export function listarBordas(produtoId: string, tamanhoId: string): Promise<OpcaoPreco[]> {
  return rpc<OpcaoPreco>("bordas_publicas", {
    p_product_id: produtoId,
    p_size_id: tamanhoId,
  });
}

export function listarAdicionais(produtoId: string, tamanhoId: string): Promise<OpcaoPreco[]> {
  return rpc<OpcaoPreco>("adicionais_publicos", {
    p_product_id: produtoId,
    p_size_id: tamanhoId,
  });
}

/** RN-COMBO-001: composição exata, para exibição. O cliente não escolhe nada. */
export function listarComponentesDoCombo(produtoId: string): Promise<ComponenteCombo[]> {
  return rpc<ComponenteCombo>("combo_publico", { p_product_id: produtoId });
}

/** RN-BUSCA-001: nome, descrição, categoria e tamanhos, sem acento e sem caixa. */
export function buscar(termo: string): Promise<ResultadoBusca[]> {
  if (termo.trim() === "") return Promise.resolve([]);
  return rpc<ResultadoBusca>("buscar_catalogo", { p_termo: termo });
}

export function listarBanners(): Promise<BannerPublico[]> {
  return rpc<BannerPublico>("banners_publicos");
}

/** Produtos por id, para a tela de favoritos (que guarda só ids). */
export async function produtosPorId(ids: readonly string[]): Promise<ProdutoPublico[]> {
  if (ids.length === 0) return [];
  const cardapio = await listarCardapio();
  const conjunto = new Set(ids);
  return cardapio.filter((p) => conjunto.has(p.id));
}

/** URL pública de uma imagem do bucket do catálogo. */
export async function urlDaImagem(caminho: string): Promise<string> {
  const supabase = await getSupabaseServerClient();
  return supabase.storage.from("catalogo").getPublicUrl(caminho).data.publicUrl;
}
