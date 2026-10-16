"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { BandeirasAceitas } from "@/ui/components/BandeirasAceitas";
import Link from "next/link";
import { Button, Input, SelectMenu, StatusBadge } from "@/ui/components";
import { Aviso, ParDeDados } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { estornarPagamento, registrarPagamento } from "@/application/caixa/acoes";
import { useAvisarOperacaoEmVoo } from "@/ui/operacaoEmVoo";
import {
  dinheiroNaGavetaPorPadrao,
  type MomentoDoRecebimento,
} from "@/domain/pedidos/recebimentoNaEntrega";
import type { PagamentoDoPedido } from "@/application/caixa/tipos";

/**
 * Registro do pagamento REALIZADO, ao lado do esperado.
 *
 * Os dois ficam na mesma tela e nenhum substitui o outro: quando o cliente
 * escolheu dinheiro e pagou no débito, a tela mostra as duas coisas, porque
 * é essa diferença que explica o caixa depois (RN-PGTO-002).
 *
 * A DIVISÃO é o caso normal do balcão, não uma exceção: R$ 30 em dinheiro e
 * R$ 25 no cartão é um pagamento de duas linhas. A soma é conferida pelo
 * servidor contra o total do pedido — a conta que aparece enquanto a pessoa
 * digita é ajuda visual, não autoridade (§24).
 *
 * "Entrou na gaveta agora" existe por causa de RN-CAIXA-014: dinheiro que
 * voltou com quem entregou não é dinheiro no caixa, e marcar que entrou
 * quando não entrou é exatamente como se fecha um caixa com número falso.
 */

export type FormaParaRecebimento = {
  id: string;
  nome: string;
  familia: string;
  exige_bandeira: boolean;
  bandeiras: { id: string; nome: string }[];
};

type Linha = { forma_id: string; bandeira_id: string; valor: string; recebido: string; na_gaveta: boolean };

/** O que o teclado do PDV pode pedir a este painel (§3). */
export type ComandosDoRecebimento = {
  /** `/` — nova forma com o QUE FALTA, não com zero. */
  dividir: () => void;
  /** `*` — preenche "recebido em mãos" com o valor exato da linha em dinheiro. */
  exato: () => void;
  /** `Ctrl+Enter` — confirma, se a soma fechar. */
  confirmar: () => void;
};

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function linhaVazia(
  formas: FormaParaRecebimento[],
  total: string,
  formaInicialId?: string | null,
  naGaveta = true,
): Linha {
  // A forma ESPERADA abre selecionada (09 §1.3). O cliente já disse como
  // pretende pagar; começar em outra obriga o operador a corrigir a tela toda
  // vez, e é assim que se registra dinheiro na forma errada com pressa.
  // Só vale se a forma ainda estiver ativa — senão cai no padrão de antes.
  const esperada = formas.find((f) => f.id === formaInicialId)?.id;
  return {
    forma_id: esperada ?? formas[0]?.id ?? "",
    bandeira_id: "",
    valor: total,
    recebido: "",
    na_gaveta: naGaveta,
  };
}

