import "server-only";
import { cache } from "react";
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
  SaborDaFogazza,
  SaborPublico,
  TamanhoPublico,
  CampanhaEmPromocao,
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

/**
 * Campanhas de promoção vigentes AGORA. Falha vira lista vazia: sem o
 * cabeçalho a vitrine mostra as promoções como seção simples, nunca quebra.
 */
export async function listarCampanhasEmPromocao(): Promise<CampanhaEmPromocao[]> {
  try {
    const linhas = await rpc<Omit<CampanhaEmPromocao, "preco_min" | "preco_max"> & {
      preco_min: number | string;
      preco_max: number | string;
    }>("campanhas_em_promocao");
    return linhas.map((l) => ({
      ...l,
      preco_min: Number(l.preco_min),
      preco_max: Number(l.preco_max),
      dias: l.dias === null ? null : l.dias.map(Number),
      na_vitrine: l.na_vitrine !== false,
      variantes_fogazza: l.variantes_fogazza ?? [],
      produtos_fogazza: l.produtos_fogazza ?? [],
    }));
  } catch (erro) {
    logger.error("publico:campanhasEmPromocao", { code: (erro as { code?: string })?.code });
    return [];
  }
}

export function listarHorariosPublicos(): Promise<HorarioPublico[]> {
  return rpc<HorarioPublico>("horarios_publicos");
}

export function listarCategoriasPublicas(): Promise<CategoriaPublica[]> {
  return rpc<CategoriaPublica>("categorias_publicas");
}

// Por requisição (React `cache`), nunca entre requisições: preço e
// disponibilidade são sempre os de agora. A home pede o cardápio e o "Mais
// pedidos" pede de novo para achar os produtos do ranking — é a mesma ida.
export const listarCardapio = cache(
  (categoriaSlug?: string): Promise<ProdutoPublico[]> =>
    rpc<ProdutoPublico>("cardapio_publico", {
      p_categoria_slug: categoriaSlug ?? null,
    }),
);

/**
 * RN-LINK-001/002: o link abre sempre o estado comercial ATUAL.
 *
 * Por requisição: o título da página, o corpo e o configurador pedem o mesmo
 * produto, e eram três idas ao banco em sequência.
 */
export const obterProdutoPublico = cache(
  async (slug: string): Promise<ProdutoDetalhe | null> => {
    const linhas = await rpc<ProdutoDetalhe>("produto_publico", { p_slug: slug });
    const produto = linhas[0] ?? null;
    if (!produto) return null;

    // Só para a tela dizer "incluso" em vez de "+ R$": o preço em si é do
    // servidor (`montar_item`), que já zera o adicional neste produto.
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase
      .from("products")
      .select("addons_included")
      .eq("id", produto.id)
      .maybeSingle();
    return {
      ...produto,
      adicionais_inclusos: Boolean((data as { addons_included?: boolean } | null)?.addons_included),
    };
  },
);

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

/**
 * RN-FOG-003: os sabores de um card de fogazza. Vazio quando o produto não é
 * card de entrada — a fogazza de preço próprio continua produto simples.
 */
export function listarSaboresDaFogazza(cardId: string): Promise<SaborDaFogazza[]> {
  return rpc<SaborDaFogazza>("sabores_da_fogazza", { p_card_id: cardId });
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

  const primeiroTamanho = tamanhos.find((t) => t.disponivel) ?? null;

  // O primeiro preço vem do servidor, pela mesma `montar_item` de sempre.
  // Só depende dos tamanhos: vai junto com as opções de cada um.
  const porTamanho: DadosPorTamanho = {};
  const [montadoInicial] = await Promise.all([
    produto.disponivel
      ? montarItemNoServidor({
          produto_id: produto.id,
          variacao_id: primeiroTamanho?.variacao_id ?? null,
          sabores: primeiroTamanho ? [primeiroTamanho.variacao_id] : [],
          quantidade: 1,
        })
      : Promise.resolve<ItemMontado>({ ok: false, erro: "Indisponível no momento." }),
    Promise.all(tamanhos.map(async (t) => {
      const [sabores, bordas, adicionais] = await Promise.all([
        t.max_sabores > 1 ? listarSabores(t.tamanho_id) : Promise.resolve([]),
        listarBordas(produto.id, t.tamanho_id),
        produto.adicionais_ligados
          ? listarAdicionais(produto.id, t.tamanho_id)
          : Promise.resolve([]),
      ]);
      porTamanho[t.tamanho_id] = { sabores, bordas, adicionais };
    })),
  ]);

  return { produto, tamanhos, porTamanho, montadoInicial };
}

/** O card de fogazza aberto: o próprio card e a lista de sabores dele. */
export type CardDeFogazza = { card: ProdutoDetalhe; sabores: SaborDaFogazza[] };

/**
 * Lê o card de entrada de fogazza. `null` quando o slug não existe ou o
 * produto não é card (a fogazza de preço próprio, por exemplo).
 *
 * Card sem nenhum sabor ativo também devolve `null`: para o cliente ele é
 * indisponível, e quem mostra isso é a página do produto, como para qualquer
 * outro item.
 */
