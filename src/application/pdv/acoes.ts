"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import { buscarCatalogoPdv, resolverCodigoDeBarras } from "./consultas";
import { obterPagamentoDoPedido } from "@/application/caixa/consultas";
import type { PagamentoDoPedido } from "@/application/caixa/tipos";
import type { ItemCatalogoPdv, ResolucaoDeCodigo, VendaNoHistoricoDoPdv } from "./tipos";

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

const vendaRapidaSchema = z.object({
  idempotency_key: z.string().uuid(),
  itens: z.array(z.object({
    linha: z.string().min(1).max(120),
    produto_id: z.string().uuid(),
    variacao_id: z.string().uuid().nullish(),
    sabores: z.array(z.string().uuid()).max(4),
    borda_id: z.string().uuid().nullish(),
    adicionais: z.array(z.string().uuid()).max(20),
    observacao: z.string().max(300),
    quantidade: z.number().int().min(1).max(99),
  })).min(1).max(60),
  pagamento: z.object({
    forma_id: z.string().uuid(),
    bandeira_id: z.string().uuid().nullish(),
    recebido: z.number().finite().nonnegative().nullish(),
  }),
});

export type ResultadoVendaRapida =
  | {
      ok: true;
      pedido_id: string;
      numero: number;
      total: number;
      forma: string;
      recebido: number | null;
      troco: number | null;
    }
  | { ok: false; erro: string; sem_caixa?: boolean };

/** Cria, recebe e encerra uma venda sem produção na mesma transação. */
export async function finalizarVendaRapida(entrada: unknown): Promise<ResultadoVendaRapida> {
  const validado = vendaRapidaSchema.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: "Confira os itens e o pagamento da venda." };

  const dados = validado.data;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("finalizar_venda_rapida_pdv", {
    p_pedido: {
      idempotency_key: dados.idempotency_key,
      tracking_token: randomBytes(32).toString("hex"),
      origem: "counter",
      modalidade: "pickup",
      cliente: {},
      endereco: null,
      rota: null,
      itens: dados.itens,
      pagamento: {
        forma_id: dados.pagamento.forma_id,
        bandeira_id: dados.pagamento.bandeira_id ?? null,
        precisa_troco: dados.pagamento.recebido != null,
        troco_para: dados.pagamento.recebido ?? null,
      },
      observacao_geral: null,
    },
    p_pagamento: {
      forma_id: dados.pagamento.forma_id,
      bandeira_id: dados.pagamento.bandeira_id ?? null,
      recebido: dados.pagamento.recebido ?? null,
    },
  });

  if (error) {
    logger.error("pdv:finalizarVendaRapida", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível concluir a venda agora. Tente novamente." };
  }

  const resposta = (data ?? {}) as Record<string, unknown>;
  if (!resposta["ok"]) {
    return {
      ok: false,
      erro: String(resposta["erro"] ?? "Não foi possível concluir a venda."),
      ...(resposta["sem_caixa"] ? { sem_caixa: true } : {}),
    };
  }

  revalidatePath("/admin/pdv");
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/financeiro");
  return {
    ok: true,
    pedido_id: String(resposta["pedido_id"]),
    numero: Number(resposta["numero"]),
    total: Number(resposta["total"]),
    forma: String(resposta["forma"] ?? "Pagamento"),
    recebido: resposta["recebido"] == null ? null : Number(resposta["recebido"]),
    troco: resposta["troco"] == null ? null : Number(resposta["troco"]),
  };
}

export type ResultadoHistoricoDeVendas =
  | { ok: true; vendas: VendaNoHistoricoDoPdv[] }
  | { ok: false; erro: string };

/** Carregamento tardio: o histórico só cruza a rede quando o operador o abre. */
export async function listarHistoricoDeVendas(
  limite: unknown = 100,
): Promise<ResultadoHistoricoDeVendas> {
  const validado = z.number().int().min(1).max(300).safeParse(limite);
  if (!validado.success) return { ok: false, erro: "Limite de consulta inválido." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("historico_vendas_pdv", {
    p_limite: validado.data,
  });
  if (error) {
    logger.error("pdv:listarHistoricoDeVendas", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível carregar o histórico agora." };
  }

  const resposta = (data ?? {}) as Record<string, unknown>;
  if (!resposta["ok"]) {
    return { ok: false, erro: String(resposta["erro"] ?? "Não foi possível consultar as vendas.") };
  }
  return { ok: true, vendas: (resposta["vendas"] ?? []) as VendaNoHistoricoDoPdv[] };
}

/**
 * O pagamento de UM pedido, para abrir o painel de recebimento — Etapa 7.
 *
 * A fila já traz o ESPERADO; isto traz também o REALIZADO, que é o que
 * distingue "ninguém pagou ainda" de "pagou e foi estornado". São coisas
 * diferentes na frente do caixa, e o operador precisa ver as duas (§1.3).
 *
 * Leitura pura: `pagamento_do_pedido` não escreve nada e verifica a própria
 * permissão. Esta função só atravessa.
 */
export async function obterPagamentoDoPedidoNoPdv(
  pedidoId: unknown,
): Promise<PagamentoDoPedido | null> {
  if (typeof pedidoId !== "string" || pedidoId.length !== 36) return null;
  return obterPagamentoDoPedido(pedidoId);
}
