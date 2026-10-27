"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import { obterResumoDeFechamento } from "./consultas";
import type { ResumoDeFechamento, Resultado } from "./tipos";
import type { PedidoSemRecebimento } from "@/domain/caixa/relatorioDeFechamento";

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

const ROTA_FIN = "/admin/financeiro";
const ROTA_PEDIDOS = "/admin/pedidos";
/**
 * O PDV é a frente de caixa INTEIRA desde a consolidação PDV × Caixa: fila de
 * recebimento, sessão, movimentos e histórico de fechamentos.
 *
 * Antes havia duas invalidações em cada ação, uma para `/admin/caixa` e outra
 * para cá. `/admin/caixa` virou redirect e não renderiza nada, então invalidá-la
 * seria pedir revalidação de uma rota sem página — silenciosamente inútil.
 * Ficou uma só, e é aqui — na autoridade — que ela pertence.
 */
const ROTA_PDV = "/admin/pdv";

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
    // `ja_pago` vinha sendo descartado aqui, e com ele a diferença entre
    // "deu problema" e "outro terminal já recebeu" — a mesma tarja vermelha
    // para as duas coisas, no balcão, na frente do cliente (09 §9, item 4).
    ...(r["ja_pago"] ? { jaPago: true } : {}),
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

  revalidatePath(ROTA_PDV);
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

  revalidatePath(ROTA_PDV);
  return resposta(data);
}

export type PreviaDoFechamento =
  | {
      ok: true;
      /** Cartão, Pix e vale: o que NÃO é dinheiro físico. */
      semDinheiro: { metodo: string; total: number }[];
      /** Dinheiro recebido que ainda não entrou na gaveta (RN-CAIXA-014). */
      foraDaGaveta: number;
      /** Pedidos do turno ainda sem recebimento no caixa (0176): receber antes de fechar. */
      semRecebimento: PedidoSemRecebimento[];
    }
  | { ok: false };

/**
 * O que a pessoa pode ver ANTES de contar a gaveta.
 *
 * O fechamento é cego (RN-CAIXA-011): o dinheiro esperado não pode chegar ao
 * navegador antes da contagem. Cartão e Pix não são dinheiro físico, então
 * conferi-los com a maquininha não revela nada da gaveta; e o dinheiro que
 * ainda está fora dela é justamente o que NÃO se conta. O filtro é feito AQUI,
 * no servidor: a tela nunca recebe a linha de dinheiro e depois a esconde.
 * Quem não tem acesso ao resumo recebe `ok: false` e a tela segue sem a prévia.
 */
export async function obterPreviaDoFechamento(): Promise<PreviaDoFechamento> {
  const resumo = await obterResumoDeFechamento();
  if (resumo === null) return { ok: false };
  return {
    ok: true,
    semDinheiro: resumo.recebimentos_por_metodo
      .filter((r) => r.familia !== "cash")
      .map((r) => ({ metodo: r.metodo, total: r.total })),
    foraDaGaveta: resumo.dinheiro_fora_da_gaveta,
    semRecebimento: resumo.sem_recebimento ?? [],
  };
}

const fecharSchema = z.object({
  contado: dinheiro,
  justificativa: z.string().max(400).optional(),
});

export type ResultadoDoFechamentoCego =
  | {
      ok: true;
      fechado: boolean;
      esperado: number;
      contado: number;
      diferenca: number;
      resumo: ResumoDeFechamento | null;
    }
  | { ok: false; erro: string };

/**
 * Primeiro passo do fechamento cego, usando a própria autoridade do caixa.
 *
 * Sem diferença, o caixa fecha imediatamente. Com diferença, a RPC não fecha:
 * devolve a conferência e exige uma segunda chamada com justificativa. Assim o
 * esperado nunca chega antes da primeira confirmação da contagem.
 */
export async function iniciarFechamentoCego(
  entrada: unknown,
): Promise<ResultadoDoFechamentoCego> {
  const v = z.object({ contado: dinheiro }).safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe o valor contado na gaveta." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("fechar_caixa", {
    p_dados: { contado: v.data.contado, justificativa: null },
  });
  if (error) {
    logger.error("caixa:iniciarFechamentoCego", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível conferir o caixa agora." };
  }

  const resultado = (data ?? {}) as Record<string, unknown>;
  const temConferencia =
    typeof resultado["esperado"] === "number" &&
    typeof resultado["contado"] === "number" &&
    typeof resultado["diferenca"] === "number";

  if (!temConferencia) {
    return {
      ok: false,
      erro: String(resultado["erro"] ?? "Não foi possível conferir o caixa agora."),
    };
  }

  if (resultado["ok"]) revalidatePath(ROTA_PDV);
  const resumo = await obterResumoDeFechamento(
    typeof resultado["sessao_id"] === "string"
      ? resultado["sessao_id"] as string
      : undefined,
  );
  return {
    ok: true,
    fechado: Boolean(resultado["ok"]),
    esperado: resultado["esperado"] as number,
    contado: resultado["contado"] as number,
    diferenca: resultado["diferenca"] as number,
    resumo,
  };
}

