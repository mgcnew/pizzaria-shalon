"use client";

import { useEffect, useState, useTransition } from "react";
import { Recebimento, type FormaParaRecebimento } from "./Recebimento";
import { useAvisarOperacaoEmVoo } from "@/ui/operacaoEmVoo";
import { obterPagamentoDoPedidoNoPdv } from "@/application/pdv/acoes";
import { formatBRL } from "@/lib/format";
import type { PagamentoDoPedido } from "@/application/caixa/tipos";
import type { PedidoAReceber } from "@/application/pdv/tipos";

/**
 * Cobrar sem sair da fila.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §1.3 · CLAUDE.md §34 · D-2026-09-27 (consolidação UX)
 *
 * A INVARIANTE DA ETAPA 10 VALE AQUI INTEIRA:
 *
 *   Realtime pode atualizar, avisar, bloquear visualmente e recarregar estado.
 *   **Nunca autoriza nem decide uma operação financeira.**
 *
 * Esta gaveta é a TERCEIRA tela que movimenta caixa, depois do PDV e da tela
 * do pedido. Ela não traz autoridade nova nenhuma: é o mesmo `Recebimento`,
 * chamando a mesma `registrar_pagamento`, que trava o pedido com `for update`,
 * confere pagamento confirmado e devolve `ja_pago`. Se tudo o que está escrito
 * aqui falhasse, ninguém cobraria duas vezes — só veria uma mensagem pior.
 *
 * POR QUE GAVETA, E NÃO NAVEGAR PARA O PEDIDO: a linha continua visível atrás,
 * a lista não perde posição nem assinatura de Realtime, e o operador vê fila e
 * cobrança ao mesmo tempo. Menos navegação era o objetivo.
 *
 * O PAGAMENTO VEM SOB DEMANDA. Trazê-lo junto da fila seriam N chamadas de
 * `pagamento_do_pedido` para montar uma lista em que se abre UMA.
 */
