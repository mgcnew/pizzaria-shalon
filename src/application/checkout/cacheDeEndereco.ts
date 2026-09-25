import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnderecoParaGeocodificar } from "@/infrastructure/rotas";

/**
 * Reuso de coordenada já validada — Fase A do cache (D-2026-09-25).
 *
 * O QUE ESTE MÓDULO FAZ: pergunta ao banco se este endereço já foi
 * geocodificado com confiança suficiente. Se sim, a chamada de geocodificação
 * ao HERE é dispensada. Se não, nada muda: o provedor é chamado como sempre.
 *
 * O QUE ELE NÃO FAZ, e é o ponto central do desenho:
 *
 * - não devolve distância — a rota continua sendo medida de verdade;
 * - não devolve taxa, nem consulta faixa;
 * - não conhece `cotar_entrega` nem `criar_pedido`, que seguem intocadas.
 *
 * Consequência: toda a autoridade do servidor e do banco continua exatamente
 * onde estava. Um acerto de cache entra no MESMO caminho de uma medição nova,
 * só sem pagar HTTP. Um erro aqui produz miss, e miss é o comportamento de
 * hoje.
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
    }
  | { encontrado: false };

const CONFIANCAS_REUTILIZAVEIS: readonly string[] = ["exata", "aproximada", "ajustada_no_mapa"];

function coordenadaValida(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
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
    };
  } catch {
    // Nem exceção de rede nem cliente mal configurado podem derrubar o
    // checkout por causa de uma otimização.
    return { encontrado: false };
  }
}
