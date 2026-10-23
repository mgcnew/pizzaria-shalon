"use server";

import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { EstiloLinha, LinhaComanda } from "@/domain/pedidos/comanda";

/**
 * Impressão pelo balcão (D-2026-10-08-116, entrega 3).
 *
 * O celular registra o pedido de impressão (`emitirDocumento` com modo
 * `balcao`); o aparelho marcado como balcão lista o que está esperando, PEGA
 * um por um e imprime. Quem garante que só um aparelho imprime cada pedido,
 * e que pedido velho não sai, é `pegar_impressao_do_balcao` no banco.
 */

const TRANSPORTE = "balcao-80mm";

/** Mesmo prazo do banco: o que passou disso ele recusa. */
const PRAZO_MS = 2 * 60 * 1000;

// "forte" precisa estar aqui: o que não está na lista vira texto comum, e a
// comanda que o celular manda ao balcão perderia o negrito dos itens.
const ESTILOS: readonly EstiloLinha[] = ["normal", "titulo", "destaque", "forte", "separador", "vazio"];

/** As linhas vêm do banco, mas são tratadas como entrada (CLAUDE.md §36). */
const linhasSchema = z
  .array(
    z.object({
      texto: z.string().max(200),
      estilo: z.string().transform((e) => (ESTILOS.includes(e as EstiloLinha) ? (e as EstiloLinha) : "normal")),
    }),
  )
  .max(2000);

/** Pedidos de impressão esperando o balcão, do mais antigo para o mais novo. */
export async function listarEsperandoBalcao(): Promise<string[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("order_prints")
    .select("id")
    .eq("status", "requested")
    .eq("transport", TRANSPORTE)
    .gte("requested_at", new Date(Date.now() - PRAZO_MS).toISOString())
    .order("requested_at", { ascending: true })
    .limit(20);

  if (error) {
    logger.error("impressao:listarEsperandoBalcao", { code: error.code });
    return [];
  }
  return (data ?? []).map((l) => l.id as string);
}

export type ImpressaoPega =
  | { ok: true; id: string; via: number; numero: number; tipo: "comanda" | "alteracao"; linhas: LinhaComanda[] }
  | { ok: false; erro: string; motivo?: "ja_pega" | "expirou" };

export async function pegarImpressaoDoBalcao(impressaoId: string): Promise<ImpressaoPega> {
  if (!z.string().uuid().safeParse(impressaoId).success) {
    return { ok: false, erro: "Impressão inválida." };
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("pegar_impressao_do_balcao", { p_print_id: impressaoId });
  if (error) {
    logger.error("impressao:pegarImpressaoDoBalcao", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível pegar a impressão agora." };
  }

  const r = data as {
    ok: boolean;
    erro?: string;
    motivo?: "ja_pega" | "expirou";
    via?: number;
    numero?: number;
    tipo?: "comanda" | "alteracao";
    linhas?: unknown;
  };
  if (!r.ok) {
    return { ok: false, erro: r.erro ?? "Não foi possível imprimir.", ...(r.motivo ? { motivo: r.motivo } : {}) };
  }

  const linhas = linhasSchema.safeParse(r.linhas);
  if (!linhas.success) return { ok: false, erro: "Documento ilegível para impressão." };

  return {
    ok: true,
    id: impressaoId,
    via: r.via ?? 1,
    numero: r.numero ?? 0,
    tipo: r.tipo === "alteracao" ? "alteracao" : "comanda",
    linhas: linhas.data,
  };
}

export type SituacaoDaImpressao = {
  status: "requested" | "sent" | "confirmed" | "error";
  erro: string | null;
};

/** O celular acompanha se o balcão já pegou. Lida sob RLS (`orders.view`). */
export async function situacaoDaImpressao(impressaoId: string): Promise<SituacaoDaImpressao | null> {
  if (!z.string().uuid().safeParse(impressaoId).success) return null;

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("order_prints")
    .select("status, error_message")
    .eq("id", impressaoId)
    .maybeSingle();

  if (error || data === null) return null;
  return {
    status: data.status as SituacaoDaImpressao["status"],
    erro: (data.error_message as string | null) ?? null,
  };
}
