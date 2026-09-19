import "server-only";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { DadosDoConfigurador, DadosPorTamanho } from "@/ui/configurador/tipos";
import type {
  BannerPublico,
  ConfiguracaoItem,
  ItemMontado,
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

/**
 * "Mais pedidos" (RN-POP-001 a RN-POP-004).
 *
 * O ranking é calculado no banco: 30 dias móveis, somente pedidos
 * concluídos, por QUANTIDADE, com meio a meio contando a fração de cada
 * sabor e combo contando como combo.
 *
 * Aqui só se busca os produtos correspondentes, preservando a ordem do
 * ranking — `produtosPorId` devolve na ordem do catálogo, que é outra.
 *
 * Sem base, volta lista vazia e a seção não é renderizada. Nenhum impulso
 * artificial, nenhuma mistura com Destaque manual (RN-DEST-001).
 */
export async function listarMaisPedidos(limite = 6): Promise<ProdutoPublico[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("mais_pedidos", { p_limite: limite });

  if (error) {
    logger.error("publico:listarMaisPedidos", { code: (error as { code?: string }).code });
    return [];
  }

  const ranking = (data ?? []) as { produto_id: string; quantidade: number }[];
  if (ranking.length === 0) return [];

  const produtos = await produtosPorId(ranking.map((r) => r.produto_id));
  const porId = new Map(produtos.map((p) => [p.id, p]));

  return ranking
    .map((r) => porId.get(r.produto_id))
    .filter((p): p is ProdutoPublico => p !== undefined && p.disponivel);
}

/**
 * Junta tudo que o configurador precisa para um produto.
 *
 * Existe para que a página pública e o administrativo carreguem EXATAMENTE
 * os mesmos dados. Antes isso morava dentro da página de produto; quando o
 * balcão passou a precisar da mesma tela, copiar seria criar duas verdades
 * sobre quais sabores e bordas existem.
 *
 * Bordas, adicionais e sabores são carregados de uma vez para os tamanhos
 * existentes — tipicamente dois ou três —, e o configurador troca entre eles
 * sem nova ida ao servidor.
 */
export async function montarDadosDoConfigurador(
  slug: string,
): Promise<DadosDoConfigurador | null> {
  const produto = await obterProdutoPublico(slug);
  if (produto === null) return null;

  const tamanhos = produto.tem_tamanhos ? await listarTamanhos(produto.id) : [];

  const porTamanho: DadosPorTamanho = {};
  await Promise.all(
    tamanhos.map(async (t) => {
      const [sabores, bordas, adicionais] = await Promise.all([
        t.max_sabores > 1 ? listarSabores(t.tamanho_id) : Promise.resolve([]),
        listarBordas(produto.id, t.tamanho_id),
        produto.adicionais_ligados
          ? listarAdicionais(produto.id, t.tamanho_id)
          : Promise.resolve([]),
      ]);
      porTamanho[t.tamanho_id] = { sabores, bordas, adicionais };
    }),
  );

  const primeiroTamanho = tamanhos.find((t) => t.disponivel) ?? null;

  // O primeiro preço vem do servidor, pela mesma `montar_item` de sempre.
  const montadoInicial = produto.disponivel
    ? await montarItemNoServidor({
        produto_id: produto.id,
        variacao_id: primeiroTamanho?.variacao_id ?? null,
        sabores: primeiroTamanho ? [primeiroTamanho.variacao_id] : [],
        quantidade: 1,
      })
    : { ok: false as const, erro: "Indisponível no momento." };

  return { produto, tamanhos, porTamanho, montadoInicial };
}

/**
 * `montar_item` chamada daqui, e não pela Server Action.
 *
 * É a MESMA função do banco — a única autoridade de preço. A Server Action
 * existe para o navegador; esta chamada existe para o servidor, que já está
 * montando a página e não precisa passar por ela.
 */
async function montarItemNoServidor(config: ConfiguracaoItem): Promise<ItemMontado> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("montar_item", {
    p_item: {
      produto_id: config.produto_id,
      variacao_id: config.variacao_id ?? null,
      sabores: config.sabores ?? [],
      borda_id: config.borda_id ?? null,
      adicionais: config.adicionais ?? [],
      observacao: config.observacao ?? "",
      quantidade: config.quantidade ?? 1,
    },
  });

  if (error) {
    logger.error("publico:montarItemNoServidor", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível montar este item agora." };
  }
  return data as ItemMontado;
}
