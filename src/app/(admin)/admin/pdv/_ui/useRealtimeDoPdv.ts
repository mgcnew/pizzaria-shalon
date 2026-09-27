"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseRealtimeClient } from "@/infrastructure/supabase/client";

/**
 * O PDV ACORDANDO SOZINHO — Fase 12, Etapa 10.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §9 · CLAUDE.md §40 · D-2026-09-27-83
 *
 * A INVARIANTE DESTA ETAPA, e ela vale para o arquivo inteiro:
 *
 *   Realtime pode atualizar, avisar, bloquear visualmente e recarregar
 *   estado. **Nunca autoriza nem decide uma operação financeira.**
 *
 * Mesmo que o evento de "outro terminal pagou #123" ainda não tenha chegado, o
 * operador pode apertar Ctrl+Enter — e continua seguro, porque
 * `registrar_pagamento` trava o pedido com `for update`, confere se há
 * pagamento confirmado e devolve `ja_pago`. O que este hook faz é conforto de
 * interface; se ele falhar, nada de errado acontece com o dinheiro, só a tela
 * fica velha.
 *
 * O MESMO PADRÃO DA CENTRAL DE PEDIDOS, deliberadamente: o evento é só
 * GATILHO. A carga útil traz a linha crua — incluindo telefone de cliente — e
 * não é lida. Quem informa é o servidor, relendo `pedidos_a_receber()` e
 * `caixa_atual()` sob RLS.
 *
 * TRÊS TABELAS, E O PORQUÊ DE CADA UMA:
 *
 *  - `orders`   — pedido criado, pago, estornado, cancelado, status. Já estava
 *                 publicada desde a Fase 5 (migration 0053);
 *  - `cash_sessions`  — abertura e fechamento mudam o que a tela PERMITE;
 *  - `cash_movements` — suprimento, sangria, estorno de movimento e acerto de
 *                 motoboy mudam o esperado SEM passar por `orders`.
 *
 * `payments` fica fora: todo pagamento e estorno normais escrevem `orders`
 * junto, e as duas exceções que não escrevem (`conciliar_corrida`,
 * `transferir_entrega`) aparecem por `cash_movements`.
 *
 * UM CANAL POR TABELA, e isto é lição de defeito medido.
 *
 * Na primeira versão as três tabelas entravam como três `on()` no MESMO
 * canal. Resultado no DEV: com `cash_sessions` e `cash_movements` ainda fora
 * da publicação, o Realtime descartou a assinatura INTEIRA do canal —
 * `realtime.subscription` ficou vazia, nenhum evento de `orders` chegou, e o
 * canal continuou reportando `SUBSCRIBED`. Uma tabela ausente derrubava as
 * três, em silêncio.
 *
 * Separando, a falha deixa de ser total: se um dia alguém tirar uma tabela da
 * publicação, só a parte dela para. Não são assinaturas duplicadas — são
 * assuntos diferentes, com tópicos diferentes.
 */

/** Janela de agrupamento. Curta o bastante para o balcão não perceber. */
const AGRUPAR_MS = 500;

/** Uma tabela, um canal. Ver o comentário do cabeçalho. */
const TABELAS = ["orders", "cash_sessions", "cash_movements"] as const;

export type EstadoDoRealtime = "conectando" | "ativo" | "reconectando";

export type RealtimeDoPdv = {
  estado: EstadoDoRealtime;
  /**
   * Entregue ao `ProvedorDeOperacaoEmVoo`. Sai pelo retorno e não por um
   * objeto de módulo: estado de componente em singleton de módulo passa a
   * existir uma vez só para a aplicação inteira, e volta a morder no dia em
   * que alguém montar dois PDVs na mesma árvore.
   */
  aoMudarOperacoes: (quantas: number) => void;
};

export function useRealtimeDoPdv(): RealtimeDoPdv {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoDoRealtime>("conectando");

  /** Quantas operações financeiras estão em voo. Zero libera o refresh. */
  const emVoo = useRef(0);
  /** Houve evento que ainda não virou refresh. */
  const pendente = useRef(false);
  const timer = useRef<number | null>(null);

  /**
   * Executa o refresh se puder; senão deixa marcado.
   *
   * Duas razões para adiar, e as duas são do operador, não do sistema:
   * uma operação em voo (trocar as props no meio do envio desmonta painel e
   * leva o que foi digitado) e a aba oculta (refresh em aba de fundo é sete
   * consultas gastas para ninguém ver).
   */
  const tentarAgora = useCallback(() => {
    if (!pendente.current) return;
    if (emVoo.current > 0) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    pendente.current = false;
    router.refresh();
  }, [router]);

  /**
   * Agrupa a rajada. Um pedido público que nasce e muda de status em segundos
   * gera vários eventos; o PDV recarrega SETE consultas por vez. Sem janela,
   * cada evento pagaria esse preço — e o eco da própria ação (a action já faz
   * `revalidatePath`) pagaria de novo.
   */
  const agendar = useCallback(() => {
    pendente.current = true;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      tentarAgora();
    }, AGRUPAR_MS);
  }, [tentarAgora]);

  /** Chamado pelo provedor quando alguém começa ou termina de escrever dinheiro. */
  const aoMudarOperacoes = useCallback(
    (quantas: number) => {
      emVoo.current = quantas;
      // Terminou a última: aplica agora o que ficou esperando.
      if (quantas === 0) tentarAgora();
    },
    [tentarAgora],
  );

  useEffect(() => {
    let vivo = true;
    const canais: RealtimeChannel[] = [];
    let cliente: SupabaseClient | null = null;
    const ligados = new Set<string>();

    /*
     * `await` ANTES DE ENTRAR NO CANAL. É o que garante que a assinatura
     * nasça como `authenticated`: quem entra antes do token registra `anon` e
     * não recebe mais nada, para sempre (ver `client.ts`).
     */
    void getSupabaseRealtimeClient().then((supabase) => {
      if (!vivo) return;
      cliente = supabase;

      for (const table of TABELAS) {
        /*
         * NOME PRÓPRIO POR TÓPICO. `central-pedidos` já existe em
         * /admin/pedidos, e dois canais com o mesmo tópico no mesmo cliente
         * colidem — o segundo `subscribe` não vinga. O cliente é singleton
         * por design.
         */
        const canal = supabase
          .channel(`pdv-${table}`)
          .on("postgres_changes", { event: "*", schema: "public", table }, agendar)
          .subscribe((situacao) => {
            if (!vivo) return;
            if (situacao === "SUBSCRIBED") ligados.add(table);
            else ligados.delete(table);
            // A tela só diz "ativo" com TODAS ligadas. Meia conexão é fila
            // velha em metade da tela, e pior: sem ninguém avisar.
            setEstado(ligados.size === TABELAS.length ? "ativo" : "reconectando");
          });
        canais.push(canal);
      }
    });

    /*
     * A ABA VOLTOU. Enquanto escondida o refresh fica represado, e o navegador
     * pode até ter dormido a conexão: ao voltar, aplica o que ficou. Se nada
     * ficou, `tentarAgora` não faz nada — é `pendente` que manda.
     */
    const aoVoltar = () => {
      if (document.visibilityState === "visible") tentarAgora();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      // Sem isto, navegar e voltar deixa canal órfão acumulando no singleton —
      // e com `reactStrictMode` o efeito monta duas vezes já no primeiro load.
      vivo = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", aoVoltar);
      for (const canal of canais) void cliente?.removeChannel(canal);
    };
  }, [agendar, tentarAgora]);

  return { estado, aoMudarOperacoes };
}
