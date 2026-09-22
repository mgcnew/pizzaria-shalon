"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { Resultado } from "./tipos";

/**
 * Movimentações internas e lançamentos do funcionário.
 *
 * O QUE ESTE ARQUIVO **NÃO** FAZ:
 *  1. não precifica — o item vai para `montar_item`, o MESMO configurador do
 *     cardápio, do balcão e da alteração. Não existe terceiro cálculo
 *     (CLAUDE.md §16/§17);
 *  2. não transforma consumo em dívida — registrar é um ato, lançar no livro
 *     é outro, de quem tem `employees.finance.manage` (§15);
 *  3. não toca em salário. Em nenhuma hipótese, por nenhum caminho
 *     (RN-EMPFIN-003).
 */

const ROTA_EQUIPE = "/admin/equipe";

const dinheiro = z
  .number()
  .finite()
  .positive()
  .refine((v) => Number.isInteger(Math.round(v * 100)), "Valor em centavos inválido");

/** A MESMA forma de item do balcão e da alteração. Nenhum campo a mais. */
const itemSchema = z.object({
  produto_id: z.string().uuid(),
  variacao_id: z.string().uuid().nullish(),
  sabores: z.array(z.string().uuid()).max(4).optional(),
  borda_id: z.string().uuid().nullish(),
  adicionais: z.array(z.string().uuid()).max(20).optional(),
  observacao: z.string().max(300).optional(),
  quantidade: z.number().int().min(1).max(99),
});

function falha(contexto: string, erro: unknown): Resultado {
  logger.error(`equipe:${contexto}`, { code: (erro as { code?: string })?.code });
  return { ok: false, erro: "Não foi possível concluir esta ação agora. Tente de novo." };
}

function resposta(data: unknown): Resultado {
  const r = (data ?? {}) as Record<string, unknown>;
  if (r["ok"]) return { ok: true };
  return {
    ok: false,
    erro: String(r["erro"] ?? "Não foi possível concluir esta ação."),
    ...(r["tem_lancamento"] ? { temLancamento: true } : {}),
    ...(r["ja_lancado"] ? { jaLancado: true } : {}),
  };
}

const movimentoSchema = z.object({
  tipo: z.enum(["courtesy", "employee_consumption", "owner_consumption", "loss"]),
  funcionario_id: z.string().uuid().nullish(),
  autorizado_por: z.string().uuid().nullish(),
  motivo: z.string().min(3).max(400),
  observacao: z.string().max(400).optional(),
  itens: z.array(itemSchema).min(1).max(50),
  tentativa: z.string().uuid(),
});

/** RN-CLASS-001: saída de produto que não é venda, com dono e com motivo. */
export async function registrarMovimentoInterno(entrada: unknown): Promise<Resultado> {
  const v = movimentoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Preencha o tipo, o motivo e ao menos um item." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_movimento_interno", {
    p_dados: {
      tipo: v.data.tipo,
      funcionario_id: v.data.funcionario_id ?? null,
      autorizado_por: v.data.autorizado_por ?? null,
      motivo: v.data.motivo,
      observacao: v.data.observacao ?? null,
      itens: v.data.itens,
      idempotency_key: v.data.tentativa,
    },
  });
  if (error) return falha("registrarMovimentoInterno", error);

  revalidatePath(ROTA_EQUIPE);
  return resposta(data);
}

const estornoSchema = z.object({
  id: z.string().uuid(),
  motivo: z.string().min(3).max(400),
});

/** §28: o original permanece. Estorno é registro novo, não apagamento. */
export async function reverterMovimentoInterno(entrada: unknown): Promise<Resultado> {
  const v = estornoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe o motivo do estorno." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("reverter_movimento_interno", {
    p_id: v.data.id,
    p_motivo: v.data.motivo,
  });
  if (error) return falha("reverterMovimentoInterno", error);

  revalidatePath(ROTA_EQUIPE);
  return resposta(data);
}

const lancamentoSchema = z.object({
  funcionario_id: z.string().uuid(),
  tipo: z.enum(["consumption", "advance", "discrepancy", "adjustment", "other"]),
  valor: dinheiro,
  motivo: z.string().min(3).max(400),
  observacao: z.string().max(400).optional(),
  /** Vínculo rastreável com o fato que originou o lançamento (RN-RUN-006). */
  corrida_id: z.string().uuid().nullish(),
  movimento_id: z.string().uuid().nullish(),
  anexo_id: z.string().uuid().nullish(),
  tentativa: z.string().uuid(),
});

/**
 * RN-EMPFIN-002/003: conferência gerencial, e nada além disso.
 *
 * Isto NÃO desconta salário, não calcula encargo e não gera folha. É um
 * registro de "ficou combinado assim", feito por alguém com permissão
 * financeira, ligado ao fato que o originou.
 */
export async function lancarNoFuncionario(entrada: unknown): Promise<Resultado> {
  const v = lancamentoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Preencha funcionário, tipo, valor e motivo." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("lancar_no_funcionario", {
    p_dados: {
      funcionario_id: v.data.funcionario_id,
      tipo: v.data.tipo,
      valor: v.data.valor,
      motivo: v.data.motivo,
      observacao: v.data.observacao ?? null,
      corrida_id: v.data.corrida_id ?? null,
      movimento_id: v.data.movimento_id ?? null,
      anexo_id: v.data.anexo_id ?? null,
      idempotency_key: v.data.tentativa,
    },
  });
  if (error) return falha("lancarNoFuncionario", error);

  revalidatePath(ROTA_EQUIPE);
  revalidatePath("/admin/entregas");
  return resposta(data);
}

/** §28: reverter preserva o lançamento original, com quem e por quê. */
export async function reverterLancamentoFuncionario(entrada: unknown): Promise<Resultado> {
  const v = estornoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe o motivo do estorno." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("reverter_lancamento_funcionario", {
    p_id: v.data.id,
    p_motivo: v.data.motivo,
  });
  if (error) return falha("reverterLancamentoFuncionario", error);

  revalidatePath(ROTA_EQUIPE);
  return resposta(data);
}
