"use client";

import { useState } from "react";
import { Cartao, EmptyState, Aviso, ParDeDados } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import type { PedidoAReceber } from "@/application/pdv/tipos";

/**
 * A fila de recebimento do PDV — Fase 12, Etapa 5.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §1.3, §4.2, §4.5
 *
 * O QUE ESTA TELA NÃO FAZ, e não por falta de tempo:
 *
 *  - não recebe pagamento. Isso é a Etapa 7, e a autoridade continua sendo
 *    `registrar_pagamento`. Aqui não existe botão que mexa em dinheiro;
 *  - não filtra a lista. Quem decide o que é "a receber" é a RPC. Um filtro
 *    nesta camada seria uma segunda regra sobre cobrança, mais restritiva por
 *    acidente (D-2026-09-26-79);
 *  - não avança produção. Selecionar um pedido não escreve nada: seleção é
 *    estado local, e o servidor nem sabe que houve.
 *
 * A seleção usa `<button>` de verdade em vez de `<div onClick>`: foco, Enter,
 * espaço e leitor de tela vêm de graça, sem nenhum atalho global — estes são a
 * Etapa 9 (CLAUDE.md §38).
 */

/** Rótulos do status operacional. Só leitura; a máquina de estados é do banco. */
const OPERACIONAL: Record<string, string> = {
  pending_payment: "Aguardando Pix",
  pending_approval: "Aguardando aprovação",
  pending_change: "Aguardando aceite da alteração",
  received: "Recebido",
  confirmed: "Aceito",
  in_production: "Em produção",
  ready_for_pickup: "Pronto",
  out_for_delivery: "Em entrega",
  completed: "Concluído",
};

/**
 * OS DOIS RÓTULOS FINANCEIROS SÃO DIFERENTES DE PROPÓSITO.
 *
 * `reversed` significa que a casa devolveu o dinheiro e o pedido seguiu vivo —
 * o cliente deve, mas por um caminho diferente de quem nunca pagou. Mostrar
 * "Pendente" nos dois casos economizaria uma palavra e esconderia do operador
 * exatamente o que ele precisa saber antes de cobrar (D-2026-09-26-79).
 */
const FINANCEIRO: Record<string, { rotulo: string; classe: string }> = {
  pending: { rotulo: "Pendente", classe: "border-border-shalon bg-surface text-ink-2" },
  reversed: { rotulo: "Estornado", classe: "border-twb bg-tw text-twf" },
};

/** `pickup`/`delivery` é como o cliente recebe. Não existe modalidade `balcao`. */
const MODALIDADE: Record<string, string> = { pickup: "Retirada", delivery: "Entrega" };

/** `counter` é de onde o pedido veio. Outro eixo, outra coluna (§0.3). */
const ORIGEM: Record<string, string> = {
  counter: "Balcão",
  shalon_link: "Link Shalon",
  whatsapp: "WhatsApp",
  phone: "Telefone",
  ifood: "iFood",
  other: "Outro",
};

