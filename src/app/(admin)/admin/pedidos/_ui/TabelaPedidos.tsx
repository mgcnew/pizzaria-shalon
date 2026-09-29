"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/ui/components";
import { IndicadorDeNavegacao } from "@/ui/components/IndicadorDeNavegacao";
import { formatBRL, formatarEspera, minutosDesde } from "@/lib/format";
import { rotuloDeModalidade, rotuloDeOrigem, rotuloInterno } from "@/domain/pedidos/estados";
import type { PedidoNaFila } from "@/application/pedidos/tipos";
import type { PedidoAReceber } from "@/application/pdv/tipos";
import { AcoesDoPedido } from "./AcoesDoPedido";
import { InfoProducaoPedido } from "./InfoProducaoPedido";
import { ESTILO_RECEBER } from "./estiloDasAcoes";

/**
 * A fila em tabela — desktop.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md · CLAUDE.md §38, §39
 *
 * POR QUE TABELA, E NÃO CARTÃO MAIOR. Cartão é bom para ler UM pedido; tabela
 * é boa para COMPARAR muitos. No balcão a pergunta quase nunca é "como está o
 * #33886" — é "quem está esperando mais" e "qual falta cobrar". Essas duas se
 * respondem varrendo uma coluna de cima a baixo, que é exatamente o que a
 * grade de cartões impedia: cada valor em uma posição diferente da tela.
 *
 * Por isso `tabular-nums` e alinhamento à direita em Espera e Total. Com
 * algarismos de largura fixa a vírgula fica na mesma coluna e a comparação
 * vira visual, sem leitura.
 *
 * A ESPERA É A PRIMEIRA COLUNA, e isso é uma correção de defeito, não estética.
 * O cartão mostrava a hora do relógio (`20:41`) sem a data — e `#33628 · 20:41`
 * parecia o mais tardio do dia quando era o mais antigo da fila, esperando há
 * 38 horas. Hora do relógio não responde "quem espera mais"; tempo decorrido
 * responde. O PDV já fazia certo, e é a mesma `formatarEspera` nos dois.
 *
 * O RELÓGIO: o valor inicial vem do SERVIDOR (`espera`), e é ele que o primeiro
 * render usa — o navegador calcularia alguns segundos diferente e produziria
 * divergência de hidratação. Depois, um tique de 30 s recalcula a partir de
 * `criado_em`, que é um instante do servidor. O navegador só mede quanto tempo
 * passou, nunca decide que horas são.
 *
 * NADA AQUI AUTORIZA NADA. As ações vêm prontas de `acoes_do_pedido`, já
 * filtradas por permissão e por estado no banco; esta tabela só as desenha
 * (CLAUDE.md §12, §21).
 */

/** De quanto em quanto tempo a coluna Espera se atualiza sozinha. */
const TIQUE_MS = 30_000;

export type ModoDaTabela = "aberto" | "encerrado";

