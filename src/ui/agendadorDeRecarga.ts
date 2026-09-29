/**
 * Agendador de recarga por evento de Realtime — lógica pura, sem React.
 *
 * Decide QUANDO recarregar a tela, nunca o quê. Três regras:
 *
 * 1. **Agrupa a rajada.** Um pedido que nasce e muda de status em segundos gera
 *    vários eventos, e cada recarga reexecuta todas as consultas da página. O
 *    primeiro evento abre uma janela, e os que chegam dentro dela vão na mesma
 *    recarga. A janela conta a partir do PRIMEIRO evento, não do último: numa
 *    noite cheia, com eventos a cada meio segundo, uma janela que reiniciasse a
 *    cada evento nunca chegaria a recarregar.
 *
 * 2. **Espera o dinheiro.** Com operação financeira em voo, trocar as props no
 *    meio do envio desmonta o painel e leva o que foi digitado. A recarga fica
 *    pendente e sai quando a última operação termina.
 *
 * 3. **Pausa com a aba oculta.** Recarga em aba de fundo é consulta gasta para
 *    ninguém ver. Fica pendente e sai quando a aba volta.
 *
 * Nada aqui é autoridade: a garantia contra cobrança dupla está no banco.
 */
export type AgendadorDeRecarga = {
  /** Um evento chegou. */
  agendar: () => void;
  /** Quantas operações financeiras estão em voo agora. */
  aoMudarOperacoes: (quantas: number) => void;
  /** A aba ficou visível de novo. */
  aoVoltarAba: () => void;
  /** Desmontagem: cancela a janela aberta. */
  descartar: () => void;
};

export function criarAgendadorDeRecarga({
  janelaMs,
  recarregar,
  abaVisivel,
  relogio = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id) },
}: {
  janelaMs: number;
  recarregar: () => void;
  abaVisivel: () => boolean;
  relogio?: {
    setTimeout: (f: () => void, ms: number) => ReturnType<typeof setTimeout>;
    clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
  };
}): AgendadorDeRecarga {
  let emVoo = 0;
  let pendente = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Recarrega se puder; senão deixa marcado. */
  const tentarAgora = () => {
    if (!pendente) return;
    if (emVoo > 0) return;
    if (!abaVisivel()) return;
    pendente = false;
    recarregar();
  };

  return {
    agendar() {
      pendente = true;
      if (timer !== null) return;
      timer = relogio.setTimeout(() => {
        timer = null;
        tentarAgora();
      }, janelaMs);
    },
    aoMudarOperacoes(quantas) {
      emVoo = quantas;
      // Terminou a última: aplica agora o que ficou esperando.
      if (quantas === 0) tentarAgora();
    },
    aoVoltarAba() {
      tentarAgora();
    },
    descartar() {
      if (timer !== null) relogio.clearTimeout(timer);
      timer = null;
    },
  };
}
