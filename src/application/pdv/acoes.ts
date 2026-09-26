"use server";

import { buscarCatalogoPdv, resolverCodigoDeBarras } from "./consultas";
import type { ItemCatalogoPdv, ResolucaoDeCodigo } from "./tipos";

/**
 * A superfície do PDV chamável pela tela — Fase 12, Etapa 6.
 *
 * POR QUE ESTE ARQUIVO EXISTE, se `consultas.ts` já tem as duas funções: elas
 * são `server-only`, e isso é deliberado — leitura de servidor não vira
 * endpoint só porque existe. Mas o campo de leitura do PDV é um componente de
 * cliente: ele precisa perguntar ao servidor a cada bipe.
 *
 * Então a fronteira fica explícita e mínima. `"use server"` transforma CADA
 * export num endereço alcançável pela rede (CLAUDE.md §36), e por isso aqui só
 * há o que a tela realmente chama. Nada de escrita, nada de pagamento.
 *
 * Autorização continua onde sempre esteve: as duas RPCs verificam
 * `catalog.view` no próprio corpo, e `anon` não tem EXECUTE em nenhuma delas.
 * Este arquivo não decide nada — ele atravessa.
 */

/** Um bipe ou um Enter no campo de leitura. O texto sobe como veio. */
export async function resolverCodigo(codigo: unknown): Promise<ResolucaoDeCodigo> {
  if (typeof codigo !== "string" || codigo.length === 0 || codigo.length > 64) {
    return { ok: true, encontrado: false, codigo_normalizado: "" };
  }
  return resolverCodigoDeBarras(codigo);
}

/** O fallback do campo: o mesmo texto procurado como termo (§2.1). */
export async function buscarNoCatalogo(termo: unknown): Promise<ItemCatalogoPdv[]> {
  if (typeof termo !== "string" || termo.trim().length === 0 || termo.length > 120) return [];
  return buscarCatalogoPdv(termo);
}
