import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnderecoParaGeocodificar } from "@/infrastructure/rotas";

/**
 * Reuso de endereço já validado.
 *
 * Fase A (D-2026-09-25): coordenada.
 * Fase B (D-2026-09-25-77): distância rodoviária.
 *
 * O QUE ESTE MÓDULO FAZ: pergunta ao banco o que já se sabe sobre este
 * endereço. Coordenada conhecida dispensa a geocodificação; distância
 * conhecida, medida da MESMA origem, dispensa o cálculo de rota. As duas
 * metades são independentes, e cada uma dispensa uma chamada ao HERE.
 *
 * O QUE ELE NÃO FAZ, e é o ponto central do desenho:
 *
 * - **não devolve taxa, e nunca vai devolver.** Não consulta faixa, não
 *   conhece `delivery_fee_bands`, não sabe o preço de nada;
 * - não conhece `cotar_entrega` nem `criar_pedido`, que seguem intocadas e
 *   continuam recalculando o preço pelas faixas vigentes a cada cotação e a
 *   cada pedido (RN-ENT-008).
 *
 * Consequência prática do último ponto: a Shalon altera a tabela de faixas e o
 * mesmo endereço em cache passa a custar diferente no pedido seguinte.
 * Reutilizar distância não congela preço.
 *
 * Toda a autoridade do servidor e do banco continua exatamente onde estava.
 * Um acerto de cache entra no MESMO caminho de uma medição nova, só sem pagar
 * HTTP. Um erro aqui produz miss, e miss é o comportamento de antes.
 *
 * A CHAVE NÃO É CALCULADA AQUI. Este módulo manda os campos crus e o banco
 * normaliza, com a função `chave_de_endereco`. Se a normalização existisse
 * também em TypeScript, qualquer divergência futura entre as duas produziria
 * acerto falso — coordenada de um endereço aplicada a outro, taxa errada.
 * Uma definição só, no SQL.
 */

/**
 * Confiança que pode sair do cache.
 *
 * `ambigua` não está aqui e nunca estará: não havia confiança suficiente para
 * cobrar por distância quando o endereço foi salvo, e o tempo não converte
 * isso em confiança (RN-ENT-003).
 *
 * `ajustada_no_mapa` vem de correção manual e tem precedência sobre o
 * provedor (RN-ENT-005). Nenhum provedor a produz — só uma pessoa.
 */
export type ConfiancaReutilizavel = "exata" | "aproximada" | "ajustada_no_mapa";

/**
 * Distância já medida e ainda reutilizável (Fase B, D-2026-09-25-77).
 *
 * Vem separada da coordenada porque as duas vencem de formas diferentes: a
 * casa não se move, mas a rota até ela muda — e, sobretudo, muda quando a
 * LOJA muda de endereço. O banco só devolve este bloco quando a origem atual
 * da loja é a mesma que produziu a medição.
 *
 * Distância. Nunca taxa. A taxa continua saindo das faixas vigentes em
 * `cotar_entrega` e no recálculo de `criar_pedido`.
 */
export type RotaConhecida = {
  distanciaKm: number;
  /** Provedor que mediu a rota originalmente. */
  provedor: string;
  dias: number;
};

export type EnderecoConhecido =
  | {
      encontrado: true;
      latitude: number;
      longitude: number;
      confianca: ConfiancaReutilizavel;
      /** Provedor que produziu a coordenada originalmente. */
      provedor: string;
      ajustadoNoMapa: boolean;
      /** Idade em dias. Só para diagnóstico — nunca timestamp, nunca endereço. */
      dias: number;
      /** `null` quando não há distância reutilizável: a rota será medida. */
      rota: RotaConhecida | null;
    }
  | { encontrado: false };

const CONFIANCAS_REUTILIZAVEIS: readonly string[] = ["exata", "aproximada", "ajustada_no_mapa"];