export async function obterCardDeFogazza(slug: string): Promise<CardDeFogazza | null> {
  const card = await obterProdutoPublico(slug);
  if (card === null || card.tipo !== "fogazza") return null;
  const sabores = await listarSaboresDaFogazza(card.id);
  if (sabores.length === 0) return null;
  return { card, sabores };
}

/**
 * O configurador da fogazza de UM sabor (RN-FOG-002 a RN-FOG-005).
 *
 * É o configurador de sempre, com o produto sendo o SABOR e um único
 * tamanho — o de fogazza —, fixo. O preço, a promoção, os adicionais e o
 * limite vêm das mesmas funções da pizza, e `montar_item` recebe o sabor e a
 * variação de fogazza como recebe qualquer pizza de um sabor.
 *
 * A disponibilidade é a da FOGAZZA do sabor, não a da pizza: com os tamanhos
 * de pizza pausados e a fogazza à venda, a pizza some do cardápio e a
 * fogazza continua (RN-FOG-006).
 */
export type DadosDaFogazza = DadosDoConfigurador & {
  card: ProdutoDetalhe;
  sabor: SaborDaFogazza;
};

// Por requisição: a página pede os mesmos dados para o título e para o corpo.
export const montarDadosDaFogazza = cache(montarDadosDaFogazzaSemCache);

async function montarDadosDaFogazzaSemCache(
  cardSlug: string,
  saborSlug: string,
): Promise<DadosDaFogazza | null> {
  // O produto do sabor é lido pelo slug da URL, junto com o card: o sabor
  // só vale se estiver na lista do card, conferida logo abaixo.
  const [aberto, produtoDoSabor] = await Promise.all([
    obterCardDeFogazza(cardSlug),
    obterProdutoPublico(saborSlug),
  ]);
  if (aberto === null) return null;
  const sabor = aberto.sabores.find((s) => s.slug === saborSlug);
  if (sabor === undefined) return null;
  if (produtoDoSabor === null) return null;

  const disponivel = aberto.card.disponivel && sabor.disponivel;
  const produto: ProdutoDetalhe = {
    ...produtoDoSabor,
    // O que se vende aqui é a fogazza: preço e disponibilidade são os dela.
    preco_de: sabor.preco_de,
    preco: sabor.preco,
    preco_max: sabor.preco,
    em_promocao: sabor.em_promocao,
    disponivel,
    tem_tamanhos: true,
  };

  const tamanho: TamanhoPublico = {
    variacao_id: sabor.variacao_id,
    tamanho_id: sabor.tamanho_id,
    tamanho_nome: sabor.tamanho_nome,
    fatias: sabor.fatias,
    max_sabores: 1,
    preco_de: sabor.preco_de,
    preco: sabor.preco,
    em_promocao: sabor.em_promocao,
    disponivel,
  };

  // Fogazza não tem borda nem meio a meio (RN-FOG-004): só os adicionais.
  const [adicionais, montadoInicial] = await Promise.all([
    produto.adicionais_ligados
      ? listarAdicionais(produto.id, sabor.tamanho_id)
      : Promise.resolve([]),
    disponivel
      ? montarItemNoServidor({
          produto_id: produto.id,
          variacao_id: sabor.variacao_id,
          sabores: [sabor.variacao_id],
          quantidade: 1,
        })
      : Promise.resolve({ ok: false as const, erro: "Indisponível no momento." }),
  ]);

  return {
    card: aberto.card,
    sabor,
    produto,
    tamanhos: [tamanho],
    porTamanho: { [sabor.tamanho_id]: { sabores: [], bordas: [], adicionais } },
    montadoInicial,
    tamanhoFixo: true,
    caminho: `${aberto.card.slug}/${sabor.slug}`,
  };
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


/**
 * As fogazzas de uma promoção, agrupadas pelo card (doce, salgada)
 * (D-2026-10-15-137).
 *
 * Promoção de uma variante de fogazza não é promoção da pizza, e nem todo
 * sabor tem foto: a vitrine mostra isto em LISTA, no formato da página da
 * fogazza. Preço, promoção e disponibilidade são os de `sabores_da_fogazza` —
 * nada é recalculado aqui.
 */
export async function listarFogazzasDaPromocao(
  varianteIds: readonly string[],
): Promise<{ cardSlug: string; cardNome: string; sabores: SaborDaFogazza[] }[]> {
  if (varianteIds.length === 0) return [];
  const alvo = new Set(varianteIds);
  const cardapio = await listarCardapio();
  const cards = cardapio.filter((p) => p.tipo === "fogazza");

  const porCard = await Promise.all(
    cards.map(async (card) => ({
      cardSlug: card.slug,
      cardNome: card.nome,
      sabores: (await listarSaboresDaFogazza(card.id)).filter((s) => alvo.has(s.variacao_id)),
    })),
  );
  return porCard.filter((g) => g.sabores.length > 0);
}
