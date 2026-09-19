"use server";

import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { DadosDoConfigurador } from "@/ui/configurador/tipos";
import { buscar, montarDadosDoConfigurador } from "./consultas";
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
