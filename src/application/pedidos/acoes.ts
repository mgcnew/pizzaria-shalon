"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { obterLojaPublica } from "@/application/publico/consultas";
import { logger } from "@/lib/logger";
import {
  montarAlteracao,
  montarComanda,
  renderizarTexto,
  type ItemDaComanda,
  type LinhaComanda,
} from "@/domain/pedidos/comanda";
import { obterPedido } from "./consultas";
import type { ResultadoComando } from "./tipos";

/**
 * Operação interna de pedidos.
 *
 * O QUE ESTE ARQUIVO **NÃO** FAZ:
 *  1. não decide transição — `comando_pedido` valida estado, permissão e
 *     pré-condições, e recusa a chamada direta do mesmo jeito (CLAUDE.md §21);
 *  2. não decide autorização — nenhuma checagem de cargo aqui substitui a
 *     permissão semântica verificada no banco (RN-RBAC-004);
 *  3. não calcula preço de alteração — `propor_alteracao` reprecifica com a
 *     mesma `montar_item` do cardápio (CLAUDE.md §16).
 */

const ROTA = "/admin/pedidos";

const comandoSchema = z.object({
  pedido_id: z.string().uuid(),
  comando: z.string().min(3).max(40),
  motivo: z.string().max(400).optional(),
});

function falha(contexto: string, erro: unknown): ResultadoComando {
  logger.error(`pedidos:${contexto}`, { code: (erro as { code?: string })?.code });
  return { ok: false, erro: "Não foi possível concluir esta ação agora. Tente de novo." };
}

/** Executa um comando da máquina de estados. */
export async function executarComando(entrada: unknown): Promise<ResultadoComando> {
  const validado = comandoSchema.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: "Dados inválidos para esta ação." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("comando_pedido", {
    p_order_id: validado.data.pedido_id,
    p_comando: validado.data.comando,
    p_dados: { motivo: validado.data.motivo ?? null },
  });

  if (error) return falha("executarComando", error);

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${validado.data.pedido_id}`);
  return data as ResultadoComando;
}

const alteracaoSchema = z.object({
  pedido_id: z.string().uuid(),
  motivo: z.string().min(3).max(400),
  itens: z
    .array(
      z.object({
        produto_id: z.string().uuid(),
        variacao_id: z.string().uuid().nullish(),
        sabores: z.array(z.string().uuid()).max(4).optional(),
        borda_id: z.string().uuid().nullish(),
        adicionais: z.array(z.string().uuid()).max(20).optional(),
        observacao: z.string().max(300).optional(),
        quantidade: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(60),
});

/**
 * Propõe uma alteração.
 *
 * Quando itens ou total mudam, o pedido passa a aguardar o cliente e NÃO
 * avança sozinho (RN-ALT-004 e RN-ALT-006). Quem decide isso é o banco, que
 * compara os valores reprecificados com os do pedido.
 */
export async function proporAlteracao(entrada: unknown): Promise<ResultadoComando> {
  const validado = alteracaoSchema.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: "Confira os itens da alteração." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("propor_alteracao", {
    p_order_id: validado.data.pedido_id,
    p_dados: { motivo: validado.data.motivo, itens: validado.data.itens },
  });

  if (error) return falha("proporAlteracao", error);

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${validado.data.pedido_id}`);
  return data as ResultadoComando;
}

