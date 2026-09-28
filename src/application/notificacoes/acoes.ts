"use server";

import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";

export type NotificacaoAdministrativa = {
  id: string;
  kind: "new_order";
  order_id: string;
  order_number: number;
  created_at: string;
  read: boolean;
  resolved: boolean;
};

export type ResumoNotificacoes = {
  items: NotificacaoAdministrativa[];
  unread_count: number;
};

/** A lista vem de uma projeção invoker sob RLS, nunca da carga Realtime. */
export async function listarNotificacoes(): Promise<ResumoNotificacoes> {
  const sessao = await obterSessaoInterna();
  if (!podeNaUI(sessao, "orders.view")) return { items: [], unread_count: 0 };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("notificacoes_administrativas", { p_limite: 30 });
  if (error) {
    logger.error("notificacoes:listar", { code: error.code });
    return { items: [], unread_count: 0 };
  }
  return (data ?? { items: [], unread_count: 0 }) as ResumoNotificacoes;
}

/** Leitura é por usuário; a identidade vem da sessão, não do navegador. */
export async function marcarNotificacaoLida(id: string): Promise<boolean> {
  if (!z.uuid().safeParse(id).success) return false;
  const sessao = await obterSessaoInterna();
  if (!podeNaUI(sessao, "orders.view")) return false;

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("marcar_notificacao_lida", { p_notificacao: id });
  if (error) {
    logger.error("notificacoes:marcarLida", { code: error.code });
    return false;
  }
  return Boolean((data as { ok?: boolean } | null)?.ok);
}