function idade(minutos: number): string {
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function PainelPedidosAReceber({
  pedidos,
  falhou,
}: {
  pedidos: PedidoAReceber[];
  falhou: boolean;
}) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const atual = pedidos.find((p) => p.id === selecionado) ?? null;

  // "Não deu para consultar" e "não há nada a receber" são coisas opostas, e
  // apresentá-las com a mesma tela vazia faria a casa achar que está tudo
  // recebido justamente quando não sabe (CLAUDE.md §37).
  if (falhou) {
    return (
      <Cartao titulo="Pedidos a receber" largura="cheio">
        <Aviso erro="Não foi possível consultar a fila. Recarregue a página — e não conclua que não há nada a receber: esta lista não respondeu." />
      </Cartao>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <Cartao titulo={`Pedidos a receber (${pedidos.length})`} largura="cheio">
        {pedidos.length === 0 ? (
          <EmptyState
            titulo="Nada a receber"
            descricao="Todo pedido vivo já está pago. Pedido cancelado ou rejeitado não entra nesta fila."
          />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {pedidos.map((p) => {
              const fin = FINANCEIRO[p.status_financeiro] ?? {
                rotulo: p.status_financeiro,
                classe: "border-border-shalon bg-surface text-ink-2",
              };
              const ativo = p.id === selecionado;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelecionado(ativo ? null : p.id)}
                    aria-pressed={ativo}
                    className={[
                      "flex w-full min-h-[44px] flex-col gap-1 rounded-16 border-[1.5px] p-3 text-left",
                      "transition-colors motion-reduce:transition-none",
                      ativo
                        ? "border-cta bg-elev"
                        : "border-border-shalon bg-surface hover:border-brand-orange",
                    ].join(" ")}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[15px] font-bold text-ink">
                        #{p.numero}
                      </span>
                      <span className="text-[13.5px] text-ink">
                        {p.cliente_nome ?? "Sem nome"}
                      </span>
                      <span className="text-[12.5px] text-muted">
                        {ORIGEM[p.origem] ?? p.origem} · {MODALIDADE[p.modalidade] ?? p.modalidade}
                      </span>
                      <span className="ml-auto font-display text-[15px] font-bold text-ink">
                        {formatBRL(p.total)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-[12.5px]">
                      {/* Os dois eixos, lado a lado e nunca fundidos (§0.2). */}
                      <span className="rounded-pill border-[1.5px] border-border-shalon bg-surface px-2 py-[2px] text-ink-2">
                        {OPERACIONAL[p.status_operacional] ?? p.status_operacional}
                      </span>
                      <span className={`rounded-pill border-[1.5px] px-2 py-[2px] font-semibold ${fin.classe}`}>
                        {fin.rotulo}
                      </span>
                      <span className="text-muted">{idade(p.idade_minutos)}</span>
                      {p.forma_esperada ? (
                        <span className="text-muted">
                          esperado: {p.forma_esperada}
                          {p.bandeira_esperada ? ` ${p.bandeira_esperada}` : ""}
                          {p.precisa_troco && p.troco_para !== null
                            ? ` · troco p/ ${formatBRL(p.troco_para)}`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-muted">esperado: —</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>

      {atual ? (
        <Cartao titulo={`Pedido #${atual.numero}`} largura="cheio">
          <div className="flex flex-col gap-1">
            <ParDeDados chave="Cliente" valor={atual.cliente_nome ?? "—"} />
            <ParDeDados chave="WhatsApp" valor={atual.cliente_whatsapp ?? "—"} />
            <ParDeDados chave="Origem" valor={ORIGEM[atual.origem] ?? atual.origem} />
            <ParDeDados
              chave="Modalidade"
              valor={MODALIDADE[atual.modalidade] ?? atual.modalidade}
            />
            <ParDeDados
              chave="Status operacional"
              valor={OPERACIONAL[atual.status_operacional] ?? atual.status_operacional}
            />
            <ParDeDados
              chave="Status financeiro"
              valor={FINANCEIRO[atual.status_financeiro]?.rotulo ?? atual.status_financeiro}
            />
            <ParDeDados chave="Total" valor={formatBRL(atual.total)} />
            <ParDeDados
              chave="Forma esperada"
              valor={
                atual.forma_esperada
                  ? `${atual.forma_esperada}${atual.bandeira_esperada ? ` · ${atual.bandeira_esperada}` : ""}`
                  : "—"
              }
            />
            <ParDeDados
              chave="Valor esperado"
              valor={atual.valor_esperado === null ? "—" : formatBRL(atual.valor_esperado)}
            />
            <ParDeDados
              chave="Troco"
              valor={
                atual.precisa_troco && atual.troco_para !== null
                  ? `para ${formatBRL(atual.troco_para)}${
                      atual.troco_esperado === null
                        ? ""
                        : ` · devolver ${formatBRL(atual.troco_esperado)}`
                    }`
                  : "não precisa"
              }
            />
            <ParDeDados
              chave="Aberto em"
              valor={`${new Date(atual.criado_em).toLocaleString("pt-BR")} · ${idade(atual.idade_minutos)}`}
            />
          </div>
          {/* O recebimento é a Etapa 7. Dizer isso na tela é melhor do que
              oferecer um botão que não registra nada. */}
          <p className="m-0 mt-3 text-[12.5px] text-muted">
            O recebimento pelo PDV entra na Etapa 7. Por enquanto, receba por
            <span className="text-ink"> Pedidos → pedido → Registrar pagamento</span>.
          </p>
        </Cartao>
      ) : null}
    </div>
  );
}
