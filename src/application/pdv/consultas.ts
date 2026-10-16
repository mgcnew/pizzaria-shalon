import "server-only";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import { casaPeloNome } from "@/domain/catalogo/buscaDeSabor";
import type { ItemCatalogoPdv, PedidoAReceber, ResolucaoDeCodigo } from "./tipos";

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

  // Termo digitado casa com o NOME e a categoria, não com ingredientes da
  // descrição — "calabresa" traz a pizza Calabresa (15/10/2026). Quem casou
  // por CÓDIGO DE BARRAS fica sempre; a RPC também casava o nome do tamanho,
  // que aqui não conta como critério de busca de sabor.
  const itens = (data ?? []) as ItemCatalogoPdv[];
  const resultado: ItemCatalogoPdv[] = [];
  for (const i of itens) {
    if (i.casou_codigo || casaPeloNome(termo, [i.nome, i.categoria_nome])) {
      resultado.push(i);
    } else if (i.tipo === "fogazza") {
      // O card de fogazza fica quando algum SABOR dele tem o nome buscado.
      const { data: sabores } = await supabase.rpc("sabores_da_fogazza", { p_card_id: i.id });
      const lista = (sabores ?? []) as { nome: string }[];
      if (lista.some((s) => casaPeloNome(termo, [s.nome]))) resultado.push(i);
    }
  }
  return resultado;
}

/**
 * A fila de recebimento — Fase 12, Etapa 5.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §1.3, §4.2, §6.1
 *
 * ESTA FUNÇÃO NÃO TEM CRITÉRIO NENHUM. O `where` mora na RPC, e é de propósito:
 * um segundo filtro aqui viraria uma segunda autoridade sobre o que pode ser
 * cobrado, e por omissão — bastaria ela ser mais restritiva que
 * `registrar_pagamento` para um pedido com o cliente devendo desaparecer da
 * tela em silêncio (D-2026-09-26-79). Aqui só se transporta.
 *
 * Também não ordena: a ordem é `created_at` no banco, o mais antigo primeiro,
 * porque quem está esperando há mais tempo no balcão é quem precisa ser
 * atendido (§1.3).
 *
 * Não depende de caixa aberto: a RPC não olha `cash_sessions`, e o PDV precisa
 * abrir com o caixa fechado (§4.4).
 *
 * Falha devolve lista vazia, não exceção — a fila é uma das três áreas da tela,
 * e um erro nela não pode derrubar a venda em andamento (CLAUDE.md §37). A tela
 * distingue "nada a receber" de "não deu para consultar" pelo segundo campo.
 */
export async function listarPedidosAReceber(): Promise<{
  pedidos: PedidoAReceber[];
  falhou: boolean;
}> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("pedidos_a_receber");

  if (error) {
    logger.error("pdv:listarPedidosAReceber", { code: (error as { code?: string }).code });
    return { pedidos: [], falhou: true };
  }

  return { pedidos: (data ?? []) as PedidoAReceber[], falhou: false };
}
