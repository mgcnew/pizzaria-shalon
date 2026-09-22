"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { Resultado } from "./tipos";

/**
 * Operações de caixa, pagamento realizado e financeiro.
 *
 * O QUE ESTE ARQUIVO **NÃO** FAZ:
 *  1. não calcula o esperado em caixa — quem calcula é `esperado_em_caixa`
 *     no servidor, e o fechamento usa esse número, não o que a tela mostrou
 *     (03 §16.4);
 *  2. não decide autorização — `has_permission` no banco recusa a chamada
 *     direta do mesmo jeito que recusaria pela tela (RN-RBAC-004);
 *  3. não soma dinheiro — a divisão do pagamento é conferida contra o total
 *     do pedido dentro da transação, com `numeric`, sem tolerância (§24).
 *
 * IDEMPOTÊNCIA: cada ação que escreve dinheiro manda uma chave de tentativa.
 * Ela vem da tela, para que o reenvio da MESMA tentativa (clique duplo, retry
 * de rede) devolva o registro que já existe em vez de criar outro. Uma chave
 * gerada aqui no servidor não serviria: cada reenvio geraria outra.
 */

const ROTA_CAIXA = "/admin/caixa";
const ROTA_FIN = "/admin/financeiro";
const ROTA_PEDIDOS = "/admin/pedidos";

const dinheiro = z
  .number()
  .finite()
  .nonnegative()
  .refine((v) => Number.isInteger(Math.round(v * 100)), "Valor em centavos inválido");

const chave = z.string().uuid();

function falha(contexto: string, erro: unknown): Resultado {
  logger.error(`caixa:${contexto}`, { code: (erro as { code?: string })?.code });
  return { ok: false, erro: "Não foi possível concluir esta ação agora. Tente de novo." };
}

/** Converte a resposta da RPC em algo que a tela sabe mostrar. */
function resposta(data: unknown): Resultado {
  const r = (data ?? {}) as Record<string, unknown>;
  if (r["ok"]) return { ok: true };
  return {
    ok: false,
    erro: String(r["erro"] ?? "Não foi possível concluir esta ação."),
    ...(r["exige_justificativa"] ? { exigeJustificativa: true } : {}),
    ...(r["sem_caixa"] ? { semCaixa: true } : {}),
  };
}

// =========================================================== caixa

const abrirSchema = z.object({ fundo: dinheiro });

/** RN-CAIXA-002: fundo pode ser R$ 0,00. */
export async function abrirCaixa(entrada: unknown): Promise<Resultado> {
  const v = abrirSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe um fundo inicial válido." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("abrir_caixa", {
    p_dados: { fundo: v.data.fundo },
  });
  if (error) return falha("abrirCaixa", error);

  revalidatePath(ROTA_CAIXA);
  return resposta(data);
}

const movimentoSchema = z.object({
  tipo: z.enum(["supply", "withdrawal", "adjustment"]),
  valor: dinheiro.refine((n) => n > 0, "Informe um valor maior que zero."),
  motivo: z.string().max(400).optional(),
  sentido: z.enum(["in", "out"]).optional(),
  tentativa: chave,
});

/** RN-CAIXA-008/009: sangria e reforço são movimentos FÍSICOS do caixa. */
export async function movimentarCaixa(entrada: unknown): Promise<Resultado> {
  const v = movimentoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Dados inválidos para este movimento." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("movimentar_caixa", {
    p_dados: {
      tipo: v.data.tipo,
      valor: v.data.valor,
      motivo: v.data.motivo ?? null,
      sentido: v.data.sentido ?? null,
      idempotency_key: v.data.tentativa,
    },
  });
  if (error) return falha("movimentarCaixa", error);

  revalidatePath(ROTA_CAIXA);
  return resposta(data);
}

const fecharSchema = z.object({
  contado: dinheiro,
  justificativa: z.string().max(400).optional(),
});

/** RN-CAIXA-011/012: o esperado é do servidor; a pessoa informa o contado. */
export async function fecharCaixa(entrada: unknown): Promise<Resultado> {
  const v = fecharSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe o valor contado na gaveta." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("fechar_caixa", {
    p_dados: {
      contado: v.data.contado,
      justificativa: v.data.justificativa ?? null,
    },
  });
  if (error) return falha("fecharCaixa", error);

  revalidatePath(ROTA_CAIXA);
  return resposta(data);
}

const reabrirSchema = z.object({
  sessao_id: z.string().uuid(),
  motivo: z.string().min(3).max(400),
});

/** RN-CAIXA-016: excepcional, com motivo, e o fechamento anterior fica. */
export async function reabrirCaixa(entrada: unknown): Promise<Resultado> {
  const v = reabrirSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe o motivo da reabertura." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("reabrir_caixa", {
    p_sessao: v.data.sessao_id,
    p_motivo: v.data.motivo,
  });
  if (error) return falha("reabrirCaixa", error);

  revalidatePath(ROTA_CAIXA);
  return resposta(data);
}

const estornoMovimentoSchema = z.object({
  movimento_id: z.string().uuid(),
  motivo: z.string().min(3).max(400),
});

export async function estornarMovimento(entrada: unknown): Promise<Resultado> {
  const v = estornoMovimentoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe o motivo do estorno." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("reverter_movimento_caixa", {
    p_movimento: v.data.movimento_id,
    p_motivo: v.data.motivo,
  });
  if (error) return falha("estornarMovimento", error);

  revalidatePath(ROTA_CAIXA);
  return resposta(data);
}

