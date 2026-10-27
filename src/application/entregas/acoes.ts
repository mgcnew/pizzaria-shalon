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
// O acerto do motoboy move dinheiro físico para a gaveta, e o PDV é a tela do
// caixa desde a consolidação PDV × Caixa.
const ROTA_PDV = "/admin/pdv";

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
    ...(r["ja_conferida"] ? { jaConferida: true } : {}),
    ...(r["nao_esta_em_rota"] ? { naoEstaEmRota: true } : {}),
    ...(r["ja_conciliado"] ? { jaConciliado: true } : {}),
  };
}

const presencaSchema = z.object({
  funcionario_id: z.string().uuid(),
  /** `null` desfaz a marca do dia. */
  status: z.enum(["present", "absent"]).nullable(),
});

/**
 * Marca o motoboy como Veio ou Faltou hoje, ou desfaz a marca (D-2026-10-24-165).
 *
 * Quem decide o DIA é o servidor: a tela não manda data, então não há como
 * marcar presença de outro dia. A permissão (`employees.attendance`) também é
 * conferida lá, e a marca fica em `audit_logs`.
 */
export async function marcarPresenca(entrada: unknown): Promise<Resultado> {
  const v = presencaSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Escolha o motoboy e a situação." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("marcar_presenca", {
    p_dados: { funcionario_id: v.data.funcionario_id, status: v.data.status },
  });
  if (error) return falha("marcarPresenca", error);

  revalidatePath(ROTA_ENTREGAS);
  revalidatePath("/admin/equipe");
  return resposta(data);
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
  revalidatePath(ROTA_PDV);
  return resposta(data);
}

const transferenciaSchema = z.object({
  vinculo_id: z.string().uuid(),
  motoboy_id: z.string().uuid(),
  motivo: z.string().min(3).max(400),
  observacao: z.string().max(400).optional(),
});

/**
 * RN-RUN-008: a moto quebrou e outro vai buscar.
 *
 * NÃO é a mesma coisa que trocar o motoboy antes de sair. Ali o vínculo é
 * reescrito porque o pedido nunca esteve na rua; aqui ele PERMANECE, porque
 * quem saiu com o pedido é um fato (CLAUDE.md §22).
 *
 * E não move dinheiro: o que já foi recebido continua sob responsabilidade de
 * quem o recebeu, e o acerto de cada um cobra o que lhe cabe (RN-RUN-009).
 */
export async function transferirEntrega(entrada: unknown): Promise<Resultado> {
  const v = transferenciaSchema.safeParse(entrada);
  if (!v.success) {
    return { ok: false, erro: "Escolha o motoboy e escreva o motivo da transferência." };
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("transferir_entrega", {
    p_vinculo_id: v.data.vinculo_id,
    p_dados: {
      motoboy_id: v.data.motoboy_id,
      motivo: v.data.motivo,
      observacao: v.data.observacao ?? null,
    },
  });
  if (error) return falha("transferirEntrega", error);

  revalidatePath(ROTA_ENTREGAS);
  revalidatePath(ROTA_PEDIDOS);
  return resposta(data);
}

export type MotoboyParaDespacho = {
  id: string;
  nome: string;
  presente: boolean;
  na_rua: boolean;
  entregas_na_rua: number;
};

/**
 * Quem pode levar uma entrega agora (D-2026-10-27-172): entregadores ativos,
 * sem quem faltou hoje. Lido na hora em que o "Saiu com…" abre.
 */
export async function listarMotoboysParaDespacho(): Promise<
  { ok: true; motoboys: MotoboyParaDespacho[] } | { ok: false; erro: string }
> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("motoboys_para_despacho");
  if (error) {
    logger.error("entregas:listarMotoboysParaDespacho", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível carregar os motoboys agora." };
  }
  const r = (data ?? {}) as { ok?: boolean; erro?: string; motoboys?: MotoboyParaDespacho[] };
  return r.ok ? { ok: true, motoboys: r.motoboys ?? [] } : { ok: false, erro: r.erro ?? "Não foi possível carregar os motoboys." };
}

const saidaComMotoboySchema = z.object({
  pedido_id: z.string().uuid(),
  motoboy_id: z.string().uuid(),
});

/**
 * "Saiu com…" (D-2026-10-27-172, RN-STATE-007): vincula a entrega ao motoboy e
 * a põe na rua num ato. Motoboy já na rua leva este pedido na mesma saída.
 */
export async function sairComMotoboy(entrada: unknown): Promise<Resultado> {
  const v = saidaComMotoboySchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Escolha o motoboy." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("sair_com_motoboy", {
    p_order_id: v.data.pedido_id,
    p_motoboy_id: v.data.motoboy_id,
  });
  if (error) return falha("sairComMotoboy", error);

  revalidatePath(ROTA_ENTREGAS);
  revalidatePath(ROTA_PEDIDOS);
  revalidatePath(`${ROTA_PEDIDOS}/${v.data.pedido_id}`);
  return resposta(data);
}