export async function retirarAlteracao(pedidoId: string): Promise<ResultadoComando> {
  if (!z.string().uuid().safeParse(pedidoId).success) {
    return { ok: false, erro: "Pedido inválido." };
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("retirar_alteracao", { p_order_id: pedidoId });
  if (error) return falha("retirarAlteracao", error);

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${pedidoId}`);
  return data as ResultadoComando;
}

// ------------------------------------------------------------- impressão

function horarioNaLoja(iso: string, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export type DocumentoParaImpressao =
  | { ok: true; impressao_id: string; via: number; linhas: LinhaComanda[]; texto: string }
  | { ok: false; erro: string };

/**
 * Gera o documento e REGISTRA a solicitação.
 *
 * O registro nasce como `requested`: neste momento ninguém sabe se saiu no
 * papel, e afirmar o contrário seria mentira (Fase 6, item 12). O desfecho
 * real é informado depois, por `confirmarImpressao`.
 *
 * O banco recusa emitir comanda de pedido não aceito (RN-PRINT-001/002) —
 * a interface não é a guardiã dessa regra.
 */
export async function emitirDocumento(
  pedidoId: string,
  tipo: "comanda" | "alteracao",
): Promise<DocumentoParaImpressao> {
  if (!z.string().uuid().safeParse(pedidoId).success) {
    return { ok: false, erro: "Pedido inválido." };
  }

  const [pedido, loja] = await Promise.all([obterPedido(pedidoId), obterLojaPublica()]);
  if (pedido === null) return { ok: false, erro: "Pedido não encontrado." };

  const fuso = loja?.fuso ?? "America/Sao_Paulo";
  const itens: ItemDaComanda[] = pedido.itens.map((i) => ({
    quantidade: i.quantidade,
    nome: i.nome,
    tamanho: i.tamanho,
    borda: i.borda,
    sabores: i.sabores?.map((s) => s.nome) ?? null,
    adicionais: i.adicionais,
    combo: i.combo,
    observacao: i.observacao,
  }));

  let linhas: LinhaComanda[];

  if (tipo === "comanda") {
    linhas = montarComanda({
      numero: pedido.numero,
      modalidade: pedido.modalidade,
      horario: horarioNaLoja(pedido.criado_em, fuso),
      cliente: pedido.cliente.nome,
      itens,
      observacao: pedido.observacao,
      endereco: pedido.endereco
        ? {
            logradouro: pedido.endereco["logradouro"] ?? "",
            numero: pedido.endereco["numero"] ?? "",
            complemento: pedido.endereco["complemento"],
            bairro: pedido.endereco["bairro"] ?? "",
            referencia: pedido.endereco["referencia"],
          }
        : null,
      trocoPara: pedido.pagamento?.troco_para ?? null,
      trocoEsperado: pedido.pagamento?.troco_esperado ?? null,
      formaPagamento: pedido.pagamento?.forma ?? null,
    });
  } else {
    const revisao = pedido.revisoes.find((r) => r.status === "applied");
    if (revisao === undefined) {
      return { ok: false, erro: "Não há alteração aplicada para imprimir." };
    }
    linhas = montarAlteracao({
      numero: pedido.numero,
      horario: horarioNaLoja(revisao.proposta_em, fuso),
      motivo: revisao.motivo,
      itensAntes: revisao.itens_antes.map((i) => ({
        quantidade: i.quantidade,
        nome: i.nome,
      })),
      itensDepois: itens,
    });
  }

  const texto = renderizarTexto(linhas);

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_impressao", {
    p_order_id: pedidoId,
    p_tipo: tipo,
    p_conteudo: texto,
    // O transporte ainda não foi escolhido (A-08). Registrar `tela` é a
    // verdade: hoje o documento é conferido na tela pela operação.
    p_transporte: "tela",
  });

  if (error) {
    logger.error("pedidos:emitirDocumento", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível registrar a emissão agora." };
  }

  const resposta = data as { ok: boolean; erro?: string; impressao_id?: string; via?: number };
  if (!resposta.ok) return { ok: false, erro: resposta.erro ?? "Não foi possível emitir." };

  revalidatePath(`${ROTA}/${pedidoId}`);
  return {
    ok: true,
    impressao_id: resposta.impressao_id as string,
    via: resposta.via as number,
    linhas,
    texto,
  };
}

/**
 * Registra o desfecho de uma impressão.
 *
 * Existe porque "o navegador disparou" não é "o papel saiu". Enquanto
 * ninguém confirmar, o registro permanece em `requested` — que é a
 * informação honesta.
 */
export async function confirmarImpressao(
  impressaoId: string,
  status: "sent" | "confirmed" | "error",
  erro?: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!z.string().uuid().safeParse(impressaoId).success) {
    return { ok: false, erro: "Impressão inválida." };
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("atualizar_impressao", {
    p_print_id: impressaoId,
    p_status: status,
    p_erro: erro ?? null,
  });

  if (error) {
    logger.error("pedidos:confirmarImpressao", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível registrar o resultado." };
  }
  return data as { ok: boolean; erro?: string };
}