export function TabelaPedidos({
  pedidos,
  hora,
  espera,
  modo,
  rotulo,
  cobraveis,
  podeReceber,
  aoCobrar,
  consultaDaAba,
}: {
  pedidos: PedidoNaFila[];
  /** Hora de criação já formatada no fuso da loja, por id. */
  hora: Record<string, string>;
  /** Espera calculada no servidor, por id. Âncora do primeiro render. */
  espera: Record<string, string>;
  modo: ModoDaTabela;
  /** Descreve a tabela para quem usa leitor de tela. */
  rotulo: string;
  /**
   * Quem ainda deve, por id — vindo de `pedidos_a_receber()`, a MESMA
   * autoridade que monta a fila de cobrança do PDV. A tabela não decide quem é
   * cobrável: ela só desenha o que aquela função já respondeu, com o mesmo
   * `payments.register` e o mesmo critério.
   */
  cobraveis?: Record<string, PedidoAReceber>;
  podeReceber?: boolean;
  aoCobrar?: (pedido: PedidoAReceber) => void;
  /**
   * O começo da query dos links de modal ("aba=encerrados&dias=7&"), para que
   * abrir e fechar um pedido não descarte os dias já carregados. Omitido, vale
   * o padrão da aba.
   */
  consultaDaAba?: string;
}) {
  /*
   * `null` até o primeiro tique: enquanto for nulo, vale o texto do servidor.
   * O estado nasce nulo e só muda DENTRO do intervalo — nunca no corpo do
   * efeito, que é o que `react-hooks/set-state-in-effect` proíbe.
   */
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), TIQUE_MS);
    return () => clearInterval(t);
  }, []);

  const aberto = modo === "aberto";
  const consulta = consultaDaAba ?? (aberto ? "" : "aba=encerrados&");

  return (
    /* A tabela rola DENTRO de si. Sem isto, uma observação longa faria a
       página inteira rolar na horizontal e levaria a barra lateral junto. */
    <div className="hidden overflow-x-auto rounded-16 border border-border-shalon bg-surface shadow-[0_4px_16px_rgb(41_37_36/0.035)] lg:block">
      <table className="w-full min-w-[960px] border-collapse text-[13.5px]">
        <caption className="sr-only">{rotulo}</caption>
        <thead>
          <tr className="border-b border-border-shalon bg-bg/60 text-left text-[11px] uppercase tracking-[0.05em] text-muted">
            <th scope="col" className="px-4 py-2.5 text-right font-bold">
              {aberto ? "Espera" : "Quando"}
            </th>
            <th scope="col" className="px-3 py-2.5 font-bold">Pedido</th>
            <th scope="col" className="px-3 py-2.5 font-bold">Cliente</th>
            <th scope="col" className="px-3 py-2.5 font-bold">Canal</th>
            <th scope="col" className="px-3 py-2.5 text-center font-bold">Comanda</th>
            <th scope="col" className="px-3 py-2.5 text-right font-bold">Total</th>
            <th scope="col" className="px-3 py-2.5 font-bold">Pagamento</th>
            <th scope="col" className="px-3 py-2.5 font-bold">Situação</th>
            <th scope="col" className="px-4 py-2.5 text-right font-bold">Ações</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => {
            const estado = rotuloInterno(p.status);
            const travas = [
              p.aguarda_pix ? "Pix não confirmado" : null,
              p.aguarda_aprovacao_entrega ? "Entrega não aprovada" : null,
              p.aguarda_cliente ? "Alteração aguardando o cliente" : null,
            ].filter((t): t is string => t !== null);

            const cobravel = cobraveis?.[p.id] ?? null;

            const esperaAgora =
              agora === null
                ? (espera[p.id] ?? "")
                : formatarEspera(minutosDesde(p.criado_em, agora));

            return (
              <tr
                key={p.id}
                className="border-b border-border-shalon align-middle transition-colors last:border-b-0 hover:bg-elev"
              >
                <td className="px-4 py-3 text-right">
                  {aberto ? (
                    <>
                      <span className="block font-semibold tabular-nums text-ink">
                        {esperaAgora}
                      </span>
                      <span className="block text-[12px] tabular-nums text-muted">
                        {hora[p.id] ?? ""}
                      </span>
                    </>
                  ) : (
                    <span className="whitespace-nowrap tabular-nums text-ink-2">{hora[p.id] ?? ""}</span>
                  )}
                </td>

                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="font-display text-[15px] font-extrabold text-ink">
                      #{p.numero}
                    </span>
                    <InfoProducaoPedido pedidoId={p.id} numero={p.numero} />
                  </div>
                </td>

                <td className="max-w-[220px] px-3 py-3">
                  <span className="block truncate text-ink">{p.cliente}</span>
                  {/* A observação é operacional ("sem cebola") e não pode sumir
                      só porque virou tabela. Truncada, com o texto inteiro no
                      `title` para quem precisar conferir. */}
                  {p.observacao ? (
                    <span
                      title={p.observacao}
                      className="block truncate text-[12px] italic text-muted"
                    >
                      “{p.observacao}”
                    </span>
                  ) : null}
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-ink-2">
                  {rotuloDeOrigem(p.origem)}
                  <span className="text-muted"> · </span>
                  {rotuloDeModalidade(p.modalidade)}
                </td>

                <td className="px-3 py-3 text-center">
                  <Link
                    href={`/admin/pedidos?${consulta}modal=comanda&pedido=${p.id}`}
                    aria-label={`Abrir emissão de comanda do pedido #${p.numero}`}
                    title="Emitir comanda"
                    className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-10 border border-border-shalon bg-surface text-ink-2 no-underline transition-colors hover:border-brand-orange hover:bg-elev hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                      <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7v-7ZM17 11h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <IndicadorDeNavegacao forma="moldura" />
                  </Link>
                </td>

                <td className="px-3 py-3 text-right font-display text-[15px] font-extrabold tabular-nums text-ink">
                  {formatBRL(p.total)}
                </td>

                <td className="px-3 py-3 text-ink-2">
                  {p.forma_pagamento ?? "—"}
                  {p.troco !== null ? (
                    <span className="block text-[12px] text-muted">
                      troco {formatBRL(p.troco)}
                    </span>
                  ) : null}
                </td>

                <td className="px-3 py-3">
                  <StatusBadge
                    tom={estado.tom}
                    pulsante={p.status === "waiting_store_confirmation"}
                  >
                    {estado.rotulo}
                  </StatusBadge>
                  {/* Trava é texto, nunca só cor (CLAUDE.md §38). */}
                  {travas.map((t) => (
                    <span
                      key={t}
                      className="mt-1 block rounded-10 bg-tw px-2 py-[3px] text-[12px] font-semibold text-twf"
                    >
                      {t}
                    </span>
                  ))}
                </td>

                <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/*
                       * QUANDO O PEDIDO DEVE, RECEBER É A PRIMÁRIA — e o valor
                       * vai no botão. É a ação que o balcão mais repete, e o
                       * eixo financeiro estava invisível nesta tela: "Aceito"
                       * aparecia igual para quem pagou e para quem não pagou.
                       *
                       * Não é comando da máquina de estados; abre a gaveta. Por
                       * isso a ação de estado é rebaixada para o menu aqui.
                       */}
                      {cobravel && podeReceber && aoCobrar ? (
                        <button
                          type="button"
                          onClick={() => aoCobrar(cobravel)}
                          className={`min-h-10 cursor-pointer whitespace-nowrap rounded-10 border bg-transparent px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange ${ESTILO_RECEBER}`}
                        >
                          Receber {formatBRL(cobravel.total)}
                        </button>
                      ) : null}
                      <AcoesDoPedido
                        pedidoId={p.id}
                        acoes={p.acoes}
                        compacto
                        modo="linha"
                        comPrimaria={!(cobravel && podeReceber)}
                        itensAdicionais={[
                          {
                            rotulo: "Ver detalhes",
                            href: `/admin/pedidos?${consulta}modal=detalhes&pedido=${p.id}`,
                          },
                        ]}
                      />
                    </div>
                  </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
