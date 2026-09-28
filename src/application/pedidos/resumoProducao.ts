"use server";

import { z } from "zod";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";

export type ResumoProducao = {
  exigeProducao: boolean;
  itens: { quantidade: number; nome: string; tamanho: string | null; componentes: string[] }[];
};

/** Resumo sob RLS para o indicador da fila; não envia dados do cliente. */
export async function resumoProducaoDoPedido(id: string): Promise<ResumoProducao | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const sessao = await obterSessaoInterna();
  if (!podeNaUI(sessao, "orders.view")) return null;

  const supabase = await getSupabaseServerClient();
  const [pedido, itens] = await Promise.all([
    supabase.from("orders").select("requires_production").eq("id", id).maybeSingle(),
    supabase.from("order_items")
      .select("quantity, product_name_snapshot, size_name_snapshot, line_number, order_item_flavors(flavor_name_snapshot, sort_order), order_combo_components(product_name_snapshot, quantity, sort_order)")
      .eq("order_id", id)
      .order("line_number"),
  ]);

  if (pedido.error || itens.error || !pedido.data) {
    logger.error("pedidos:resumoProducao", {
      code: pedido.error?.code ?? itens.error?.code ?? "NOT_FOUND",
    });
    return null;
  }

  return {
    exigeProducao: Boolean(pedido.data.requires_production),
    itens: (itens.data ?? []).map((item) => {
      const sabores = [...(item.order_item_flavors ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((sabor) => sabor.flavor_name_snapshot);
      return {
        quantidade: item.quantity,
        nome: sabores.length ? sabores.join(" / ") : item.product_name_snapshot,
        tamanho: item.size_name_snapshot,
        componentes: [...(item.order_combo_components ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((componente) => `${componente.quantity}× ${componente.product_name_snapshot}`),
      };
    }),
  };
}