export function GavetaDeCobranca({
  pedido,
  tentativa,
  formas,
  caixaAberto,
  aoFechar,
  aoConcluir,
}: {
  /**
   * O pedido a cobrar, já na projeção de `pedidos_a_receber()` — a MESMA
   * autoridade que decide quem é cobrável no PDV. `null` mantém a gaveta
   * fechada.
   */
  pedido: PedidoAReceber | null;
  /**
   * Chave de idempotência da tentativa, criada no EVENTO que abriu a gaveta.
   *
   * Nasce lá, e não aqui, por duas razões que apontam para o mesmo lugar:
   * gerar no render seria impuro (`react-hooks/purity`), e uma chave por
   * render deixaria de ser uma chave — o reenvio da mesma tentativa precisa
   * devolver o pagamento que já existe em vez de criar outro (CLAUDE.md §34).
   */
  tentativa: string | null;
  formas: FormaParaRecebimento[];
  caixaAberto: boolean;
  aoFechar: () => void;
  /** Depois que o SERVIDOR confirmou. Fecha e deixa a lista recarregar. */
  aoConcluir: () => void;
}) {
  const [pagamento, setPagamento] = useState<PagamentoDoPedido | null>(null);
  const [carregando, iniciar] = useTransition();

  const pedidoId = pedido?.id ?? null;

  /* Enquanto a cobrança está em voo, o assinante do Realtime adia o refresh:
     trocar as props no meio do envio desmontaria este painel levando junto as
     linhas de divisão já digitadas, na frente do cliente. */
  useAvisarOperacaoEmVoo(carregando);

  /*
   * Sem reset de estado aqui: quem monta passa `key={pedido.id}`, então trocar
   * de pedido monta uma gaveta NOVA e o `pagamento` do anterior morre junto.
   * Zerar estado no corpo do efeito dispararia renders em cascata, e é o que
   * `react-hooks/set-state-in-effect` proíbe — com razão.
   */
  useEffect(() => {
    if (pedidoId === null) return;
    let vigente = true;
    iniciar(async () => {
      const p = await obterPagamentoDoPedidoNoPdv(pedidoId);
      // A resposta de uma abertura anterior não sobrescreve a atual.
      if (vigente) setPagamento(p);
    });
    return () => {
      vigente = false;
    };
  }, [pedidoId]);

  if (pedido === null) return null;

  /**
   * Alguém já recebeu este pedido — em outro terminal, ou no PDV ao lado.
   *
   * Sai do MESMO `pagamento_do_pedido` que o painel já lia: sem consulta nova
   * e sem autoridade nova. Estorno NÃO conta como pago; ele devolve o pedido
   * para a fila, e o operador precisa poder cobrar de novo.
   */
  const jaFoiPago = (pagamento?.realizado ?? []).some((p) => p.status === "confirmed");

  return (
    <>
      {/* O véu fecha ao clique, que é o gesto esperado de gaveta. Não é
          `aria-hidden`: ele é o alvo do clique. */}
      <div
        onClick={aoFechar}
        className="motion-backdrop-in fixed inset-0 z-80 bg-[var(--shalon-scrim-drawer)]"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Receber pedido número ${pedido.numero}`}
        className="motion-drawer-right-in fixed inset-y-0 right-0 z-90 flex w-full max-w-[520px] flex-col overflow-y-auto overscroll-contain border-l border-border-shalon bg-surface"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border-shalon bg-surface px-4 py-3">
          <div className="min-w-0">
            <p className="m-0 font-display text-[19px] font-extrabold text-ink">
              Receber #{pedido.numero}
            </p>
            <p className="m-0 text-[13px] text-muted">
              {pedido.cliente_nome ?? "Cliente não identificado"}
              {" · "}
              {formatBRL(pedido.total)}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="min-h-touch shrink-0 cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[13px] font-semibold text-ink"
          >
            Fechar
          </button>
        </header>

        <div className="flex flex-col gap-3 p-4">
          {/*
           * O CAIXA FECHADO NÃO ESCONDE A GAVETA (§4.4). A recusa é do
           * servidor — `registrar_pagamento` exige sessão aberta e diz
           * `sem_caixa`. A tela só antecipa o que vai acontecer, para o
           * operador não descobrir depois de contar o dinheiro.
           */}
          {!caixaAberto ? (
            <p
              role="status"
              className="m-0 rounded-12 border border-twb bg-tw px-3 py-2 text-[13px] font-semibold text-twf"
            >
              Caixa fechado — abra o caixa no PDV antes de receber.
            </p>
          ) : null}

          {carregando && pagamento === null ? (
            <p className="m-0 text-[13.5px] text-muted">Carregando o pagamento…</p>
          ) : jaFoiPago ? (
            /*
             * PAGO EM OUTRO TERMINAL — Etapa 10, decisão 2.
             *
             * O pedido NÃO some e os dados continuam à vista: sumir sem uma
             * palavra, na frente do cliente, é a pior versão do cenário de dois
             * terminais. O que desaparece é a possibilidade de submeter.
             */
            <div className="rounded-12 border border-tgb bg-tg px-3 py-3">
              <p className="m-0 text-[14px] font-semibold text-tgf">
                Pago em outro terminal.
              </p>
              <p className="m-0 mt-1 text-[13px] text-tgf opacity-90">
                Este pedido já tem pagamento confirmado. Para cobrar de novo, é
                preciso estornar o anterior na tela do pedido.
              </p>
            </div>
          ) : tentativa === null ? null : (
            <Recebimento
              pedidoId={pedido.id}
              total={pedido.total}
              pagamento={pagamento}
              formas={formas}
              caixaAberto={caixaAberto}
              tentativa={tentativa}
              /*
               * A intenção do checkout vira o ponto de partida (§1.3). Casamos
               * pelo NOME porque é o que `pagamento_do_pedido` devolve; sem
               * casar — forma renomeada ou desativada — abre no padrão. Mesmo
               * critério do PDV, de propósito: duas telas abrindo em formas
               * diferentes para o mesmo pedido seria confusão pura.
               */
              formaInicialId={
                formas.find((f) => f.nome === pagamento?.esperado?.metodo)?.id ?? null
              }
              aoConcluir={aoConcluir}
            />
          )}
        </div>
      </aside>
    </>
  );
}