/**
 * O fechamento completo de UMA sessão, para quem abre o detalhe no relatório
 * de caixa. Só leitura: quem decide o que aparece é a RLS de `cash.view`
 * (a projeção é SECURITY INVOKER), então chamada direta sem permissão volta
 * como "não encontrada", sem revelar que a sessão existe.
 */
export async function obterResumoDaSessao(
  sessaoId: unknown,
): Promise<{ ok: true; resumo: ResumoDeFechamento } | { ok: false; erro: string }> {
  const v = z.string().uuid().safeParse(sessaoId);
  if (!v.success) return { ok: false, erro: "Sessão inválida." };

  const resumo = await obterResumoDeFechamento(v.data);
  if (!resumo) return { ok: false, erro: "Não foi possível carregar o fechamento desta sessão." };
  return { ok: true, resumo };
}

/** RN-CAIXA-011/012: o esperado é do servidor; a pessoa informa o contado. */
export async function fecharCaixa(entrada: unknown): Promise<Resultado & { resumo?: ResumoDeFechamento | null }> {
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

  const resultado = resposta(data);
  if (!resultado.ok) return resultado;

  revalidatePath(ROTA_PDV);
  const bruto = (data ?? {}) as Record<string, unknown>;
  const resumo = await obterResumoDeFechamento(
    typeof bruto["sessao_id"] === "string" ? bruto["sessao_id"] as string : undefined,
  );
  return {
    ok: true,
    resumo,
  };
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

  revalidatePath(ROTA_PDV);
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

  revalidatePath(ROTA_PDV);
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

  revalidatePath(ROTA_PDV);
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

  revalidatePath(ROTA_PDV);
  revalidatePath(`${ROTA_PEDIDOS}/${v.data.pedido_id}`);
  return resposta(data);
}

const trocaDeFormaSchema = z.object({
  pedido_id: z.string().uuid(),
  forma_id: z.string().uuid(),
  bandeira_id: z.string().uuid().optional(),
  /** O valor pago, só para a conferência: o servidor exige que feche com o que já foi pago. */
  valor: z.number().finite().positive(),
  motivo: z.string().trim().min(3).max(400),
  tentativa: chave,
});

/**
 * D-2026-10-24-167: troca a forma de pagamento de um pedido já pago, em um ato
 * só e NA SESSÃO ORIGINAL do pagamento (aberta ou já fechada).
 *
 * Quem decide tudo — permissão (estornar E registrar), soma, sessão, o que
 * muda no fechamento — é `trocar_forma_de_pagamento`; aqui só se valida o
 * formato e se devolve se a sessão era uma já fechada, para a tela dizer.
 */
export async function trocarFormaDePagamento(
  entrada: unknown,
): Promise<Resultado & { sessaoFechada?: boolean }> {
  const v = trocaDeFormaSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Escolha a forma de pagamento e informe o motivo da troca." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("trocar_forma_de_pagamento", {
    p_order_id: v.data.pedido_id,
    p_dados: {
      linhas: [{ forma_id: v.data.forma_id, bandeira_id: v.data.bandeira_id ?? null, valor: v.data.valor }],
      motivo: v.data.motivo,
      idempotency_key: v.data.tentativa,
    },
  });
  if (error) return falha("trocarFormaDePagamento", error);

  const resultado = resposta(data);
  if (!resultado.ok) return resultado;

  revalidatePath(ROTA_PDV);
  revalidatePath(ROTA_FIN);
  revalidatePath(`${ROTA_PEDIDOS}/${v.data.pedido_id}`);
  revalidatePath("/admin/relatorios");
  const bruto = (data ?? {}) as Record<string, unknown>;
  return { ok: true, sessaoFechada: Boolean(bruto["sessao_fechada"]) };
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
  revalidatePath(ROTA_PDV);
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
  revalidatePath(ROTA_PDV);
  return resposta(data);
}

/** Chave de tentativa para a tela carimbar num formulário recém-aberto. */
export async function novaTentativa(): Promise<string> {
  return randomUUID();
}