function coordenadaValida(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Extrai a distância da resposta, se ela for utilizável.
 *
 * A mesma desconfiança aplicada à coordenada, pelo mesmo motivo: é o número
 * que decide quanto o cliente paga. Qualquer coisa fora do esperado vira
 * `null`, e `null` significa medir a rota de verdade — o comportamento de
 * antes da Fase B.
 */
function rotaReutilizavel(r: Record<string, unknown>): RotaConhecida | null {
  if (r.rota !== true) return null;

  const bruto = r.distancia_km;
  const km = typeof bruto === "string" ? Number(bruto) : bruto;
  // Zero e negativo NUNCA passam. Zero km cairia na faixa mais barata, que é
  // precisamente o frete acidental proibido por CLAUDE.md §20. A constraint
  // do banco já recusa; aqui é a segunda tranca da mesma porta.
  if (typeof km !== "number" || !Number.isFinite(km) || km <= 0) return null;

  const provedor = r.rota_provedor;
  if (typeof provedor !== "string" || provedor.trim() === "") return null;

  const dias =
    typeof r.rota_dias === "number" && Number.isFinite(r.rota_dias)
      ? Math.max(0, r.rota_dias)
      : 0;

  return { distanciaKm: km, provedor, dias };
}

/**
 * Consulta a coordenada já validada para este endereço.
 *
 * Nunca lança: qualquer falha — RPC indisponível, resposta inesperada, campo
 * faltando — devolve `encontrado: false`, que é o caminho normal de hoje.
 * O cache só pode deixar o sistema mais rápido, nunca menos seguro.
 */
export async function consultarEnderecoConhecido(
  supabase: SupabaseClient,
  endereco: EnderecoParaGeocodificar,
  provedorAtual: string,
  segredo: string,
): Promise<EnderecoConhecido> {
  try {
    const { data, error } = await supabase.rpc("endereco_conhecido", {
      p_logradouro: endereco.logradouro,
      p_numero: endereco.numero,
      p_bairro: endereco.bairro,
      p_cidade: endereco.cidade,
      p_uf: endereco.uf,
      p_cep: endereco.cep ?? null,
      p_provedor: provedorAtual,
      p_segredo: segredo,
    });

    if (error || !data || typeof data !== "object") return { encontrado: false };

    const r = data as Record<string, unknown>;
    if (r.ok !== true || r.encontrado !== true) return { encontrado: false };

    // A partir daqui, desconfiança deliberada da própria resposta. A função é
    // nossa e tem as travas certas, mas isto é o que decide dinheiro: uma
    // segunda conferência custa nada e cobre o caso de alguém, no futuro,
    // afrouxar a consulta SQL sem perceber o que ela alimenta.
    const latitude = typeof r.latitude === "string" ? Number(r.latitude) : r.latitude;
    const longitude = typeof r.longitude === "string" ? Number(r.longitude) : r.longitude;
    if (!coordenadaValida(latitude) || !coordenadaValida(longitude)) {
      return { encontrado: false };
    }
    // Coordenada (0,0) é o Golfo da Guiné, não um endereço da Shalon. É o
    // valor que aparece quando algo se perdeu no caminho.
    if (latitude === 0 && longitude === 0) return { encontrado: false };

    const confianca = r.confianca;
    if (typeof confianca !== "string" || !CONFIANCAS_REUTILIZAVEIS.includes(confianca)) {
      return { encontrado: false };
    }

    const dias = typeof r.dias === "number" && Number.isFinite(r.dias) ? Math.max(0, r.dias) : 0;

    return {
      encontrado: true,
      latitude,
      longitude,
      confianca: confianca as ConfiancaReutilizavel,
      provedor: typeof r.provedor === "string" ? r.provedor : "desconhecido",
      ajustadoNoMapa: r.ajustado_no_mapa === true,
      dias,
      rota: rotaReutilizavel(r),
    };
  } catch {
    // Nem exceção de rede nem cliente mal configurado podem derrubar o
    // checkout por causa de uma otimização.
    return { encontrado: false };
  }
}

/**
 * Guarda a distância recém-medida, para o próximo pedido deste endereço.
 *
 * CHAMAR SOMENTE APÓS MEDIÇÃO REAL. Distância vinda do cache não pode passar
 * por aqui: o carimbo de validade se renovaria sozinho e o TTL de 90 dias
 * nunca venceria — o cache envelheceria para sempre sem nunca ser conferido.
 *
 * Chamada depois de `criar_pedido` ter sucesso, porque é ela que cria a linha
 * de endereço. Consequência deliberada: só entrega concluída semeia o cache;
 * cotação abandonada não.
 *
 * A ORIGEM NÃO É ENVIADA. O banco a lê de `store_settings`, para que nem este
 * código possa declarar uma origem que não é a da loja.
 *
 * Nunca lança, e falha em silêncio de propósito: o pedido do cliente já foi
 * criado com sucesso. Não semear o cache é irrelevante perto de devolver erro
 * para um pedido que deu certo.
 */
export async function registrarRotaMedida(
  supabase: SupabaseClient,
  endereco: EnderecoParaGeocodificar,
  distanciaKm: number,
  provedorDaRota: string,
  segredo: string,
): Promise<void> {
  if (!Number.isFinite(distanciaKm) || distanciaKm <= 0) return;
  try {
    await supabase.rpc("registrar_rota_medida", {
      p_logradouro: endereco.logradouro,
      p_numero: endereco.numero,
      p_bairro: endereco.bairro,
      p_cidade: endereco.cidade,
      p_uf: endereco.uf,
      p_cep: endereco.cep ?? null,
      p_distancia_km: distanciaKm,
      p_provedor: provedorDaRota,
      p_segredo: segredo,
    });
  } catch {
    /* ver o comentário acima: o pedido já está criado. */
  }
}
