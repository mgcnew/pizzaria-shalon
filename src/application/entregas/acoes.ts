"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { Resultado } from "./tipos";

/**
 * Operações de entrega: atribuir, despachar, conferir o retorno e acertar.
 *
 * O QUE ESTE ARQUIVO **NÃO** FAZ:
 *  1. não move status de pedido — `despachar_corrida` e `registrar_retorno`
 *     chamam `comando_pedido`, que é a máquina de estados (CLAUDE.md §21);
 *  2. não calcula o esperado do acerto — ele é derivado dos recebimentos em
 *     dinheiro dentro da transação, e a tela só exibe o que o servidor diz;
 *  3. não transforma diferença em desconto de salário — isso não existe aqui
 *     nem em lugar nenhum automaticamente (RN-RUN-005).
 */

const ROTA_ENTREGAS = "/admin/entregas";
const ROTA_PEDIDOS = "/admin/pedidos";
const ROTA_CAIXA = "/admin/caixa";

const dinheiro = z
  .number()
  .finite()
  .nonnegative()
  .refine((v) => Number.isInteger(Math.round(v * 100)), "Valor em centavos inválido");

function falha(contexto: string, erro: unknown): Resultado {
  logger.error(`entregas:${contexto}`, { code: (erro as { code?: string })?.code });
  return { ok: false, erro: "Não foi possível concluir esta ação agora. Tente de novo." };
}

function resposta(data: unknown): Resultado {
  const r = (data ?? {}) as Record<string, unknown>;
  if (r["ok"]) return { ok: true };
  return {
    ok: false,
    erro: String(r["erro"] ?? "Não foi possível concluir esta ação."),
    ...(r["exige_motivo"] ? { exigeMotivo: true } : {}),
    ...(r["sem_caixa"] ? { semCaixa: true } : {}),
    ...(typeof r["esperado"] === "number" ? { esperado: r["esperado"] as number } : {}),
  };
}

const atribuirSchema = z.object({
  pedido_id: z.string().uuid(),
  motoboy_id: z.string().uuid(),
  motivo: z.string().max(400).optional(),
});

/** RN-RUN-001. Trocar de motoboy é chamar de novo com outro. */
export async function atribuirEntrega(entrada: unknown): Promise<Resultado> {
  const v = atribuirSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Escolha o pedido e o motoboy." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("atribuir_entrega", {
    p_order_id: v.data.pedido_id,
    p_dados: { motoboy_id: v.data.motoboy_id, motivo: v.data.motivo ?? null },
  });
  if (error) return falha("atribuirEntrega", error);

  revalidatePath(ROTA_ENTREGAS);
  revalidatePath(ROTA_PEDIDOS);
  return resposta(data);
}

const corridaSchema = z.object({ corrida_id: z.string().uuid() });

/** RN-RUN-002: a saída. Ou todos saem, ou nenhum sai. */
export async function despacharCorrida(entrada: unknown): Promise<Resultado> {
  const v = corridaSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Corrida inválida." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("despachar_corrida", {
    p_run_id: v.data.corrida_id,
  });
  if (error) return falha("despacharCorrida", error);

  revalidatePath(ROTA_ENTREGAS);
  revalidatePath(ROTA_PEDIDOS);
  return resposta(data);
}

const retornoSchema = z.object({
  vinculo_id: z.string().uuid(),
  entregue: z.boolean(),
  motivo: z.string().max(400).optional(),
});

/** RN-RUN-003/007: entregue ou falhou. Nenhum dos dois move dinheiro. */
export async function registrarRetorno(entrada: unknown): Promise<Resultado> {
  const v = retornoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Dados inválidos para este retorno." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_retorno", {
    p_vinculo_id: v.data.vinculo_id,
    p_dados: { entregue: v.data.entregue, motivo: v.data.motivo ?? null },
  });
  if (error) return falha("registrarRetorno", error);

  revalidatePath(ROTA_ENTREGAS);
  revalidatePath(ROTA_PEDIDOS);
  return resposta(data);
}

const acertoSchema = z.object({
  corrida_id: z.string().uuid(),
  devolvido: dinheiro,
  motivo: z.string().max(400).optional(),
  observacao: z.string().max(400).optional(),
});

/**
 * RN-PGTO-014: o único momento em que o dinheiro da rua vira caixa.
 *
 * `devolvido` é o que a pessoa contou da mão do motoboy. O ESPERADO não vem
 * daqui: o banco recalcula na hora de gravar, e é a diferença entre os dois
 * que exige justificativa.
 */
export async function conciliarCorrida(entrada: unknown): Promise<Resultado> {
  const v = acertoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe quanto o motoboy trouxe." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("conciliar_corrida", {
    p_run_id: v.data.corrida_id,
    p_dados: {
      devolvido: v.data.devolvido,
      motivo: v.data.motivo ?? null,
      observacao: v.data.observacao ?? null,
    },
  });
  if (error) return falha("conciliarCorrida", error);

  revalidatePath(ROTA_ENTREGAS);
  revalidatePath(ROTA_CAIXA);
  return resposta(data);
}
