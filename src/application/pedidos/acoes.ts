"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { obterLojaPublica } from "@/application/publico/consultas";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { cotarEntrega } from "@/application/checkout/acoes";
import { montarItem } from "@/application/publico/acoes";
import type { ItemMontado } from "@/application/publico/tipos";
import { logger } from "@/lib/logger";
import {
  COLUNAS,
  montarAlteracao,
  montarComanda,
  renderizarTexto,
  type ItemDaComanda,
  type LinhaComanda,
} from "@/domain/pedidos/comanda";
import { obterPedido } from "./consultas";
import { obterPagamentoDoPedido } from "@/application/caixa/consultas";
import type {
  ClienteNoBalcao,
  ResultadoClienteNoBalcao,
  ResultadoComando,
} from "./tipos";

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
  /** Taxa definida ao aprovar a entrega com taxa a confirmar (0164). */
  taxa: z.number().min(0).max(500).optional(),
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
    p_dados: { motivo: validado.data.motivo ?? null, taxa: validado.data.taxa ?? null },
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
 *
 * `papel` e `modo` vêm da configuração DO APARELHO que vai imprimir
 * (D-2026-10-08-116). Não são dado sensível nem decidem nada de domínio:
 * mudam só a largura em que o texto é quebrado e o que fica anotado como
 * transporte. Mesmo assim passam por validação — vieram do navegador.
 */
const impressaoSchema = z.object({
  papel: z.enum(["58", "80"]),
  modo: z.enum(["tela", "sistema", "serial", "balcao"]),
  // Colunas que cabem na impressora deste aparelho com a letra fixa
  // (`colunasDoAparelho`). Faixa fechada: só muda a quebra das linhas.
  colunas: z.number().int().min(24).max(48).optional(),
});

