/**
 * A volta do motoboy na tela Pedidos (D-2026-10-27-174). Domínio puro.
 *
 * Entrega na rua não se conclui uma a uma: "Concluir" e "Falhou" viram
 * "Fulano voltou", que recebe e acerta a saída inteira. O servidor recusa o
 * caminho antigo do mesmo jeito (`finalizar_pedido`).
 */

type Acao = { comando: string; rotulo: string; exige_motivo: boolean; destrutivo: boolean };

/** Comando da tela, não do banco: abre a volta do motoboy. */
export const VOLTOU = "motoboy_voltou";

const DA_VOLTA = new Set(["concluir", "registrar_falha_entrega"]);

export function comAVolta<A extends Acao>(acoes: A[], motoboy: { nome: string } | null): (A | Acao)[] {
  if (motoboy === null) return acoes;
  const posicao = acoes.findIndex((a) => DA_VOLTA.has(a.comando));
  if (posicao < 0) return acoes;
  const resto: (A | Acao)[] = acoes.filter((a) => !DA_VOLTA.has(a.comando));
  resto.splice(posicao, 0, { comando: VOLTOU, rotulo: `${motoboy.nome} voltou`, exige_motivo: false, destrutivo: false });
  return resto;
}

/**
 * O que o motoboy precisa entregar: o dinheiro das entregas que ele fez mais
 * o troco que levou. Só conferência na tela — quem cobra é `conciliar_corrida`.
 */
export function aEntregarNaVolta(
  pedidos: { pedido_id: string; dinheiro_com_ele: number }[],
  naoEntregues: ReadonlySet<string>,
  troco: number,
): number {
  const centavos = pedidos
    .filter((p) => !naoEntregues.has(p.pedido_id))
    .reduce((s, p) => s + Math.round(p.dinheiro_com_ele * 100), 0);
  return (centavos + Math.round(troco * 100)) / 100;
}
