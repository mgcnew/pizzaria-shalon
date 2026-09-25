"use server";

import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import {
  consultaDeEndereco,
  selecionarProvedorDeRotas,
  type Coordenada,
  type EnderecoParaGeocodificar,
} from "@/infrastructure/rotas";
import {
  consultarEnderecoConhecido,
  type ConfiancaReutilizavel,
} from "./cacheDeEndereco";
import { logger } from "@/lib/logger";
import { lerSegredoDeOrigem, tokenDeAcompanhamento, SegredoAusente } from "./segredo";
import type {
  CotacaoEntrega,
  EnderecoInformado,
  PedidoParaEnviar,
  ResultadoEnvio,
} from "./tipos";

/**
 * Operações de checkout.
 *
 * O PRINCÍPIO desta camada, em uma frase: o cliente escolhe, o servidor
 * decide. Nada que chega aqui pelo navegador — preço, taxa, distância,
 * disponibilidade, total — vale como autoridade (CLAUDE.md §16).
 *
 * Em particular, a distância NÃO é aceita da tela nem mesmo depois de a
 * cotação já ter sido exibida: no envio, endereço e rota são recalculados do
 * zero. Uma cotação é um número que o cliente VIU, como o preço do item.
 */

// ---------------------------------------------------------------- validação

const enderecoSchema = z.object({
  id: z.string().uuid().nullish(),
  rotulo: z.string().max(40).nullish(),
  logradouro: z.string().min(2).max(160),
  numero: z.string().min(1).max(20),
  complemento: z.string().max(80).nullish(),
  bairro: z.string().min(2).max(80),
  cidade: z.string().min(2).max(80),
  uf: z.string().length(2),
  cep: z.string().max(12).nullish(),
  referencia: z.string().max(160).nullish(),
});

const itemSchema = z.object({
  linha: z.string().min(1).max(400),
  produto_id: z.string().uuid(),
  variacao_id: z.string().uuid().nullish(),
  sabores: z.array(z.string().uuid()).max(4).optional(),
  borda_id: z.string().uuid().nullish(),
  adicionais: z.array(z.string().uuid()).max(20).optional(),
  observacao: z.string().max(300).optional(),
  quantidade: z.number().int().min(1).max(99),
  preco_unitario_visto: z.number().nonnegative().nullish(),
});

const pedidoSchema = z.object({
  idempotency_key: z.string().uuid(),
  modalidade: z.enum(["delivery", "pickup"]),
  cliente: z.object({
    nome: z.string().min(2).max(120),
    whatsapp: z.string().min(8).max(24),
    consentimento_marketing: z.boolean().optional(),
  }),
  endereco: enderecoSchema.nullish(),
  itens: z.array(itemSchema).min(1).max(60),
  pagamento: z.object({
    forma_id: z.string().uuid(),
    bandeira_id: z.string().uuid().nullish(),
    precisa_troco: z.boolean().optional(),
    troco_para: z.number().nonnegative().nullish(),
  }),
  observacao_geral: z.string().max(500).nullish(),
  dispositivo_token: z.string().min(32).max(128).nullish(),
});

/**
 * Extrai o que pode ir para a geocodificação.
 *
 * RN-ENT-004: complemento e ponto de referência ficam de fora. "Ap 42" e
 * "perto da padaria" não ajudam o provedor a achar a rua — atrapalham. Eles
 * seguem para o pedido, que é onde o entregador precisa deles.
 */
function paraGeocodificar(e: EnderecoInformado): EnderecoParaGeocodificar {
  return {
    logradouro: e.logradouro,
    numero: e.numero,
    bairro: e.bairro,
    cidade: e.cidade,
    uf: e.uf,
    cep: e.cep ?? undefined,
  };
}

/**
 * Localiza o endereço e mede a rota a partir da loja.
 *
 * Devolve sempre coordenada + distância juntas, porque uma sem a outra não
 * serve para nada aqui.
 */
