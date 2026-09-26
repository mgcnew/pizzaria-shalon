import "server-only";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { ItemCatalogoPdv, ResolucaoDeCodigo } from "./tipos";

/**
 * Leituras do PDV — Fase 12, Etapa 4.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §2.1, §6.1, §6.4
 *
 * `server-only`, e não um arquivo `"use server"`: leitura não precisa virar
 * endpoint. Mesma escolha da Etapa 3.
 *
 * QUATRO COISAS QUE ESTE ARQUIVO NÃO FAZ:
 *
 *  1. não normaliza o código — a normalização autoritativa é a do banco, e
 *     repeti-la aqui faria o bipe deixar de casar com o que está gravado
 *     (decisão da Etapa 2, reafirmada na 3);
 *  2. não escolhe tamanho — quando a RPC diz `precisa_escolher_variante`, isso
 *     sobe para a tela como está;
 *  3. não decide preço nem disponibilidade — chegam prontos;
 *  4. não decide autorização — as RPCs verificam `catalog.view` no corpo, e
 *     `anon` não tem EXECUTE em nenhuma das duas.
 */

/**
 * Resolve um código lido pelo leitor ou digitado.
 *
 * O texto vai para o banco COMO VEIO, sem passar por transformação nenhuma
 * aqui — inclusive com os zeros à esquerda, que são significativos em EAN-13.
 *
 * Numa falha de rede ou de permissão de execução, devolve o mesmo formato de
 * recusa das RPCs em vez de lançar: um bipe não pode derrubar a tela do balcão
 * (CLAUDE.md §37).
 */
export async function resolverCodigoDeBarras(codigo: string): Promise<ResolucaoDeCodigo> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolver_codigo_de_barras", {
    p_codigo: codigo,
  });

  if (error || !data) {
    logger.error("pdv:resolverCodigoDeBarras", { code: (error as { code?: string })?.code });
    return {
      ok: false,
      bloqueio: "sem_permissao",
      erro: "Não foi possível consultar o código agora. Tente de novo.",
    };
  }

  return data as ResolucaoDeCodigo;
}

/**
 * Busca interna do catálogo para o PDV.
 *
 * Diferente de `buscar_catalogo` da vitrine em três pontos, todos por
 * necessidade de balcão: devolve as variantes com id e preço, casa código
 * exato, e mostra item inativo com a bandeira `ativo` em vez de esconder —
 * quem está no balcão precisa saber que o item existe e está inativo, senão vai
 * cadastrar de novo. A função pública continua intocada (§6.4).
 */
export async function buscarCatalogoPdv(termo: string): Promise<ItemCatalogoPdv[]> {
  // Termo vazio não vale uma ida ao servidor: a RPC devolveria zero linhas de
  // qualquer forma, e o campo de busca do PDV começa vazio e em foco.
  if (termo.trim().length === 0) return [];

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("buscar_catalogo_pdv", { p_termo: termo });

  if (error) {
    logger.error("pdv:buscarCatalogoPdv", { code: (error as { code?: string }).code });
    return [];
  }

  return (data ?? []) as ItemCatalogoPdv[];
}
