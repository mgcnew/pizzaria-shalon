"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { obterLojaPublica } from "@/application/publico/consultas";
import { cotarEntrega } from "@/application/checkout/acoes";
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
  /** Versão do pedido sobre a qual a proposta foi construída (§34). */
  versao: z.string().min(10).max(40).optional(),
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
    p_dados: {
      motivo: validado.data.motivo,
      versao: validado.data.versao ?? null,
      itens: validado.data.itens,
    },
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

// ---------------------------------------------------------- pedido manual

const itemManualSchema = z.object({
  linha: z.string().min(1).max(400),
  produto_id: z.string().uuid(),
  variacao_id: z.string().uuid().nullish(),
  sabores: z.array(z.string().uuid()).max(4).optional(),
  borda_id: z.string().uuid().nullish(),
  adicionais: z.array(z.string().uuid()).max(20).optional(),
  observacao: z.string().max(300).optional(),
  quantidade: z.number().int().min(1).max(99),
});

const pedidoManualSchema = z.object({
  idempotency_key: z.string().uuid(),
  origem: z.enum(["whatsapp", "phone", "counter", "ifood", "other"]),
  modalidade: z.enum(["delivery", "pickup"]),
  cliente: z.object({
    nome: z.string().min(2).max(120),
    whatsapp: z.string().min(8).max(24),
  }),
  endereco: z
    .object({
      logradouro: z.string().min(2).max(160),
      numero: z.string().min(1).max(20),
      complemento: z.string().max(80).nullish(),
      bairro: z.string().min(2).max(80),
      cidade: z.string().min(2).max(80),
      uf: z.string().length(2),
      cep: z.string().max(12).nullish(),
      referencia: z.string().max(160).nullish(),
    })
    .nullish(),
  itens: z.array(itemManualSchema).min(1).max(60),
  pagamento: z.object({
    forma_id: z.string().uuid(),
    bandeira_id: z.string().uuid().nullish(),
    precisa_troco: z.boolean().optional(),
    troco_para: z.number().nonnegative().nullish(),
  }),
  observacao_geral: z.string().max(500).nullish(),
});

export type ResultadoPedidoManual =
  | { ok: true; ja_existia: boolean; pedido_id: string; numero: number; status: string; total: number; token: string | null }
  | { ok: false; erro: string; fora_de_area?: boolean; rota_indisponivel?: boolean; endereco_ambiguo?: boolean };

/**
 * Lança um pedido recebido por fora do link (RN-MAN-001 a 003).
 *
 * PASSA PELA MESMA PORTA do pedido público: `criar_pedido`. Ela reconhece o
 * lançamento interno por `orders.create_manual` e recusa quem não a tem —
 * esconder o botão não seria segurança (CLAUDE.md §12).
 *
 * Por consequência, o pedido do balcão obedece às mesmas regras: itens
 * revalidados, preços recalculados, disponibilidade conferida, mínimo de
 * entrega, faixa de taxa, forma de pagamento e estado inicial. Estar no
 * administrativo não contorna nada.
 *
 * O token de acompanhamento é ALEATÓRIO aqui, e não derivado do segredo de
 * origem: o balcão precisa funcionar mesmo sem a credencial do checkout
 * público configurada. A proteção contra reenvio continua sendo a chave de
 * idempotência.
 */
export async function criarPedidoManual(entrada: unknown): Promise<ResultadoPedidoManual> {
  const validado = pedidoManualSchema.safeParse(entrada);
  if (!validado.success) {
    return { ok: false, erro: "Confira os dados do pedido antes de lançar." };
  }
  const dados = validado.data;

  let rota: { distancia_km: number; provedor: string } | null = null;
  let enderecoParaBanco: Record<string, unknown> | null = null;

  if (dados.modalidade === "delivery") {
    if (!dados.endereco) return { ok: false, erro: "Informe o endereço de entrega." };

    // Mesma medição do checkout público. Sem provedor de rotas configurado,
    // isto falha com mensagem honesta — e NÃO inventa distância nem taxa
    // (CLAUDE.md §20). A retirada segue funcionando normalmente.
    const medida = await cotarEntrega(dados.endereco);
    if (!medida.ok) {
      return {
        ok: false,
        erro: medida.erro,
        ...(medida.motivo === "fora_de_area" ? { fora_de_area: true } : {}),
        ...(medida.motivo === "rota_indisponivel" || medida.motivo === "nao_configurado"
          ? { rota_indisponivel: true }
          : {}),
        ...(medida.motivo === "endereco_ambiguo" || medida.motivo === "endereco_nao_encontrado"
          ? { endereco_ambiguo: true }
          : {}),
      };
    }

    rota = { distancia_km: medida.distancia_km, provedor: medida.provedor };
    enderecoParaBanco = {
      logradouro: dados.endereco.logradouro,
      numero: dados.endereco.numero,
      complemento: dados.endereco.complemento ?? null,
      bairro: dados.endereco.bairro,
      cidade: dados.endereco.cidade,
      uf: dados.endereco.uf,
      cep: dados.endereco.cep ?? null,
      referencia: dados.endereco.referencia ?? null,
      latitude: medida.latitude,
      longitude: medida.longitude,
      confianca: medida.confianca,
      provedor: medida.provedor,
      ajustado_no_mapa: false,
    };
  }

  const token = randomBytes(32).toString("hex");
  const supabase = await getSupabaseServerClient();

  // Sem segredo de origem: é o caminho interno, e quem autoriza é a
  // permissão do usuário.
  const { data, error } = await supabase.rpc("criar_pedido", {
    p_pedido: {
      idempotency_key: dados.idempotency_key,
      tracking_token: token,
      origem: dados.origem,
      modalidade: dados.modalidade,
      cliente: dados.cliente,
      endereco: enderecoParaBanco,
      rota,
      itens: dados.itens,
      pagamento: dados.pagamento,
      observacao_geral: dados.observacao_geral ?? null,
    },
    p_segredo: "",
  });

  if (error) {
    logger.error("pedidos:criarPedidoManual", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível lançar o pedido agora. Tente de novo." };
  }

  const resposta = data as Record<string, unknown>;
  if (!resposta?.["ok"]) {
    return { ...(resposta as object), ok: false } as ResultadoPedidoManual;
  }

  revalidatePath(ROTA);
  return {
    ok: true,
    ja_existia: Boolean(resposta["ja_existia"]),
    pedido_id: String(resposta["pedido_id"]),
    numero: Number(resposta["numero"]),
    status: String(resposta["status"]),
    total: Number(resposta["total"]),
    // No reenvio da mesma tentativa o pedido já existe e este token não é o
    // dele: dizer o contrário daria um link que não abre nada.
    token: resposta["ja_existia"] ? null : token,
  };
}