export function Recebimento({
  pedidoId,
  total,
  pagamento,
  formas,
  caixaAberto,
  tentativa,
  formaInicialId = null,
  momento = "agora",
  aoConcluir,
  aoRegistrarComandos,
}: {
  pedidoId: string;
  total: number;
  pagamento: PagamentoDoPedido | null;
  formas: FormaParaRecebimento[];
  caixaAberto: boolean;
  tentativa: string;
  /**
   * Forma que o cliente declarou no checkout, para o painel abrir nela
   * (§1.3). É só o ponto de partida: o operador troca à vontade, e o que
   * vale é o RECEBIDO, que pode diferir do esperado (§24).
   */
  formaInicialId?: string | null;
  /**
   * Quando este pagamento está sendo recebido (D-2026-10-01-110). Entrega que
   * ainda não saiu abre em "Receber na entrega"; depois da saída, o dinheiro
   * vem marcado como "com o motoboy". Retirada e balcão: recebe-se agora.
   */
  momento?: MomentoDoRecebimento;
  /**
   * Registra os comandos de teclado do painel — Etapa 9, §3.
   *
   * O painel NÃO escuta o teclado: quem escuta é o casco do PDV, que é o único
   * que sabe se há um modal por cima ou um campo com foco. Aqui só ficam as
   * três funções, e elas são as MESMAS que os botões chamam — o atalho não
   * abre um segundo caminho para o dinheiro.
   *
   * Na tela de pedido a prop é omitida e nada muda.
   */
  aoRegistrarComandos?: (comandos: ComandosDoRecebimento | null) => void;
  /**
   * Chamado depois que o SERVIDOR confirmou (recebimento ou estorno).
   *
   * Existe para o PDV, onde este painel vive ao lado da fila de "Pedidos a
   * receber": sem o aviso, o pedido recém-pago continuaria listado como a
   * pagar até alguém recarregar a página — e fila velha no balcão é como se
   * cobra duas vezes. Na tela de pedido, onde não há fila ao lado, a prop é
   * omitida e nada muda.
   */
  aoConcluir?: () => void;
}) {
  const totalTexto = total.toFixed(2).replace(".", ",");
  const naGavetaPadrao = dinheiroNaGavetaPorPadrao(momento);
  const [linhas, setLinhas] = useState<Linha[]>([
    linhaVazia(formas, totalTexto, formaInicialId, naGavetaPadrao),
  ]);
  // Entrega que não saiu começa em "na entrega": registrar agora é a exceção
  // do cliente que pagou na loja, a um toque — nunca o caminho por descuido.
  const [receberAgora, setReceberAgora] = useState(momento !== "antes_da_entrega");
  const [erro, setErro] = useState<string | null>(null);
  const [estornando, setEstornando] = useState(false);
  const [enviando, iniciar] = useTransition();
  const chave = useRef(tentativa);

  /*
   * Avisa o assinante do Realtime enquanto há dinheiro em voo, para que ele
   * NÃO recarregue a tela no meio do envio (Etapa 10). Fora do PDV não há
   * provedor, e o hook não faz nada.
   */
  useAvisarOperacaoEmVoo(enviando);

  const confirmados = (pagamento?.realizado ?? []).filter((p) => p.status === "confirmed");
  const jaPago = confirmados.length > 0;

  const somado = linhas.reduce((s, l) => s + (paraNumero(l.valor) ?? 0), 0);
  const fecha = Math.round(somado * 100) === Math.round(total * 100);
  /**
   * O QUE FALTA, em reais e com sinal.
   *
   * Negativo significa que somaram MAIS que o total — e o servidor recusa os
   * dois casos igualmente, porque "sobra" em pagamento dividido é dinheiro que
   * ninguém sabe de onde veio. Mostrar o número com sinal deixa o operador ver
   * qual dos dois erros ele cometeu, em vez de só "não fecha" (§4.1).
   */
  const falta = Math.round((total - somado) * 100) / 100;
  const valoresValidos = linhas.every((linha) => {
    const valor = paraNumero(linha.valor);
    const recebido = paraNumero(linha.recebido);
    const forma = formas.find((f) => f.id === linha.forma_id);
    return valor !== null && valor > 0 && Boolean(forma) &&
      (forma?.familia !== "cash" || recebido === null || recebido >= valor);
  });
  const podeRegistrar = caixaAberto && fecha && valoresValidos && !enviando;

  const formatarValor = (n: number) => n.toFixed(2).replace(".", ",");

  /**
   * `/` — nova forma JÁ COM O QUE FALTA.
   *
   * Abrir em zero obrigaria a digitar o restante à mão, que é a conta que a
   * tela acabou de fazer. Se já fechou, a linha nova nasce em zero: acrescentar
   * o total outra vez produziria o dobro.
   */
  const dividir = useCallback(() => {
    if (jaPago) return;
    setLinhas((atuais) => {
      const somadoAgora = atuais.reduce((s, l) => s + (paraNumero(l.valor) ?? 0), 0);
      const restante = Math.round((total - somadoAgora) * 100) / 100;
      return [
        ...atuais,
        { ...linhaVazia(formas, formatarValor(restante > 0 ? restante : 0), null, naGavetaPadrao) },
      ];
    });
  }, [formas, jaPago, total, naGavetaPadrao]);

  /**
   * `*` — "recebido em mãos" igual ao valor devido, na última linha em dinheiro.
   *
   * É o caso do cliente que paga justo: sem isto o operador digita o mesmo
   * número duas vezes. Só em dinheiro, porque troco só existe em dinheiro
   * (RN-PGTO-005) — e o servidor recusa `recebido` em qualquer outra forma.
   */
  const exato = useCallback(() => {
    if (jaPago) return;
    setLinhas((atuais) => {
      // Busca de trás para frente: a linha em dinheiro mais recente é a que o
      // operador acabou de mexer. `findLastIndex` existe no runtime, mas o
      // `lib` do projeto é anterior a ES2023 — e mudar o alvo do TypeScript por
      // uma linha seria alteração estrutural fora de escopo (CLAUDE.md §44-A).
      let i = -1;
      for (let j = atuais.length - 1; j >= 0; j -= 1) {
        if (formas.find((f) => f.id === atuais[j]?.forma_id)?.familia === "cash") {
          i = j;
          break;
        }
      }
      if (i === -1) return atuais;
      return atuais.map((l, j) => (j === i ? { ...l, recebido: l.valor } : l));
    });
  }, [formas, jaPago]);

  const formulario = useRef<HTMLFormElement>(null);

  /**
   * `Ctrl+Enter` — confirma pelo MESMO caminho do botão.
   *
   * `requestSubmit` dispara a `action` do formulário, com validação de campo
   * obrigatório e tudo. Chamar `registrarPagamento` daqui seria um segundo
   * caminho para o dinheiro, e dois caminhos divergem.
   */
  const confirmar = useCallback(() => {
    if (jaPago || enviando || !receberAgora) return;
    formulario.current?.requestSubmit();
  }, [enviando, jaPago, receberAgora]);

  useEffect(() => {
    if (aoRegistrarComandos === undefined) return;
    aoRegistrarComandos({ dividir, exato, confirmar });
    return () => aoRegistrarComandos(null);
  }, [aoRegistrarComandos, dividir, exato, confirmar]);

  function atualizar(i: number, campo: keyof Linha, valor: string | boolean) {
    setLinhas((atuais) => atuais.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  }

  function executar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir esta ação.");
        return;
      }
      // Chave NOVA só depois do sucesso: enquanto a tentativa não vingou, a
      // mesma chave tem de ser reenviada, senão o retry vira segundo
      // pagamento em vez de repetição da mesma intenção (CLAUDE.md §34).
      chave.current = crypto.randomUUID();
      setLinhas([linhaVazia(formas, totalTexto, formaInicialId, naGavetaPadrao)]);
      setEstornando(false);
      aoConcluir?.();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ------------------------------------------------- o esperado */}
      {pagamento?.esperado ? (
        <div>
          <p className="m-0 text-[12px] font-semibold uppercase tracking-wide text-muted">
            Esperado no checkout
          </p>
          <p className="m-0 text-[14.5px] text-ink">
            {pagamento.esperado.metodo}
            {pagamento.esperado.bandeira ? ` · ${pagamento.esperado.bandeira}` : ""}
          </p>
          {pagamento.esperado.troco_esperado != null ? (
            <p className="m-0 text-[13.5px] font-semibold text-twf">
              Troco para {formatBRL(pagamento.esperado.troco_para ?? 0)} — levar{" "}
              {formatBRL(pagamento.esperado.troco_esperado)}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------ o realizado */}
      <div className="border-t border-border-shalon pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-wide text-muted">
            Recebido de fato
          </p>
          {jaPago ? (
            <StatusBadge tom="sucesso">Pago</StatusBadge>
          ) : (
            <StatusBadge tom="atencao">Não registrado</StatusBadge>
          )}
        </div>

        {(pagamento?.realizado ?? []).length === 0 ? (
          <p className="m-0 mt-1 text-[13.5px] text-muted">
            Nada recebido ainda. Registre quando o dinheiro entrar.
          </p>
        ) : (
          <div className="mt-2">
            {(pagamento?.realizado ?? []).map((p) => (
              <ParDeDados
                key={p.id}
                chave={`${p.metodo ?? "—"}${p.bandeira ? ` · ${p.bandeira}` : ""}${
                  p.status === "reversed" ? " · estornado" : p.na_gaveta ? "" : " · fora da gaveta"
                }`}
                valor={
                  <span className={p.status === "reversed" ? "text-muted line-through" : ""}>
                    {formatBRL(p.valor)}
                    {p.troco != null ? ` (troco ${formatBRL(p.troco)})` : ""}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      {erro ? <Aviso erro={erro} /> : null}

      {/* ------------------------------------- entrega: quando receber */}
      {!jaPago && momento === "antes_da_entrega" ? (
        <div
          role="radiogroup"
          aria-label="Quando este pedido de entrega será pago"
          className="flex flex-col gap-2 border-t border-border-shalon pt-3"
        >
          {[
            {
              agora: false,
              titulo: "Receber na entrega",
              detalhe:
                "O motoboy recebe na porta. O pagamento é registrado quando ele voltar, no acerto da saída.",
            },
            {
              agora: true,
              titulo: "Cliente já pagou na loja",
              detalhe: "Registra agora. A comanda sai como PAGO e o motoboy não cobra.",
            },
          ].map((opcao) => {
            const ativa = receberAgora === opcao.agora;
            return (
              <button
                key={opcao.titulo}
                type="button"
                role="radio"
                aria-checked={ativa}
                onClick={() => setReceberAgora(opcao.agora)}
                className={[
                  "flex min-h-touch w-full cursor-pointer items-start gap-3 rounded-12 border-[1.5px] px-3 py-2.5 text-left",
                  ativa ? "border-brand-red bg-elev" : "border-border-shalon bg-surface hover:border-brand-orange",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                    ativa ? "border-brand-red" : "border-border-shalon",
                  ].join(" ")}
                >
                  {ativa ? <span className="h-2.5 w-2.5 rounded-full bg-brand-red" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-ink">{opcao.titulo}</span>
                  <span className="block text-[12.5px] text-ink-2">{opcao.detalhe}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {!jaPago && momento === "depois_da_saida" ? (
        <p className="m-0 rounded-10 bg-tw px-3 py-2 text-[12.5px] font-semibold text-twf">
          Registre o que o motoboy recebeu. Dinheiro fica como &ldquo;com o motoboy&rdquo; até o
          acerto da saída.
        </p>
      ) : null}

      {/* -------------------------------------------------- registrar */}
      {!jaPago && receberAgora ? (
        <form
          ref={formulario}
          className="flex flex-col gap-3 border-t border-border-shalon pt-3"
          action={() => {
            if (!podeRegistrar) return;
            const montadas = linhas.map((l) => {
              const forma = formas.find((f) => f.id === l.forma_id);
              const recebido = paraNumero(l.recebido);
              return {
                forma_id: l.forma_id,
                ...(l.bandeira_id ? { bandeira_id: l.bandeira_id } : {}),
                valor: paraNumero(l.valor) ?? 0,
                ...(forma?.familia === "cash" && recebido !== null ? { recebido } : {}),
                na_gaveta: forma?.familia === "cash" ? l.na_gaveta : true,
              };
            });
            executar(() =>
              registrarPagamento({
                pedido_id: pedidoId,
                linhas: montadas,
                tentativa: chave.current,
              }),
            );
          }}
        >
          {!caixaAberto ? (
            <p className="m-0 rounded-10 bg-tw px-3 py-2 text-[13px] font-semibold text-twf">
              Caixa fechado. O troco pode ser conferido aqui, mas o recebimento só pode ser registrado após abrir o caixa no{" "}
              <Link href="/admin/pdv" className="underline underline-offset-2">PDV</Link>.
            </p>
          ) : null}

          {linhas.map((linha, i) => {
            const forma = formas.find((f) => f.id === linha.forma_id);
            const valorDaLinha = paraNumero(linha.valor) ?? 0;
            const recebidoEmMaos = paraNumero(linha.recebido);
            const diferencaEmCentavos = recebidoEmMaos === null
              ? null
              : Math.round((recebidoEmMaos - valorDaLinha) * 100);
            return (
              <div key={i} className="flex flex-col gap-2 rounded-12 bg-elev p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <SelectMenu
                    label={linhas.length > 1 ? `Forma ${i + 1}` : "Forma"}
                    valor={linha.forma_id}
                    aoMudar={(valor) => {
                      setLinhas((atuais) => atuais.map((atual, j) =>
                        j === i ? { ...atual, forma_id: valor, bandeira_id: "", recebido: "" } : atual,
                      ));
                    }}
                    opcoes={formas.map((f) => ({ valor: f.id, texto: f.nome }))}
                  />
                  {linhas.length > 1 ? (
                    <Input
                      id={`valor-recebimento-${i}`}
                      label="Valor desta forma"
                      inputMode="decimal"
                      value={linha.valor}
                      onChange={(e) => atualizar(i, "valor", e.target.value)}
                    />
                  ) : (
                    <div className="rounded-12 border border-border-shalon bg-surface px-3 py-2">
                      <span className="block text-[12px] font-semibold text-muted">Valor da venda</span>
                      <strong className="font-display text-[20px] tabular-nums text-ink">{formatBRL(total)}</strong>
                    </div>
                  )}
                </div>

                {forma?.exige_bandeira ? <BandeirasAceitas bandeiras={forma.bandeiras} /> : null}

                {forma?.familia === "cash" ? (
                  <>
                    <Input
                      id={`dinheiro-entregue-${i}`}
                      label="Dinheiro entregue pelo cliente"
                      inputMode="decimal"
                      placeholder={`Ex.: ${formatBRL(valorDaLinha)}`}
                      hint="Deixe em branco se o cliente pagou o valor exato."
                      value={linha.recebido}
                      onChange={(e) => atualizar(i, "recebido", e.target.value)}
                    />
                    {diferencaEmCentavos !== null ? (
                      <p role="status" className={`m-0 rounded-10 px-3 py-2 text-[13px] font-semibold ${
                        diferencaEmCentavos < 0
                          ? "bg-td text-tdf"
                          : "bg-tg text-tgf"
                      }`}>
                        {diferencaEmCentavos < 0
                          ? `Valor entregue menor que o devido: faltam ${formatBRL(-diferencaEmCentavos / 100)}`
                          : `Troco a devolver: ${formatBRL(diferencaEmCentavos / 100)}`}
                      </p>
                    ) : null}
                    <label className="flex items-center gap-[10px] text-[13px] text-ink">
                      <input
                        type="checkbox"
                        checked={linha.na_gaveta}
                        onChange={(e) => atualizar(i, "na_gaveta", e.target.checked)}
                        className="h-[18px] w-[18px] accent-[var(--cta)]"
                      />
                      <span>Este dinheiro entrou na gaveta agora</span>
                    </label>
                  </>
                ) : null}

                {linhas.length > 1 ? (
                  <Button
                    variante="fantasma"
                    tamanho="sm"
                    onClick={() => setLinhas((atuais) => {
                      const restantes = atuais.filter((_, j) => j !== i);
                      const unica = restantes[0];
                      return restantes.length === 1 && unica
                        ? [{ ...unica, valor: totalTexto }]
                        : restantes;
                    })}
                  >
                    Remover esta forma
                  </Button>
                ) : null}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* O botão e o `/` chamam a MESMA função: um caminho só. */}
            <Button variante="secundario" tamanho="sm" onClick={dividir}>
              Dividir em outra forma
            </Button>
            {linhas.length > 1 ? <span className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
              <span className="text-ink-2">
                Somado <span className="font-semibold tabular-nums text-ink">{formatBRL(somado)}</span>
              </span>
              {fecha ? (
                <span className="font-semibold text-tgf">FALTA {formatBRL(0)} ✓</span>
              ) : falta > 0 ? (
                <span className="font-semibold text-tdf">FALTA {formatBRL(falta)}</span>
              ) : (
                <span className="font-semibold text-tdf">
                  SOBRA {formatBRL(Math.abs(falta))}
                </span>
              )}
            </span> : null}
          </div>

          <Button type="submit" disabled={!podeRegistrar}>
            {enviando ? "Registrando…" : `Registrar pagamento de ${formatBRL(total)}`}
          </Button>
        </form>
      ) : jaPago ? (
        <div className="border-t border-border-shalon pt-3">
          {estornando ? (
            <form
              className="flex flex-wrap items-end gap-2"
              action={(dados) => {
                const motivo = String(dados.get("motivo") ?? "").trim();
                if (motivo.length < 3) return;
                executar(() => estornarPagamento({ pedido_id: pedidoId, motivo }));
              }}
            >
              <Input name="motivo" label="Motivo do estorno" required />
              <Button type="submit" variante="perigo" tamanho="md" disabled={enviando}>
                Estornar recebimento
              </Button>
              <Button variante="fantasma" tamanho="md" onClick={() => setEstornando(false)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <Button variante="fantasma" tamanho="sm" onClick={() => setEstornando(true)}>
              Estornar recebimento
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
