"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { Resultado } from "./tipos";

/**
 * A única escrita desta tela é a preferência promocional do cliente.
 *
 * E ela é escrita HISTÓRICA: `registrar_consentimento` grava quem registrou,
 * quando e por qual canal, além de atualizar o estado atual. "O cliente pediu
 * para não receber" precisa ser demonstrável depois, não apenas um booleano
 * que alguém virou (RN-RMKT-006/007).
 *
 * Bloqueio de cliente continua onde já estava, na Fase 6: esta fase não
 * reabre aquele fluxo.
 */

const ROTA_CLIENTES = "/admin/clientes";

const consentimentoSchema = z.object({
  cliente_id: z.string().uuid(),
  aceita: z.boolean(),
  observacao: z.string().max(400).optional(),
});

export async function registrarConsentimento(entrada: unknown): Promise<Resultado> {
  const v = consentimentoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe o cliente e a preferência." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_consentimento", {
    p_dados: {
      cliente_id: v.data.cliente_id,
      aceita: v.data.aceita,
      origem: "admin",
      observacao: v.data.observacao ?? null,
    },
  });

  if (error) {
    logger.error("clientes:registrarConsentimento", {
      code: (error as { code?: string }).code,
    });
    return { ok: false, erro: "Não foi possível registrar agora. Tente de novo." };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (!r["ok"]) {
    return { ok: false, erro: String(r["erro"] ?? "Não foi possível registrar.") };
  }

  revalidatePath(ROTA_CLIENTES);
  revalidatePath(`${ROTA_CLIENTES}/${v.data.cliente_id}`);
  return { ok: true };
}
