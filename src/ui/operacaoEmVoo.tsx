"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";

/**
 * QUEM ESTÁ ESCREVENDO DINHEIRO AGORA — Fase 12, Etapa 10.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §9 · CLAUDE.md §34, §40
 *
 * O PROBLEMA. Com Realtime, o PDV recarrega sozinho. Um `router.refresh()` que
 * chega no meio de um `registrar_pagamento` em voo troca as props do servidor
 * enquanto a pessoa espera a resposta — e se o pedido sair da fila nesse
 * instante, o painel desmonta levando as linhas digitadas junto. O operador
 * veria a tela se desfazer sem saber se cobrou ou não.
 *
 * A SOLUÇÃO. Quem submete dinheiro avisa que está em voo. O assinante do
 * Realtime marca o refresh como PENDENTE e o executa assim que a operação
 * terminar. Nada se perde e nada fica velho por muito tempo.
 *
 * O QUE ISTO NÃO É. Não é lock, não é autorização e não atrasa nem impede
 * operação nenhuma — nem a minha, nem a do outro terminal. É só a interface
 * escolhendo a hora de se atualizar. A garantia contra cobrança dupla continua
 * inteira no banco (`for update` + recusa com `ja_pago`), e continuaria valendo
 * se este arquivo não existisse.
 *
 * SEM PROVEDOR, VIRA NADA. `Recebimento` também vive em `/admin/pedidos`, onde
 * não há assinante para avisar: lá o contexto é nulo e o hook não faz coisa
 * alguma. `PainelDoCaixa` hoje só existe dentro do PDV — mas o no-op continua
 * sendo a garantia de que montá-lo em outra tela não quebra nada.
 */

type Registro = {
  /** +1 ao entrar em voo, −1 ao sair. Vários painéis podem submeter. */
  mudar: (delta: 1 | -1) => void;
};

const Contexto = createContext<Registro | null>(null);

export function ProvedorDeOperacaoEmVoo({
  aoMudar,
  children,
}: {
  /** Recebe quantas operações estão em voo agora. */
  aoMudar: (emVoo: number) => void;
  children: React.ReactNode;
}) {
  const quantas = useRef(0);

  const mudar = useCallback(
    (delta: 1 | -1) => {
      // `Math.max(0, …)` porque desmontar no meio de um envio chamaria o −1
      // sem o +1 correspondente, e um contador negativo travaria o refresh
      // para sempre — um freio que nunca solta é pior do que freio nenhum.
      quantas.current = Math.max(0, quantas.current + delta);
      aoMudar(quantas.current);
    },
    [aoMudar],
  );

  return <Contexto.Provider value={{ mudar }}>{children}</Contexto.Provider>;
}

/**
 * Avisa enquanto `emVoo` for verdadeiro. Chamar com o próprio `isPending` do
 * `useTransition` que já envolve a operação — sem estado novo para manter.
 */
export function useAvisarOperacaoEmVoo(emVoo: boolean): void {
  const registro = useContext(Contexto);

  useEffect(() => {
    if (registro === null || !emVoo) return;
    registro.mudar(1);
    return () => registro.mudar(-1);
  }, [registro, emVoo]);
}
