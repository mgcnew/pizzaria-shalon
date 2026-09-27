"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cartao, EmptyState, Aviso, ParDeDados } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { obterPagamentoDoPedidoNoPdv } from "@/application/pdv/acoes";
import {
  Recebimento,
  type ComandosDoRecebimento,
  type FormaParaRecebimento,
} from "@/app/(admin)/admin/pedidos/_ui/Recebimento";
import type { PagamentoDoPedido } from "@/application/caixa/tipos";
import type { PedidoAReceber } from "@/application/pdv/tipos";
import type { AreaComTeclado } from "./PdvComTeclado";

/**
 * A fila de recebimento do PDV — Fase 12, Etapa 5.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §1.3, §4.2, §4.5
 *
 * O QUE ESTA TELA NÃO FAZ, e não por falta de tempo:
 *
 *  - não decide nada sobre dinheiro. Desde a Etapa 7 existe aqui um painel de
 *    recebimento, mas ele é o MESMO `Recebimento` da tela de pedido, e quem
 *    autoriza continua sendo `registrar_pagamento`;
 *  - não filtra a lista. Quem decide o que é "a receber" é a RPC. Um filtro
 *    nesta camada seria uma segunda regra sobre cobrança, mais restritiva por
 *    acidente (D-2026-09-26-79);
 *  - não avança produção. Selecionar um pedido não escreve nada: seleção é
 *    estado local, e o servidor nem sabe que houve.
 *
 * A seleção usa `<button>` de verdade em vez de `<div onClick>`: foco, Enter,
 * espaço e leitor de tela vêm de graça. Desde a Etapa 9 as setas ↑↓ também
 * percorrem a fila, mas o Enter dos itens continua sendo o NATIVO do botão —
 * duplicá-lo no atalho global faria a seleção disparar duas vezes
 * (CLAUDE.md §38).
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
  formas,
  caixaAberto,
  registrar,
  aoMudar,
}: {
  pedidos: PedidoAReceber[];
  falhou: boolean;
  formas: FormaParaRecebimento[];
  caixaAberto: boolean;
  /** Entrega ao casco o `estado()` e o `executar()` desta área (Etapa 9). */
  registrar: (area: AreaComTeclado | null) => void;
  aoMudar: () => void;
}) {
  const router = useRouter();
  const [selecionado, setSelecionado] = useState<string | null>(null);
  /**
   * Pagamento POR PEDIDO, e não uma variável só.
   *
   * Guardar num mapa faz o valor exibido ser DERIVADO da seleção, em vez de
   * precisar ser limpo quando ela muda. Some com o `setState` síncrono dentro
   * do efeito — que o lint reprova com razão: limpar estado no corpo do efeito
   * gera um render a mais com o dado do pedido ANTERIOR ainda na tela.
   */
  const [pagamentos, setPagamentos] = useState<Record<string, PagamentoDoPedido | null>>({});
  const [carregando, iniciar] = useTransition();
  /**
   * O painel de recebimento só abre por ação explícita — Enter no item ou F8.
   *
   * Antes da Etapa 9 ele vinha junto da seleção. Com as setas percorrendo a
   * fila, isso montaria e desmontaria o painel a cada tecla, e quem estivesse no
   * meio de digitar um valor veria tudo desaparecer.
   */
  const [cobrando, setCobrando] = useState(false);
  const comandos = useRef<ComandosDoRecebimento | null>(null);

  /**
   * A CHAVE DE IDEMPOTÊNCIA DA COBRANÇA ABERTA, gerada uma vez, no evento que
   * abre o painel.
   *
   * Antes da Etapa 10 isto era `crypto.randomUUID()` escrito no JSX, refeito a
   * cada render. `Recebimento` captura a prop com `useRef` no mount, então
   * nada quebrava — mas a proteção morava no componente, não em quem entrega.
   * Com Realtime recarregando a tela sozinha, render deixou de ser evento
   * raro, e uma chave que roda no meio de um retry vira SEGUNDO pagamento
   * (CLAUDE.md §34).
   *
   * Nasce ao abrir e morre ao fechar: cobrar o mesmo pedido de novo, depois de
   * um estorno, precisa de chave nova — senão o servidor responderia "já
   * existia" para um pagamento que nunca aconteceu.
   */
  const [tentativa, setTentativa] = useState<string | null>(null);

  /** Abre a cobrança de um pedido. Único caminho, do clique e do F8. */
  function abrirCobranca() {
    setTentativa(crypto.randomUUID());
    setCobrando(true);
  }
  /**
   * A FOTO DO PEDIDO NO MOMENTO EM QUE FOI SELECIONADO.
   *
   * Sem ela, o Realtime produzia a pior versão do cenário de dois terminais:
   * o colega recebe #123, a fila recarrega, `pedidos` não traz mais o #123,
   * o cartão e o `Recebimento` DESMONTAM — e as linhas de divisão que o
   * operador estava digitando somem sem uma palavra, na frente do cliente.
   *
   * É estado e não `ref` porque é gravada no MESMO evento que seleciona: ler
   * ou escrever `ref` durante o render é o que faz um componente não atualizar
   * quando devia, e o lint reprova com razão.
   *
   * Enquanto o pedido está na fila, quem manda é a versão do servidor — a foto
   * só assume quando ele sai. Preservar o contexto não é deixar cobrar: saindo
   * da fila, o painel vira o aviso do desfecho (Etapa 10, decisão 2).
   */
  const [foto, setFoto] = useState<PedidoAReceber | null>(null);
  const naFila = pedidos.find((p) => p.id === selecionado) ?? null;
  const atual = naFila ?? (selecionado === null ? null : foto);

  /**
   * O pedido selecionado saiu da fila enquanto estava aberto aqui.
   *
   * `pedidos_a_receber()` só devolve `pending`/`reversed` fora de
   * cancelado/rejeitado. Sair da fila, portanto, significa uma de duas coisas:
   * alguém recebeu, ou alguém cancelou/rejeitou. Estorno não tira da fila —
   * devolve para ela.
   */
  const saiuDaFila = selecionado !== null && naFila === null && atual !== null;
  const pagamento = selecionado === null ? null : (pagamentos[selecionado] ?? null);
  /**
   * Houve pagamento confirmado? É o que distingue "pago em outro terminal" de
   * "cancelado". Sai do MESMO `pagamento_do_pedido` que o painel já lia — sem
   * consulta nova, sem autoridade nova.
   */
  const jaFoiPago = (pagamento?.realizado ?? []).some((p) => p.status === "confirmed");

  /**
   * O pagamento do pedido selecionado, buscado sob demanda.
   *
   * Por que não vem junto da fila: seriam N chamadas de `pagamento_do_pedido`
   * para montar uma lista em que o operador vai abrir UMA. E por que não vem
   * por parâmetro na URL: a venda em andamento vive ao lado, em estado de
   * cliente, e trocar a URL arriscaria perdê-la.
   */
  useEffect(() => {
    if (selecionado === null) return;
    let vigente = true;
    iniciar(async () => {
      const p = await obterPagamentoDoPedidoNoPdv(selecionado);
      // A resposta de uma seleção anterior não pode sobrescrever a atual.
      if (vigente) setPagamentos((m) => ({ ...m, [selecionado]: p }));
    });
    return () => {
      vigente = false;
    };
    // `saiuDaFila` entra nas dependências porque o desfecho precisa ser LIDO
    // DE NOVO: o pagamento em cache é de quando o pedido foi selecionado, e é
    // justamente ele que mudou noutro terminal. Sem reler, a tela diria
    // "cancelado" para um pedido que acabou de ser pago.
  }, [selecionado, saiuDaFila]);

  // ------------------------------------------------------- teclado (Etapa 9)

  const estadoParaOTeclado = useCallback(
    () => ({
      temPendentes: pedidos.length > 0,
      pedidoSelecionado: selecionado !== null,
      recebimentoDoPedidoAberto: selecionado !== null && cobrando,
    }),
    [cobrando, pedidos.length, selecionado],
  );

  const executarAtalho = useCallback(
    (acao: string) => {
      switch (acao) {
        case "fila:proximo":
        case "fila:anterior": {
          if (pedidos.length === 0) return;
          const delta = acao === "fila:proximo" ? 1 : -1;
          const atualIndice = pedidos.findIndex((p) => p.id === selecionado);
          const proximo =
            atualIndice === -1
              ? delta === 1
                ? 0
                : pedidos.length - 1
              : (atualIndice + delta + pedidos.length) % pedidos.length;
          const escolhido = pedidos[proximo];
          if (escolhido === undefined) return;
          // Navegar NÃO abre a cobrança: só move o destaque. Abrir a cada seta
          // remontaria o painel e apagaria o que estivesse digitado nele.
          setSelecionado(escolhido.id);
          setFoto(escolhido);
          setCobrando(false);
          setTentativa(null);
          return;
        }
        case "fila:receber":
          // Só abre o que ainda está na fila: pedido já resolvido noutro
          // terminal mostra o desfecho, e o F8 não fura isso.
          if (selecionado !== null && pedidos.some((p) => p.id === selecionado)) {
            abrirCobranca();
          }
          return;
        case "fila:desselecionar":
          // Um nível por Escape: primeiro fecha a cobrança, depois solta o item.
          if (cobrando) {
            setCobrando(false);
            setTentativa(null);
          } else {
            setSelecionado(null);
            setFoto(null);
          }
          return;

        case "recebimento:dividir":
          comandos.current?.dividir();
          return;
        case "recebimento:exato":
          comandos.current?.exato();
          return;
        case "recebimento:confirmar":
          comandos.current?.confirmar();
          return;
      }
    },
    [cobrando, pedidos, selecionado],
  );

  useEffect(() => {
    registrar({ estado: estadoParaOTeclado, executar: executarAtalho });
    return () => registrar(null);
  }, [registrar, estadoParaOTeclado, executarAtalho]);

  useEffect(() => {
    aoMudar();
  }, [aoMudar, pedidos.length, selecionado, cobrando]);

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
                    onClick={() => {
                      setSelecionado(ativo ? null : p.id);
                      setFoto(ativo ? null : p);
                      setCobrando(false);
                      setTentativa(null);
                    }}
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
          {/* ------------------------------------------------ recebimento */}
          <div className="mt-3 border-t border-border-shalon pt-3">
            {saiuDaFila ? (
              /*
               * DESFECHO EM OUTRO TERMINAL — Etapa 10, decisão 2.
               *
               * O contexto fica: número, cliente, total, tudo onde estava. O
               * que sai é a possibilidade de cobrar, e sai de vez — nada aqui
               * é submetível. Não é o Realtime que protege o dinheiro: mesmo
               * que este aviso nunca aparecesse, `registrar_pagamento` travaria
               * o pedido e devolveria `ja_pago`. O aviso existe para o operador
               * não descobrir isso apertando Ctrl+Enter na frente do cliente.
               */
              <div
                role="status"
                className={
                  jaFoiPago
                    ? "rounded-12 border-[1.5px] border-tsb bg-ts px-3 py-3"
                    : "rounded-12 border-[1.5px] border-twb bg-tw px-3 py-3"
                }
              >
                <p
                  className={`m-0 text-[14.5px] font-semibold ${jaFoiPago ? "text-tsf" : "text-twf"}`}
                >
                  {jaFoiPago
                    ? "Pago em outro terminal."
                    : "Este pedido saiu da fila — foi cancelado ou rejeitado."}
                </p>
                <p className={`m-0 mt-1 text-[13px] ${jaFoiPago ? "text-tsf" : "text-twf"}`}>
                  {jaFoiPago
                    ? "Não há o que cobrar. O histórico completo está na tela do pedido."
                    : "Pedido cancelado ou rejeitado não recebe pagamento."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelecionado(null);
                    setFoto(null);
                    setCobrando(false);
                    setTentativa(null);
                  }}
                  className="motion-interactive mt-3 min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[13px] font-semibold text-ink"
                >
                  Voltar à fila
                </button>
              </div>
            ) : !cobrando ? (
              <button
                type="button"
                onClick={abrirCobranca}
                className="motion-interactive min-h-touch-cta cursor-pointer rounded-12 border-0 bg-cta px-4 text-[14.5px] font-semibold text-cta-fg"
              >
                Receber este pedido
              </button>
            ) : carregando && pagamento === null ? (
              <p className="m-0 text-[13px] text-muted">Carregando o pagamento…</p>
            ) : (
              /*
               * `key` pelo pedido: trocar de pedido REMONTA o painel. Sem isso
               * a chave de idempotência e as linhas da divisão do pedido
               * anterior sobreviveriam para o seguinte — e chave reaproveitada
               * faz o servidor responder "já existia" para um pagamento que
               * nunca aconteceu.
               */
              <Recebimento
                key={atual.id}
                aoRegistrarComandos={(c) => {
                  comandos.current = c;
                }}
                pedidoId={atual.id}
                total={atual.total}
                pagamento={pagamento}
                formas={formas}
                caixaAberto={caixaAberto}
                tentativa={tentativa ?? ""}
                /*
                 * A intenção do checkout vira o ponto de partida do painel
                 * (§1.3). Casamos pelo NOME porque é o que `pagamento_do_pedido`
                 * devolve; se não casar — forma renomeada ou desativada — o
                 * painel abre no padrão, que é o comportamento de antes.
                 */
                formaInicialId={
                  formas.find((f) => f.nome === pagamento?.esperado?.metodo)?.id ?? null
                }
                aoConcluir={() => {
                  // A fila é dado de servidor: quem a atualiza é o servidor.
                  router.refresh();
                  // E o pagamento em cache virou passado no mesmo instante:
                  // mantê-lo mostraria "nada recebido" num pedido já pago.
                  setPagamentos({});
                  setSelecionado(null);
                  setFoto(null);
                  setCobrando(false);
                  setTentativa(null);
                }}
              />
            )}
          </div>
        </Cartao>
      ) : null}
    </div>
  );
}