// =================================================== pagamento realizado

const linhaSchema = z.object({
  forma_id: z.string().uuid(),
  bandeira_id: z.string().uuid().optional(),
  valor: dinheiro.refine((n) => n > 0, "Cada forma precisa de um valor."),
  recebido: dinheiro.optional(),
  na_gaveta: z.boolean().optional(),
});

const pagamentoSchema = z.object({
  pedido_id: z.string().uuid(),
  linhas: z.array(linhaSchema).min(1).max(6),
  observacao: z.string().max(400).optional(),
  tentativa: chave,
});

/**
 * RN-PGTO-002/003: registra o que foi RECEBIDO, sem tocar na intenção.
 *
 * A conferência da soma acontece no servidor. O que a tela manda é a
 * intenção de registro; quem decide se ela fecha com o total do pedido é
 * `registrar_pagamento`.
 */
export async function registrarPagamento(entrada: unknown): Promise<Resultado> {
  const v = pagamentoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Dados inválidos para o recebimento." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_pagamento", {
    p_order_id: v.data.pedido_id,
    p_dados: {
      linhas: v.data.linhas.map((l) => ({
        forma_id: l.forma_id,
        bandeira_id: l.bandeira_id ?? null,
        valor: l.valor,
        recebido: l.recebido ?? null,
        na_gaveta: l.na_gaveta ?? true,
      })),
      observacao: v.data.observacao ?? null,
      idempotency_key: v.data.tentativa,
    },
  });
  if (error) return falha("registrarPagamento", error);

  revalidatePath(ROTA_CAIXA);
  revalidatePath(`${ROTA_PEDIDOS}/${v.data.pedido_id}`);
  return resposta(data);
}

const estornoPagamentoSchema = z.object({
  pedido_id: z.string().uuid(),
  motivo: z.string().min(3).max(400),
});

export async function estornarPagamento(entrada: unknown): Promise<Resultado> {
  const v = estornoPagamentoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe o motivo do estorno." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("reverter_pagamento", {
    p_order_id: v.data.pedido_id,
    p_motivo: v.data.motivo,
  });
  if (error) return falha("estornarPagamento", error);

  revalidatePath(ROTA_CAIXA);
  revalidatePath(`${ROTA_PEDIDOS}/${v.data.pedido_id}`);
  return resposta(data);
}

// ============================================================ financeiro

const categoriaSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(2).max(60),
  tipo: z.enum(["income", "expense", "both"]),
  ativa: z.boolean().optional(),
});

/** RN-FIN-001: o plano de contas é da Shalon. Categoria não se apaga: desativa. */
export async function salvarCategoria(entrada: unknown): Promise<Resultado> {
  const v = categoriaSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe nome e tipo da categoria." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("salvar_categoria_financeira", {
    p_dados: {
      id: v.data.id ?? null,
      nome: v.data.nome,
      tipo: v.data.tipo,
      ativa: v.data.ativa ?? true,
    },
  });
  if (error) return falha("salvarCategoria", error);

  revalidatePath(ROTA_FIN);
  return resposta(data);
}

const lancamentoSchema = z.object({
  tipo: z.enum(["income", "expense"]),
  categoria_id: z.string().uuid(),
  valor: dinheiro.refine((n) => n > 0, "Informe um valor maior que zero."),
  descricao: z.string().min(3).max(400),
  forma_id: z.string().uuid().optional(),
  pelo_caixa: z.boolean().optional(),
  corrige_lancamento_id: z.string().uuid().optional(),
  tentativa: chave,
});

/** RN-CAIXA-010: despesa só mexe no caixa físico quando foi paga por ele. */
export async function registrarLancamento(entrada: unknown): Promise<Resultado> {
  const v = lancamentoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Dados inválidos para o lançamento." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_lancamento", {
    p_dados: {
      tipo: v.data.tipo,
      categoria_id: v.data.categoria_id,
      valor: v.data.valor,
      descricao: v.data.descricao,
      forma_id: v.data.forma_id ?? null,
      pelo_caixa: v.data.pelo_caixa ?? false,
      corrige_lancamento_id: v.data.corrige_lancamento_id ?? null,
      idempotency_key: v.data.tentativa,
    },
  });
  if (error) return falha("registrarLancamento", error);

  revalidatePath(ROTA_FIN);
  revalidatePath(ROTA_CAIXA);
  return resposta(data);
}

const estornoLancamentoSchema = z.object({
  lancamento_id: z.string().uuid(),
  motivo: z.string().min(3).max(400),
});

/** RN-FIN-003/004: o original permanece; o correto é um lançamento novo. */
export async function estornarLancamento(entrada: unknown): Promise<Resultado> {
  const v = estornoLancamentoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe o motivo do estorno." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("reverter_lancamento", {
    p_lancamento: v.data.lancamento_id,
    p_motivo: v.data.motivo,
  });
  if (error) return falha("estornarLancamento", error);

  revalidatePath(ROTA_FIN);
  revalidatePath(ROTA_CAIXA);
  return resposta(data);
}

/** Chave de tentativa para a tela carimbar num formulário recém-aberto. */
export async function novaTentativa(): Promise<string> {
  return randomUUID();
}