async function localizarEMedir(endereco: EnderecoInformado): Promise<CotacaoEntrega> {
  const segredo = lerSegredoDeOrigem();
  const supabase = await getSupabaseServerClient();
  const provedor = selecionarProvedorDeRotas();

  // RN-ENT-007: a origem vem da configuração da loja. Nunca hardcoded.
  const { data: origemBruta, error: erroOrigem } = await supabase.rpc("origem_da_loja", {
    p_segredo: segredo,
  });

  const origem = origemBruta as
    | { ok: true; latitude: number; longitude: number }
    | { ok: false; erro: string }
    | null;

  if (erroOrigem || !origem?.ok) {
    logger.error("checkout:origem", { erro: origem?.ok === false ? origem.erro : "rpc" });
    return {
      ok: false,
      motivo: "nao_configurado",
      erro: "Não conseguimos calcular a entrega agora. Você pode escolher retirada.",
    };
  }

  const paraBuscar = paraGeocodificar(endereco);

  // CACHE DE COORDENADA (Fase A, D-2026-09-25). Endereço já validado dispensa
  // a geocodificação — não a rota, que continua sendo medida de verdade.
  //
  // Miss é o caminho normal, não exceção: se o cache não responder, não
  // souber ou desconfiar da própria resposta, o provedor é chamado como
  // sempre. A otimização não tem como tornar o cálculo menos seguro.
  const conhecido = await consultarEnderecoConhecido(
    supabase,
    paraBuscar,
    provedor.nome,
    segredo,
  );

  let coordenada: Coordenada;
  let confianca: ConfiancaReutilizavel;
  let enderecoFormatado: string;

  if (conhecido.encontrado) {
    // 03 §31: nem endereço, nem CEP, nem coordenada, nem a chave normalizada
    // (que É o endereço em outra forma). Só o que serve para diagnosticar.
    logger.info("checkout:geocode", {
      cache: "hit",
      confianca: conhecido.confianca,
      provedor_original: conhecido.provedor,
      ajustado_no_mapa: conhecido.ajustadoNoMapa,
      dias: conhecido.dias,
    });
    coordenada = { latitude: conhecido.latitude, longitude: conhecido.longitude };
    confianca = conhecido.confianca;
    // Não há resposta de provedor para formatar. O endereço digitado, montado
    // pela mesma função que monta a consulta, é o mais honesto disponível.
    enderecoFormatado = consultaDeEndereco(paraBuscar);
  } else {
    logger.info("checkout:geocode", { cache: "miss" });
    const geo = await provedor.geocodificar(paraBuscar);
    if (!geo.ok) {
      // RN-ENT-003: sem localização confiável, não se inventa coordenada.
      return {
        ok: false,
        motivo:
          geo.motivo === "nao_encontrado"
            ? "endereco_nao_encontrado"
            : geo.motivo === "ambiguo"
              ? "endereco_ambiguo"
              : "nao_configurado",
        erro: geo.mensagem,
      };
    }
    coordenada = geo.coordenada;
    confianca = geo.confianca;
    enderecoFormatado = geo.enderecoFormatado;
  }

  const rota = await provedor.rota(
    { latitude: origem.latitude, longitude: origem.longitude },
    coordenada,
  );
  if (!rota.ok) {
    return {
      ok: false,
      motivo: rota.motivo === "configuracao" ? "nao_configurado" : "rota_indisponivel",
      erro: rota.mensagem,
    };
  }

  // A taxa sai da MESMA faixa que `criar_pedido` vai usar (uma fórmula só).
  const { data: cotacaoBruta, error: erroCotacao } = await supabase.rpc("cotar_entrega", {
    p_km: rota.distanciaKm,
    p_segredo: segredo,
  });

  const cotacao = cotacaoBruta as
    | {
        ok: true;
        taxa: number;
        exige_aprovacao: boolean;
        pedido_minimo_ativo: boolean;
        pedido_minimo_valor: number | null;
      }
    | { ok: false; fora_de_area?: boolean; distancia_maxima_km: number | null }
    | null;

  if (erroCotacao || !cotacao) {
    logger.error("checkout:cotar", { code: (erroCotacao as { code?: string } | null)?.code });
    return {
      ok: false,
      motivo: "nao_configurado",
      erro: "Não conseguimos calcular a taxa agora. Tente de novo em instantes.",
    };
  }

  if (!cotacao.ok) {
    // CLAUDE.md §20: sem faixa é fora de área — nunca R$ 0,00 por omissão.
    return {
      ok: false,
      motivo: "fora_de_area",
      erro: "Esse endereço está fora da nossa área de entrega. Você pode escolher retirada.",
      distancia_km: rota.distanciaKm,
      distancia_maxima_km: cotacao.distancia_maxima_km,
    };
  }

  return {
    ok: true,
    distancia_km: rota.distanciaKm,
    taxa: cotacao.taxa,
    exige_aprovacao: cotacao.exige_aprovacao,
    pedido_minimo_ativo: cotacao.pedido_minimo_ativo,
    pedido_minimo_valor: cotacao.pedido_minimo_valor,
    endereco_formatado: enderecoFormatado,
    latitude: coordenada.latitude,
    longitude: coordenada.longitude,
    confianca,
    provedor: rota.provedor,
  };
}

