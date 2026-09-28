"use server";

import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { DadosDoConfigurador } from "@/ui/configurador/tipos";
import { buscar, montarDadosDoConfigurador, obterProdutoPublico } from "./consultas";
import type { ConfiguracaoItem, ItemMontado, ResultadoBusca, Revalidacao } from "./tipos";

/**
 * Operações comerciais da experiência pública.
 *
 * São Server Actions porque o PREÇO É DO SERVIDOR (CLAUDE.md §16). O
 * configurador de pizza chama `montarItem` a cada escolha e exibe o que
 * voltar; ele não soma nada sozinho. A mesma função decide se a configuração
 * é válida, então a prévia e o item que entra no carrinho nunca divergem.
 *
 * Nada aqui cria pedido, cliente ou pagamento — isso é Fase 5.
 */

/**
 * Valida e precifica uma configuração.
 *
 * Recebe IDs e escolhas. Não existe parâmetro de preço, de propósito: não há
 * como o navegador sugerir quanto custa.
 */
export async function montarItem(config: ConfiguracaoItem): Promise<ItemMontado> {
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
    logger.error("publico:montarItem", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível montar este item agora. Tente de novo." };
  }
  return data as ItemMontado;
}

/**
 * Revalida o carrinho inteiro contra o estado atual do catálogo.
 *
 * 79.9: "Mudanças de preço enquanto o carrinho está aberto nunca são
 * silenciosas." Quando há diferença comercial, a resposta vem com
 * `exige_reconfirmacao` e a tela mostra anterior → atual.
 *
 * Esta é a fronteira que a Fase 5 vai usar: pedido só nasce de carrinho
 * revalidado imediatamente antes.
 */
export async function revalidarCarrinho(itens: unknown[]): Promise<Revalidacao> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.rpc("revalidar_carrinho", { p_itens: itens });

  if (error) {
    logger.error("publico:revalidarCarrinho", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível revalidar o carrinho agora." };
  }
  return data as Revalidacao;
}

/**
 * Carrega tudo que o configurador precisa, sob demanda.
 *
 * A página pública monta isso durante a renderização; o balcão precisa
 * buscar quando o atendente escolhe o produto. A FUNÇÃO é a mesma
 * (`montarDadosDoConfigurador`), então as duas telas enxergam exatamente os
 * mesmos tamanhos, sabores, bordas e adicionais.
 *
 * Usa apenas projeções públicas, concedidas a `anon` e a `authenticated`:
 * não há caminho privilegiado de catálogo para o administrativo.
 */
export async function carregarConfigurador(
  slug: unknown,
): Promise<DadosDoConfigurador | null> {
  if (typeof slug !== "string" || slug.length === 0 || slug.length > 160) return null;
  try {
    return await montarDadosDoConfigurador(slug);
  } catch (erro) {
    logger.error("publico:carregarConfigurador", {
      code: (erro as { code?: string })?.code,
    });
    return null;
  }
}

/** Busca do catálogo, usada pelo balcão para achar o produto (RN-BUSCA). */
export async function buscarProdutos(termo: unknown): Promise<ResultadoBusca[]> {
  if (typeof termo !== "string" || termo.trim().length < 2) return [];
  try {
    return await buscar(termo.trim());
  } catch (erro) {
    logger.error("publico:buscarProdutos", { code: (erro as { code?: string })?.code });
    return [];
  }
}

/**
 * Resposta do "+" de um toque do card (D-2026-09-28-85).
 *
 * `configurar` não é erro: significa que este produto tem escolhas a fazer
 * (tamanho, sabor, borda, adicional) ou é pizza/combo, e o cliente precisa da
 * página do produto.
 */
export type AdicaoRapida =
  | { tipo: "pronto"; slug: string; produtoId: string; item: Extract<ItemMontado, { ok: true }> }
  | { tipo: "configurar"; slug: string }
  | { tipo: "erro"; erro: string };

/**
 * Precifica um produto SEM ESCOLHAS para entrar direto no carrinho.
 *
 * O card só oferece o toque único quando a listagem diz que o produto não tem
 * tamanhos, mas quem decide é esta função, com o produto relido do banco agora:
 * se ele passou a ter tamanhos, ou é pizza ou combo, a resposta manda
 * configurar. O preço vem da MESMA `montar_item` do configurador — o toque
 * único é um atalho de tela, não um segundo caminho de preço (CLAUDE.md §16).
 */
export async function adicionarRapido(slug: unknown): Promise<AdicaoRapida> {
  if (typeof slug !== "string" || slug.length === 0 || slug.length > 160) {
    return { tipo: "erro", erro: "Produto inválido." };
  }

  try {
    const produto = await obterProdutoPublico(slug);
    if (produto === null || !produto.disponivel) {
      return { tipo: "erro", erro: "Este item não está disponível agora." };
    }
    if (produto.tem_tamanhos || produto.tipo === "pizza" || produto.tipo === "combo") {
      return { tipo: "configurar", slug };
    }

    const montado = await montarItem({
      produto_id: produto.id,
      variacao_id: null,
      sabores: [],
      quantidade: 1,
    });
    if (!montado.ok) return { tipo: "erro", erro: montado.erro };

    return { tipo: "pronto", slug, produtoId: produto.id, item: montado };
  } catch (erro) {
    logger.error("publico:adicionarRapido", { code: (erro as { code?: string })?.code });
    return { tipo: "erro", erro: "Não foi possível adicionar agora. Tente de novo." };
  }
}
