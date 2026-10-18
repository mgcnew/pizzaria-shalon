"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";

/**
 * Fiado: deixar o pagamento para depois (D-2026-10-17-153, migration 0167).
 *
 * Fiado não é pagamento. O banco decide permissão, cliente identificado e
 * estado do pedido; aqui só se valida a forma e se recarregam as telas.
 */

export type ResultadoFiado = { ok: true } | { ok: false; erro: string };

export type FiadoEmAberto = {
  pedido_id: string;
  numero: number;
  cliente_id: string;
  cliente: string;
  whatsapp: string | null;
  total: number;
  em_aberto: number;
  desde: string;
  dias: number;
  observacao: string | null;
};

export type ResumoDoFiado =
  | { ok: true; total: number; clientes: number; pedidos: FiadoEmAberto[] }
  | { ok: false; erro: string };

const FALHA = "Não foi possível falar com o servidor agora. Tente de novo.";

function recarregar(pedidoId: string) {
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${pedidoId}`);
  revalidatePath("/admin/clientes");
  revalidatePath("/admin/pdv");
  revalidatePath("/admin");
}

export async function deixarParaPagarDepois(pedidoId: string, observacao: string): Promise<ResultadoFiado> {
  const id = z.uuid().safeParse(pedidoId);
  const obs = z.string().max(300).safeParse(observacao ?? "");
  if (!id.success || !obs.success) return { ok: false, erro: "Dados inválidos." };
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("deixar_para_pagar_depois", {
    p_order_id: id.data,
    p_observacao: obs.data.trim() || null,
  });
  if (error) {
    logger.error("fiado:deixar", { code: error.code });
    return { ok: false, erro: FALHA };
  }
  const r = data as ResultadoFiado;
  if (r.ok) recarregar(id.data);
  return r;
}

export async function desfazerFiado(pedidoId: string, motivo: string): Promise<ResultadoFiado> {
  const id = z.uuid().safeParse(pedidoId);
  const m = z.string().trim().min(3).max(400).safeParse(motivo ?? "");
  if (!id.success) return { ok: false, erro: "Dados inválidos." };
  if (!m.success) return { ok: false, erro: "Informe o motivo para desfazer o fiado." };
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("desfazer_fiado", { p_order_id: id.data, p_motivo: m.data });
  if (error) {
    logger.error("fiado:desfazer", { code: error.code });
    return { ok: false, erro: FALHA };
  }
  const r = data as ResultadoFiado;
  if (r.ok) recarregar(id.data);
  return r;
}

export async function listarFiados(): Promise<ResumoDoFiado> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("fiados_em_aberto");
  if (error) {
    logger.error("fiado:listar", { code: error.code });
    return { ok: false, erro: FALHA };
  }
  return data as ResumoDoFiado;
}