/** Cotação mostrada na tela antes do envio. Informativa, não autoridade. */
export async function cotarEntrega(endereco: unknown): Promise<CotacaoEntrega> {
  const validado = enderecoSchema.safeParse(endereco);
  if (!validado.success) {
    return {
      ok: false,
      motivo: "endereco_nao_encontrado",
      erro: "Confira os dados do endereço.",
    };
  }

  try {
    return await localizarEMedir(validado.data);
  } catch (erro) {
    if (erro instanceof SegredoAusente) {
      logger.error("checkout:segredo_ausente", {});
      return {
        ok: false,
        motivo: "nao_configurado",
        erro: "A entrega está indisponível no momento. Você pode escolher retirada.",
      };
    }
    logger.error("checkout:cotarEntrega", {});
    return {
      ok: false,
      motivo: "rota_indisponivel",
      erro: "Não conseguimos calcular a entrega agora. Tente de novo em instantes.",
    };
  }
}

/**
 * Cria o pedido.
 *
 * Esta função não soma, não desconta e não decide taxa: ela reúne ESCOLHAS,
 * mede a rota e entrega tudo a `criar_pedido`, que recalcula do zero dentro
 * de uma única transação (CLAUDE.md §34).
 */
export async function enviarPedido(pedido: unknown): Promise<ResultadoEnvio> {
  const validado = pedidoSchema.safeParse(pedido);
  if (!validado.success) {
    return { ok: false, erro: "Confira os dados do pedido antes de enviar." };
  }
  const dados: PedidoParaEnviar = validado.data;

  let segredo: string;
  let token: string;
  try {
    segredo = lerSegredoDeOrigem();
    token = tokenDeAcompanhamento(dados.idempotency_key);
  } catch {
    logger.error("checkout:segredo_ausente", {});
    return { ok: false, erro: "Não estamos conseguindo receber pedidos agora." };
  }

  let rota: { distancia_km: number; provedor: string } | null = null;
  let enderecoParaBanco: Record<string, unknown> | null = null;

  if (dados.modalidade === "delivery") {
    if (!dados.endereco) {
      return { ok: false, erro: "Informe o endereço de entrega." };
    }

    // Recalcula endereço e rota AGORA. O que a tela mostrou na cotação não
    // volta como verdade — nem a coordenada, nem a distância.
    const medida = await localizarEMedir(dados.endereco);
    if (!medida.ok) {
      return {
        ok: false,
        erro: medida.erro,
        ...(medida.motivo === "fora_de_area" ? { fora_de_area: true } : {}),
        ...(medida.motivo === "endereco_ambiguo" || medida.motivo === "endereco_nao_encontrado"
          ? { endereco_ambiguo: true }
          : {}),
        ...(medida.motivo === "rota_indisponivel" ? { rota_indisponivel: true } : {}),
      };
    }

    rota = { distancia_km: medida.distancia_km, provedor: medida.provedor };
    enderecoParaBanco = {
      id: dados.endereco.id ?? null,
      rotulo: dados.endereco.rotulo ?? null,
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

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("criar_pedido", {
    p_pedido: {
      idempotency_key: dados.idempotency_key,
      tracking_token: token,
      origem: "shalon_link",
      modalidade: dados.modalidade,
      cliente: dados.cliente,
      endereco: enderecoParaBanco,
      rota,
      itens: dados.itens,
      pagamento: dados.pagamento,
      observacao_geral: dados.observacao_geral ?? null,
      dispositivo_token: dados.dispositivo_token ?? null,
    },
    p_segredo: segredo,
  });

  if (error) {
    logger.error("checkout:criarPedido", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não conseguimos enviar seu pedido agora. Tente de novo." };
  }

  const resposta = data as Record<string, unknown>;
  if (!resposta?.["ok"]) {
    return { ...(resposta as object), ok: false } as ResultadoEnvio;
  }

  return {
    ok: true,
    ja_existia: Boolean(resposta["ja_existia"]),
    numero: Number(resposta["numero"]),
    status: String(resposta["status"]),
    total: Number(resposta["total"]),
    // O token vai UMA vez para o navegador. O banco guarda só o hash.
    token,
  };
}

/**
 * Resumo dos pedidos feitos NESTE navegador.
 *
 * Recebe os tokens que o próprio dispositivo guardou e devolve só o que cabe
 * numa lista. Não existe consulta por WhatsApp, por nome ou por número do
 * pedido: sem o token, não há resposta (CLAUDE.md §29).
 *
 * Token inválido some da lista em silêncio — pode ser um pedido apagado ou
 * um valor adulterado no armazenamento local; nos dois casos, nada a dizer.
 */
export async function resumoDosPedidos(
  tokens: unknown,
): Promise<{ token: string; numero: number; status: string; total: number; criado_em: string }[]> {
  const validados = z
    .array(z.string().regex(/^[0-9a-f]{64}$/))
    .max(20)
    .safeParse(tokens);
  if (!validados.success) return [];

  const supabase = await getSupabaseServerClient();

  const resultados = await Promise.all(
    validados.data.map(async (token) => {
      const { data, error } = await supabase.rpc("pedido_por_token", { p_token: token });
      if (error) return null;
      const pedido = data as
        | { ok: true; numero: number; status: string; total: number; criado_em: string }
        | { ok: false };
      if (!pedido?.ok) return null;
      return {
        token,
        numero: pedido.numero,
        status: pedido.status,
        total: pedido.total,
        criado_em: pedido.criado_em,
      };
    }),
  );

  return resultados.filter((p) => p !== null);
}

/**
 * O cliente decide a alteração proposta pela pizzaria (RN-ALT-004).
 *
 * Quem decide é ele, aqui — não uma resposta no WhatsApp. Recusar NÃO
 * cancela o pedido (RN-ALT-006): devolve o pedido ao estado anterior e a
 * pizzaria resolve o que fazer.
 */
export async function decidirAlteracao(
  token: unknown,
  aceita: boolean,
): Promise<{ ok: boolean; erro?: string }> {
  const validado = z.string().regex(/^[0-9a-f]{64}$/).safeParse(token);
  if (!validado.success) return { ok: false, erro: "Link inválido." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("decidir_alteracao", {
    p_token: validado.data,
    p_aceita: aceita,
  });

  if (error) {
    logger.error("checkout:decidirAlteracao", { code: (error as { code?: string }).code });
    return { ok: false, erro: "Não foi possível registrar sua resposta agora." };
  }
  return data as { ok: boolean; erro?: string };
}
