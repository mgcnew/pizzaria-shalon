/**
 * Faixas de distância e taxa de entrega.
 *
 * 01-DOCUMENTO-MESTRE.md §79.2 · RN-ENT-006 a RN-ENT-014 · D-2026-09-17-02
 *
 * ESCOPO DESTA FASE: apenas a leitura da configuração — dada uma distância,
 * qual faixa se aplica e quais são os dois limites. O provedor de rota
 * (geocodificação e distância real por vias) e a aplicação disso a um pedido
 * são da Fase 5 e NÃO estão aqui.
 *
 * Domínio puro: nenhum fornecedor, nenhuma chamada de rede. A regra comercial
 * não pode ficar acoplada ao Google nem a ninguém (CLAUDE.md §20).
 */

export type FaixaEntrega = {
  id: string;
  distanciaMinKm: number;
  distanciaMaxKm: number;
  taxa: number;
  ativa: boolean;
};

export type SituacaoEntrega =
  /** Dentro do raio de aprovação automática: fluxo normal. */
  | { tipo: "automatica"; faixa: FaixaEntrega }
  /** Fora do raio automático, dentro da distância máxima: exige aprovação. */
  | { tipo: "aprovacao_necessaria"; faixa: FaixaEntrega }
  /** Além da distância máxima atendida: entrega bloqueada. */
  | { tipo: "fora_de_area" };

/**
 * Distância máxima atendida.
 *
 * 02 §3.1: NÃO é um campo de configuração — deriva da maior faixa ativa,
 * justamente para não existirem duas fontes de verdade que possam divergir.
 */
export function distanciaMaximaAtendida(faixas: readonly FaixaEntrega[]): number {
  const ativas = faixas.filter((f) => f.ativa);
  return ativas.reduce((maior, f) => Math.max(maior, f.distanciaMaxKm), 0);
}

/**
 * Faixa que cobre a distância informada.
 *
 * Fronteira `(min, max]`, a mesma da constraint de não sobreposição no banco.
 * A faixa que começa em 0 também cobre a distância 0.
 */
export function faixaParaDistancia(
  faixas: readonly FaixaEntrega[],
  distanciaKm: number,
): FaixaEntrega | null {
  if (!Number.isFinite(distanciaKm) || distanciaKm < 0) return null;

  return (
    faixas.find(
      (f) =>
        f.ativa &&
        ((distanciaKm > f.distanciaMinKm && distanciaKm <= f.distanciaMaxKm) ||
          (distanciaKm === 0 && f.distanciaMinKm === 0)),
    ) ?? null
  );
}

/**
 * Situação da entrega para uma distância.
 *
 * 79.2: dentro do raio automático o pedido segue normalmente; acima dele mas
 * dentro da distância máxima, o cliente vê a taxa e o pedido aguarda
 * aprovação da Shalon; além da máxima, a entrega é bloqueada.
 *
 * Sem faixa que cubra a distância, o resultado é `fora_de_area` — NUNCA taxa
 * zero. "Nunca deixar falha de cálculo produzir taxa R$ 0,00 acidental"
 * (CLAUDE.md §20).
 */
export function situacaoEntrega(
  faixas: readonly FaixaEntrega[],
  distanciaKm: number,
  raioAutomaticoKm: number,
): SituacaoEntrega {
  const faixa = faixaParaDistancia(faixas, distanciaKm);
  if (!faixa) return { tipo: "fora_de_area" };
  if (distanciaKm <= raioAutomaticoKm) return { tipo: "automatica", faixa };
  return { tipo: "aprovacao_necessaria", faixa };
}