export async function emitirDocumento(
  pedidoId: string,
  tipo: "comanda" | "alteracao",
  impressao: {
    papel: "58" | "80";
    modo: "tela" | "sistema" | "serial" | "balcao";
    colunas?: number;
  } = {
    papel: "58",
    modo: "tela",
  },
): Promise<DocumentoParaImpressao> {
  if (!z.string().uuid().safeParse(pedidoId).success) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const configuracao = impressaoSchema.safeParse(impressao);
  if (!configuracao.success) {
    return { ok: false, erro: "Configuração de impressora inválida." };
  }
  const { modo } = configuracao.data;
  // Pedindo ao balcão, quem imprime é a 80 mm de lá, não o papel deste
  // aparelho — e as colunas também são as de lá (o balcão ajusta a letra se
  // precisar).
  const papel = modo === "balcao" ? "80" : configuracao.data.papel;
  const largura = modo === "balcao" ? COLUNAS["80"] : (configuracao.data.colunas ?? COLUNAS[papel]);

  const [pedido, loja, pagamento] = await Promise.all([
    obterPedido(pedidoId),
    obterLojaPublica(),
    // Só para saber se já está pago (D-2026-10-01-110). Sem acesso ou com
    // falha, a comanda sai como sempre saiu: dizendo como cobrar.
    tipo === "comanda" ? obterPagamentoDoPedido(pedidoId) : Promise.resolve(null),
  ]);
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
      pago: (pagamento?.realizado ?? []).some((p) => p.status === "confirmed"),
      fiado: Boolean(pedido.fiado),
      // Number(): o PostgREST pode devolver numeric como texto.
      valores: {
        subtotal: Number(pedido.subtotal),
        taxa: Number(pedido.taxa_entrega),
        total: Number(pedido.total),
      },
    }, largura);
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
    }, largura);
  }

  const texto = renderizarTexto(linhas);

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_impressao", {
    p_order_id: pedidoId,
    p_tipo: tipo,
    p_conteudo: texto,
    // `tela`: conferido na tela, sem impressora configurada no aparelho.
    // `sistema-80mm`/`sistema-58mm`: enviado à impressora padrão do sistema
    // operacional pelo navegador (D-2026-10-08-116).
    // `serial-58mm`/`serial-80mm`: Bluetooth direto, ESC/POS (entrega 2).
    // `balcao-80mm`: o aparelho do balcão pega e imprime; vai com as linhas.
    p_transporte:
      modo === "tela" ? "tela" : modo === "balcao" ? "balcao-80mm" : `${modo}-${papel}mm`,
    // Só vai quando é para o balcão: assim os outros modos continuam
    // funcionando mesmo num banco ainda sem a migration 0147.
    ...(modo === "balcao" ? { p_linhas: linhas } : {}),
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
  /**
   * OPCIONAL desde a Etapa 6 do PDV (D-2026-09-26-81) — e só isso.
   *
   * Quem decide se a venda pode existir sem cliente é `criar_pedido`, que só
   * abre mão dele no lançamento interno, com origem `counter` e retirada. Não
   * repito essas condições aqui: seriam uma segunda regra sobre quando um
   * pedido pode ser anônimo, e duas regras divergem no primeiro ajuste
   * (CLAUDE.md §16). O que este schema faz é o que schema faz — validar
   * FORMA. Se o cliente faltar onde é exigido, o servidor responde
   * "Informe seu nome.", que é a mensagem certa vinda da autoridade certa.
   *
   * O que continua valendo: informado, o cliente tem de estar COMPLETO. Nome
   * sem telefone não passa por aqui nem por lá.
   */
  cliente: z
    .object({
      nome: z.string().min(2).max(120),
      whatsapp: z.string().min(8).max(24),
    })
    .optional(),
  endereco: z
    .object({
      /**
       * Endereço salvo escolhido no balcão (RN-MAN-007). Só é repassado a
       * `criar_pedido` depois de conferido aqui contra os endereços do
       * próprio cliente — ver `enderecoSalvoConferido`.
       */
      id: z.string().uuid().nullish(),
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
  /**
   * Taxa de entrega informada à mão, SÓ quando a rota não pôde ser calculada
   * (D-2026-10-16-138). Quem autoriza é o banco
   * (`orders.override_delivery_fee`), e ela fica auditada.
   */
  taxa_manual: z.number().min(0).max(500).nullish(),
  /**
   * Motivo da TROCA de uma taxa que foi calculada (D-2026-10-16-143). Com
   * motivo, a rota é medida normalmente e só a taxa cobrada muda; sem motivo,
   * `taxa_manual` é o caso "não localizado".
   */
  motivo_taxa_manual: z.string().trim().min(3).max(200).nullish(),
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

    // Taxa informada à mão: não há rota, então não há coordenada, distância
    // nem faixa — e nada disso é inventado. O banco confere a permissão.
    if (dados.taxa_manual !== null && dados.taxa_manual !== undefined && !dados.motivo_taxa_manual) {
      enderecoParaBanco = {
        id: dados.endereco.id
          ? await enderecoSalvoConferido(dados.endereco.id, dados.cliente?.whatsapp, dados.endereco)
          : null,
        logradouro: dados.endereco.logradouro,
        numero: dados.endereco.numero,
        complemento: dados.endereco.complemento ?? null,
        bairro: dados.endereco.bairro,
        cidade: dados.endereco.cidade,
        uf: dados.endereco.uf,
        cep: dados.endereco.cep ?? null,
        referencia: dados.endereco.referencia ?? null,
        latitude: null,
        longitude: null,
        confianca: null,
        provedor: null,
        ajustado_no_mapa: false,
      };
    }
  }

  if (dados.modalidade === "delivery" && dados.endereco && enderecoParaBanco === null) {
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
      id: dados.endereco.id
        ? await enderecoSalvoConferido(dados.endereco.id, dados.cliente?.whatsapp, dados.endereco)
        : null,
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
      // Ausente vira objeto vazio, não `null`: é assim que `criar_pedido` lê
      // (`p_pedido -> 'cliente' ->> 'nome'`), e é o que a suíte da Etapa 6
      // exercita.
      cliente: dados.cliente ?? {},
      endereco: enderecoParaBanco,
      rota,
      itens: dados.itens,
      pagamento: dados.pagamento,
      observacao_geral: dados.observacao_geral ?? null,
      taxa_manual: dados.taxa_manual ?? null,
      motivo_taxa_manual: dados.motivo_taxa_manual ?? null,
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

/**
 * O que a tela do balcão precisa saber antes de lançar: se quem está logado
 * pode informar a taxa à mão (só para mostrar a opção — o banco decide), e a
 * cidade/UF da loja, para já virem preenchidas no endereço.
 */
export async function contextoDoBalcao(): Promise<{
  podeInformarTaxa: boolean;
  cidade: string;
  uf: string;
}> {
  const [sessao, loja] = await Promise.all([obterSessaoInterna(), obterLojaPublica()]);
  return {
    podeInformarTaxa: podeNaUI(sessao, "orders.override_delivery_fee"),
    cidade: loja?.endereco_cidade ?? "",
    uf: loja?.endereco_uf ?? "",
  };
}

// ---------------------------------------------------------------------------
// Cliente no balcão (RN-MAN-007)
// ---------------------------------------------------------------------------

async function consultarClienteNoBalcao(whatsapp: string): Promise<ResultadoClienteNoBalcao> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("cliente_para_balcao", { p_whatsapp: whatsapp });
  if (error) {
    logger.error("pedidos:clienteNoBalcao", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível consultar o cliente agora." };
  }
  return data as ResultadoClienteNoBalcao;
}

/**
 * Reconhece o cliente pelo WhatsApp EXATO, para o balcão não redigitar o que
 * já sabe. Quem autoriza é o banco (`orders.create_manual` + `customers.view`);
 * número incompleto não consulta nada — não é busca por pedaço de número.
 */
export async function buscarClienteParaBalcao(whatsapp: unknown): Promise<ResultadoClienteNoBalcao> {
  const digitos = typeof whatsapp === "string" ? whatsapp.replace(/\D/g, "") : "";
  if (digitos.length < 10 || digitos.length > 15) return { ok: true, encontrado: false };
  return consultarClienteNoBalcao(digitos);
}

const configuracaoSchema = z.object({
  produto_id: z.string().uuid(),
  variacao_id: z.string().uuid().nullish(),
  sabores: z.array(z.string().uuid()).max(4).optional(),
  borda_id: z.string().uuid().nullish(),
  adicionais: z.array(z.string().uuid()).max(20).optional(),
  observacao: z.string().max(300).optional(),
  quantidade: z.number().int().min(1).max(99).optional(),
});

/**
 * Remonta configurações já pedidas (último pedido, mais pedidos) pelo motor
 * de HOJE: preço, promoção e disponibilidade atuais, nunca os do histórico.
 * O que não pode mais ser vendido volta com o motivo, para a tela dizer.
 */
export async function remontarItens(configuracoes: unknown): Promise<ItemMontado[]> {
  const validado = z.array(configuracaoSchema).min(1).max(30).safeParse(configuracoes);
  if (!validado.success) return [{ ok: false, erro: "Itens inválidos." }];
  return Promise.all(
    validado.data.map((c) =>
      montarItem({
        produto_id: c.produto_id,
        variacao_id: c.variacao_id ?? null,
        sabores: c.sabores ?? [],
        borda_id: c.borda_id ?? null,
        adicionais: c.adicionais ?? [],
        observacao: c.observacao ?? "",
        quantidade: c.quantidade ?? 1,
      }),
    ),
  );
}

function mesmoTexto(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/**
 * `criar_pedido` usa o `endereco.id` recebido sem inserir linha nova, e não
 * confere de quem ele é. Por isso o id só segue se for de um endereço ativo
 * DESTE cliente e o endereço digitado for exatamente o salvo; qualquer
 * diferença (inclusive complemento) vira endereço novo, pelo fluxo normal.
 */
async function enderecoSalvoConferido(
  id: string,
  whatsapp: string | undefined,
  digitado: { [K in "logradouro" | "numero" | "complemento" | "bairro" | "cidade" | "uf" | "cep" | "referencia"]?: string | null | undefined },
): Promise<string | null> {
  if (!whatsapp) return null;
  const r = await buscarClienteParaBalcao(whatsapp);
  if (!r.ok || !r.encontrado) return null;
  const salvo = (r as ClienteNoBalcao).enderecos.find((e) => e.id === id);
  if (!salvo) return null;
  const campos = ["logradouro", "numero", "complemento", "bairro", "cidade", "uf", "cep", "referencia"] as const;
  return campos.every((c) => mesmoTexto(salvo[c], digitado[c])) ? id : null;
}
