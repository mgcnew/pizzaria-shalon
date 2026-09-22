import "server-only";
import { cache } from "react";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import type {
  Adicional,
  BannerAdmin,
  Borda,
  Categoria,
  ComboAdmin,
  PrecoPorTamanho,
  ProdutoAdmin,
  PromocaoAdmin,
  Tamanho,
  VariacaoAdmin,
} from "./tipos";

/**
 * Leituras do catálogo para a área administrativa.
 *
 * Toda consulta passa pelo cliente autenticado do usuário: o RLS decide o
 * que volta. Não existe cliente `service_role` neste projeto (CLAUDE.md §13),
 * então nenhuma destas funções consegue "ver mais" do que a pessoa pode.
 *
 * Preço efetivo e disponibilidade NÃO são calculados aqui — vêm prontos das
 * funções do banco (§16, §17).
 */

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc(nome, args ?? {});
  if (error) throw error;
  return (data ?? []) as T[];
}

export const listarProdutos = cache(
  (): Promise<ProdutoAdmin[]> => rpc<ProdutoAdmin>("catalogo_produtos_admin"),
);

export const listarVariacoes = cache(
  (produtoId: string): Promise<VariacaoAdmin[]> =>
    rpc<VariacaoAdmin>("catalogo_variacoes_admin", { p_product_id: produtoId }),
);

export const listarPromocoes = cache(
  (): Promise<PromocaoAdmin[]> => rpc<PromocaoAdmin>("catalogo_promocoes_admin"),
);

export const listarCombos = cache(
  (): Promise<ComboAdmin[]> => rpc<ComboAdmin>("catalogo_combos_admin"),
);

export const listarBanners = cache(
  (): Promise<BannerAdmin[]> => rpc<BannerAdmin>("catalogo_banners_admin"),
);

export const listarCategorias = cache(async (): Promise<Categoria[]> => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select(
      "id, name, slug, description, is_active, is_temporarily_available, temporary_unavailable_note, sort_order",
    )
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Categoria[];
});

export const listarTamanhos = cache(async (): Promise<Tamanho[]> => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("pizza_sizes")
    .select("id, name, slice_count, max_flavors, is_active, sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Tamanho[];
});

export const listarBordas = cache(async (): Promise<Borda[]> => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("crusts")
    .select("id, name, is_active, is_temporarily_available, sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Borda[];
});

export const listarAdicionais = cache(async (): Promise<Adicional[]> => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("addons")
    .select("id, name, is_active, is_temporarily_available, sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Adicional[];
});

/** Todos os preços de borda por tamanho, de uma vez (evita N+1 na tela). */
export async function listarPrecosDeBordas(): Promise<(PrecoPorTamanho & { crust_id: string })[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("crust_size_prices")
    .select("id, crust_id, size_id, price, is_active");
  if (error) throw error;
  return (data ?? []) as (PrecoPorTamanho & { crust_id: string })[];
}

/** Todos os preços de adicional por tamanho, de uma vez. */
export async function listarPrecosDeAdicionais(): Promise<(PrecoPorTamanho & { addon_id: string })[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("addon_size_prices")
    .select("id, addon_id, size_id, price, is_active");
  if (error) throw error;
  return (data ?? []) as (PrecoPorTamanho & { addon_id: string })[];
}

/** RN-BORDA-002: o preço da borda existe POR TAMANHO. */
export async function listarPrecosDeBorda(bordaId: string): Promise<PrecoPorTamanho[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("crust_size_prices")
    .select("id, size_id, price, is_active")
    .eq("crust_id", bordaId);
  if (error) throw error;
  return (data ?? []) as PrecoPorTamanho[];
}

export async function listarPrecosDeAdicional(addonId: string): Promise<PrecoPorTamanho[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("addon_size_prices")
    .select("id, size_id, price, is_active")
    .eq("addon_id", addonId);
  if (error) throw error;
  return (data ?? []) as PrecoPorTamanho[];
}

export async function obterProduto(id: string): Promise<ProdutoAdmin | null> {
  const produtos = await listarProdutos();
  return produtos.find((p) => p.id === id) ?? null;
}

/** Componentes de um combo, com o nome exato de cada item (RN-COMBO-002). */
export async function listarComponentesDoCombo(comboId: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("combo_components")
    .select(
      "id, quantity, sort_order, component_product_id, component_variant_id, products!combo_components_component_product_id_fkey(name), product_variants(price, pizza_sizes(name))",
    )
    .eq("combo_product_id", comboId)
    .order("sort_order");
  if (error) throw error;

  type Linha = {
    id: string;
    quantity: number;
    sort_order: number;
    component_product_id: string;
    component_variant_id: string | null;
    products: { name: string } | null;
    product_variants: { price: number; pizza_sizes: { name: string } | null } | null;
  };

  return ((data ?? []) as unknown as Linha[]).map((l) => ({
    id: l.id,
    quantidade: l.quantity,
    ordem: l.sort_order,
    produtoId: l.component_product_id,
    variacaoId: l.component_variant_id,
    produtoNome: l.products?.name ?? "(produto removido)",
    tamanhoNome: l.product_variants?.pizza_sizes?.name ?? null,
  }));
}

/** Exclusões de borda por produto (RN-BORDA-003: a exceção é que é gravada). */
export async function listarExclusoesDeBorda(produtoId: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_crust_exclusions")
    .select("id, crust_id, size_id, reason")
    .eq("product_id", produtoId);
  if (error) throw error;
  return (data ?? []) as {
    id: string;
    crust_id: string;
    size_id: string | null;
    reason: string | null;
  }[];
}

/** Regras de adicional por produto (RN-ADD-002). */
export async function listarRegrasDeAdicional(produtoId: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_addon_rules")
    .select("id, addon_id, size_id, is_allowed")
    .eq("product_id", produtoId);
  if (error) throw error;
  return (data ?? []) as {
    id: string;
    addon_id: string;
    size_id: string | null;
    is_allowed: boolean;
  }[];
}

/** Imagens já enviadas, para reaproveitar em banner e produto. */
export async function listarImagens(tipo: "product" | "banner") {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("media_assets")
    .select("id, storage_path, original_filename, width, height, file_size_bytes")
    .eq("asset_type", tipo)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []) as {
    id: string;
    storage_path: string;
    original_filename: string | null;
    width: number | null;
    height: number | null;
    file_size_bytes: number | null;
  }[];
}
