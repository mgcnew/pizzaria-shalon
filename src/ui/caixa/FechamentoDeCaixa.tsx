"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Input, Textarea } from "@/ui/components";
import { Aviso, ParDeDados } from "@/ui/patterns";
import { useAvisarOperacaoEmVoo } from "@/ui/operacaoEmVoo";
import { formatBRL } from "@/lib/format";
import { fecharCaixa, iniciarFechamentoCego, obterPreviaDoFechamento } from "@/application/caixa/acoes";
import type { PreviaDoFechamento } from "@/application/caixa/acoes";
import type { ResumoDeFechamento } from "@/application/caixa/tipos";
import { useImprimirDocumento } from "@/ui/impressao/useImprimirDocumento";
import { montarFechamentoDeCaixa } from "@/domain/impressao/cupons";
import {
  montarRelatorioDeFechamento,
  type RelatorioDeFechamento,
} from "@/domain/caixa/relatorioDeFechamento";

export function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

type ConferenciaDoFechamento = {
  fechado: boolean;
  esperado: number;
  contado: number;
  diferenca: number;
  resumo: ResumoDeFechamento | null;
};

/**
 * As duas chamadas ao servidor. Entram por parâmetro só para a tela poder ser
 * exercitada sem abrir e fechar um caixa de verdade; em uso real são sempre as
 * ações do caixa.
 */
type AcoesDoFechamento = {
  conferir: typeof iniciarFechamentoCego;
  fechar: typeof fecharCaixa;
  previa: typeof obterPreviaDoFechamento;
};

const ACOES_REAIS: AcoesDoFechamento = {
  conferir: iniciarFechamentoCego,
  fechar: fecharCaixa,
  previa: obterPreviaDoFechamento,
};

/**
 * Fechamento do caixa, em dois passos.
 *
 * O desenho é "cego" de propósito (RN-CAIXA-011): quem conta não vê o valor
 * esperado antes de informar a contagem. Isso não mudou. O que mudou foi o
 * resto da conversa, porque a tela dizia só "conte o dinheiro da gaveta" e
 * deixava três dúvidas: conta o fundo de troco? conta a maquininha? e o botão
 * "Conferir" fecha ou não fecha? A resposta de cada uma está agora escrita
 * onde a pessoa precisa.
 *
 * O esperado é fundo + entradas − saídas em dinheiro (`esperado_em_caixa`),
 * por isso o fundo entra na contagem. Cartão e Pix não são dinheiro físico, e
 * dinheiro que ainda está com o motoboy não está na gaveta (RN-CAIXA-014).
 */
export function FechamentoDeCaixa({
  erroExterno,
  aoErro,
  aoCancelar,
  acoes = ACOES_REAIS,
}: {
  erroExterno: string | null;
  aoErro: (erro: string | null) => void;
  aoCancelar: () => void;
  acoes?: AcoesDoFechamento;
}) {
  const [contadoTexto, setContadoTexto] = useState("");
  // Quantidades por nota/moeda, em centavos → quantidade. É só apoio de
  // contagem: o que vale é o total que cai no campo e o servidor confere.
  const [quantidades, setQuantidades] = useState<Record<number, number>>({});
  // Espelho síncrono: dois toques seguidos antes do redesenho não podem partir
  // da mesma contagem antiga.
  const quantidadesAtuais = useRef<Record<number, number>>({});
  const [conferencia, setConferencia] = useState<ConferenciaDoFechamento | null>(null);
  // Entre digitar e enviar: o valor aparece grande para ser conferido, porque
  // um zero a mais ("2700" por "270") fecharia o caixa com falsa sobra.
  const [confirmando, setConfirmando] = useState(false);
  const [previa, setPrevia] = useState<PreviaDoFechamento | null>(null);
  const [conferindo, iniciarConferencia] = useTransition();
  const { imprimir, enviando, erro: erroDeImpressao } = useImprimirDocumento();
  const resultado = useRef<HTMLDivElement>(null);
  useAvisarOperacaoEmVoo(conferindo);
  const contado = paraNumero(contadoTexto);
  const diferenca = conferencia?.diferenca ?? null;
  const precisaJustificar = diferenca !== null && diferenca !== 0;

  // Ao chegar no resultado, o foco vai para ele: quem usa leitor de tela ouve
  // "Caixa fechado" ou "Falta de R$ …" sem ter de procurar.
  // A prévia é só apoio: se não vier, a contagem segue sem ela.
  useEffect(() => {
    let ativo = true;
    acoes
      .previa()
      .then((r) => ativo && setPrevia(r))
      .catch(() => ativo && setPrevia({ ok: false }));
    return () => {
      ativo = false;
    };
  }, [acoes]);

  const etapa = conferencia === null ? 0 : conferencia.fechado ? 2 : 1;
  useEffect(() => {
    if (etapa > 0) resultado.current?.focus();
  }, [etapa]);

  if (conferencia === null) {
    return (
      <form
        className="flex flex-col gap-4"
        action={() => {
          if (contado === null || contado < 0) return;
          // Primeiro toque só mostra o valor para conferir; o segundo envia.
          if (!confirmando) {
            setConfirmando(true);
            return;
          }
          aoErro(null);
          iniciarConferencia(async () => {
            const r = await acoes.conferir({ contado });
            if (!r.ok) {
              setConfirmando(false);
              return aoErro(r.erro);
            }
            if (r.resumo === null) aoErro("Não foi possível carregar os totais por forma. A contagem foi registrada.");
            setConferencia({
              fechado: r.fechado,
              esperado: r.esperado,
              contado: r.contado,
              diferenca: r.diferenca,
              resumo: r.resumo,
            });
          });
        }}
      >
        <Passo atual={1} />

        {confirmando && contado !== null ? (
          <>
            <div className="rounded-14 border border-border-shalon bg-elev p-4 text-center">
              <p className="m-0 text-[13px] font-semibold text-muted">Você contou na gaveta</p>
              <p className="m-0 mt-1 font-display text-[34px] font-extrabold leading-none tabular-nums text-ink">
                {formatBRL(contado)}
              </p>
            </div>
            <p className="m-0 text-[14px] leading-snug text-ink-2">
              Confira se o valor está certo. Se ele bater com o sistema, <strong className="text-ink">o caixa será
              fechado agora</strong>. Se não bater, você vê a diferença antes de fechar.
            </p>
            {erroExterno ? <Aviso erro={erroExterno} /> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={conferindo}>
                {conferindo ? "Conferindo…" : "Está certo, conferir"}
              </Button>
              <Button type="button" variante="secundario" disabled={conferindo} onClick={() => setConfirmando(false)}>
                Corrigir valor
              </Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="m-0 font-display text-[18px] font-bold leading-tight text-ink">
                Conte todo o dinheiro que está na gaveta
              </p>
              <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0 text-[14px] leading-snug text-ink-2">
                <li className="flex gap-2">
                  <Marca tipo="sim" />
                  <span>
                    <strong className="text-ink">Conte o fundo de troco também</strong>, junto com as notas e moedas das vendas.
                  </span>
                </li>
                <li className="flex gap-2">
                  <Marca tipo="nao" />
                  <span>
                    <strong className="text-ink">Não conte</strong> maquininha, Pix, nem dinheiro que ainda está com o motoboy.
                  </span>
                </li>
              </ul>
            </div>

            <PreviaDosRecebimentos previa={previa} />

            {erroExterno ? <Aviso erro={erroExterno} /> : null}

            <Input
              name="contado"
              label="Total contado na gaveta (R$)"
              inputMode="decimal"
              placeholder="0,00"
              value={contadoTexto}
              onChange={(evento) => {
                setContadoTexto(evento.target.value);
                // Digitou por cima: a contagem por nota deixa de valer.
                quantidadesAtuais.current = {};
                setQuantidades({});
              }}
              required
              autoFocus
            />

            <ContagemPorNotas
              quantidades={quantidades}
              aoAjustar={(valor, delta) => {
                const nova = Math.max(0, Math.min(999, (quantidadesAtuais.current[valor] ?? 0) + delta));
                const proximas = { ...quantidadesAtuais.current, [valor]: nova };
                quantidadesAtuais.current = proximas;
                setQuantidades(proximas);
                const total = Object.entries(proximas).reduce((soma, [v, q]) => soma + Number(v) * q, 0);
                setContadoTexto(total > 0 ? centavosParaTexto(total) : "");
              }}
            />

            <p className="m-0 text-[12.5px] leading-snug text-muted">
              Por segurança, o valor que o sistema esperava só aparece depois da sua contagem.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={contado === null || contado < 0}>
                Continuar
              </Button>
              <Button type="button" variante="fantasma" onClick={aoCancelar}>
                Cancelar
              </Button>
            </div>
          </>
        )}
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      action={(dados) => {
        if (contado === null || contado < 0) return;
        const justificativa = String(dados.get("justificativa") ?? "").trim();
        aoErro(null);
        iniciarConferencia(async () => {
          const r = await acoes.fechar({
            contado,
            ...(justificativa ? { justificativa } : {}),
          });
          if (!r.ok) return aoErro(r.erro);
          if (r.resumo === null) aoErro("Caixa fechado, mas não foi possível carregar os totais por forma.");
          setConferencia((anterior) =>
            anterior === null
              ? anterior
              : { ...anterior, fechado: true, resumo: r.resumo ?? anterior.resumo },
          );
        });
      }}
    >
      <Passo atual={conferencia.fechado ? 3 : 2} />

      <div ref={resultado} tabIndex={-1} role="status" className="outline-none">
        {conferencia.fechado ? (
          <div className="flex items-start gap-3 rounded-14 border border-tgb bg-tg p-4 text-tgf">
            <Icone tipo="ok" />
            <div>
              <p className="m-0 font-display text-[19px] font-bold leading-tight">Caixa fechado</p>
              <p className="m-0 mt-1 text-[14px]">
                {conferencia.diferenca === 0
                  ? "A contagem bateu com o sistema."
                  : `Fechado com ${conferencia.diferenca > 0 ? "sobra" : "falta"} de ${formatBRL(Math.abs(conferencia.diferenca))}, justificada.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-14 border border-twb bg-tw p-4 text-twf">
            <Icone tipo="atencao" />
            <div>
              <p className="m-0 font-display text-[19px] font-bold leading-tight">
                {(diferenca ?? 0) > 0 ? "Sobra" : "Falta"} de {formatBRL(Math.abs(diferenca ?? 0))}
              </p>
              <p className="m-0 mt-1 text-[14px]">
                O caixa ainda não foi fechado. Confira os valores abaixo: se contou errado, conte de novo; se a
                diferença é real, explique o motivo para fechar.
              </p>
            </div>
          </div>
        )}
      </div>

      {erroExterno ? <Aviso erro={erroExterno} /> : null}
      {erroDeImpressao ? <Aviso erro={erroDeImpressao} /> : null}

      {precisaJustificar && !conferencia.fechado ? (
        <div>
          <Textarea
            name="justificativa"
            label="O que aconteceu? (obrigatório para fechar com diferença)"
            rows={3}
            required
          />
          <p className="m-0 mt-[6px] text-[12px] text-muted">
            Ex.: troco dado a mais, sangria que não foi registrada, nota rasgada. O sistema não desconta diferença de
            caixa de ninguém automaticamente.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {conferencia.fechado ? (
          <>
            <Button type="button" onClick={aoCancelar}>
              Concluir
            </Button>
            {conferencia.resumo ? (
              <Button
                type="button"
                variante="secundario"
                disabled={enviando}
                onClick={() => {
                  const resumo = conferencia.resumo;
                  const relatorio = relatorioDe(conferencia);
                  if (resumo === null || relatorio === null) return;
                  void imprimir((largura) =>
                    montarFechamentoDeCaixa(
                      {
                        ...relatorio,
                        data: new Date(`${resumo.data_operacional}T12:00:00`).toLocaleDateString("pt-BR"),
                      },
                      largura,
                    ),
                  );
                }}
              >
                {enviando ? "Enviando…" : "Imprimir fechamento"}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button type="submit" disabled={conferindo}>
              {conferindo ? "Fechando…" : "Fechar com diferença"}
            </Button>
            {/* Volta ao passo 1 com o total que já estava digitado — é o mesmo
                que cancelar e abrir de novo, sem perder o que foi contado. */}
            <Button type="button" variante="secundario" disabled={conferindo} onClick={() => { setConfirmando(false); setConferencia(null); }}>
              Contar de novo
            </Button>
            <Button type="button" variante="fantasma" onClick={aoCancelar}>
              Cancelar
            </Button>
          </>
        )}
      </div>

      <ResumoVisualDoFechamento conferencia={conferencia} aberto={conferencia.fechado} />
    </form>
  );
}

/**
 * O que não é dinheiro físico, para conferir com a maquininha antes de contar,
 * e o aviso do dinheiro que ainda está fora da gaveta. Vem filtrado do
 * servidor (`obterPreviaDoFechamento`): o dinheiro esperado não passa por aqui.
 */
function PreviaDosRecebimentos({ previa }: { previa: PreviaDoFechamento | null }) {
  if (previa === null) {
    return <div aria-hidden="true" className="h-[92px] animate-pulse rounded-12 bg-tn" />;
  }
  if (!previa.ok) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-12 border border-border-shalon p-3">
        <p className="m-0 mb-1 text-[12px] font-bold uppercase tracking-wide text-muted">
          Cartão e Pix nesta sessão
        </p>
        <p className="m-0 mb-1 text-[12.5px] text-muted">Confira com o relatório da maquininha.</p>
        {previa.semDinheiro.length > 0 ? (
          previa.semDinheiro.map((r) => (
            <ParDeDados key={r.metodo} chave={r.metodo} valor={formatBRL(r.total)} />
          ))
        ) : (
          <p className="m-0 text-[13px] text-ink-2">Nenhum recebimento por cartão ou Pix.</p>
        )}
      </div>

      {previa.foraDaGaveta > 0 ? (
        <p className="m-0 rounded-12 border border-twb bg-tw p-3 text-[13px] leading-snug text-twf">
          <strong>{formatBRL(previa.foraDaGaveta)} em dinheiro ainda estão fora da gaveta</strong> (ex.: com o
          motoboy). Esse valor não entra na contagem. Você pode fechar assim, e ele aparece no fechamento.
        </p>
      ) : null}
    </div>
  );
}

/** Onde a pessoa está: contar → conferir → pronto. A sequência é a informação. */
function Passo({ atual }: { atual: 1 | 2 | 3 }) {
  const passos = ["Contar", "Conferir", "Pronto"] as const;
  return (
    <ol aria-label="Etapas do fechamento" className="m-0 flex list-none items-center gap-2 p-0 text-[12.5px] font-semibold">
      {passos.map((nome, i) => {
        const numero = i + 1;
        const feito = numero < atual;
        const ativo = numero === atual;
        return (
          <li key={nome} aria-current={ativo ? "step" : undefined} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden="true" className="h-px w-5 bg-border-shalon" /> : null}
            <span
              className={[
                "flex size-6 items-center justify-center rounded-full text-[12px] font-bold",
                ativo ? "bg-brand-red text-white" : feito ? "bg-tg text-tgf" : "bg-tn text-muted",
              ].join(" ")}
            >
              {feito ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" style={{ width: 13, height: 13 }}>
                  <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                numero
              )}
            </span>
            <span className={ativo ? "text-ink" : "text-muted"}>{nome}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Marca({ tipo }: { tipo: "sim" | "nao" }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "mt-[1px] flex size-5 shrink-0 items-center justify-center rounded-full",
        tipo === "sim" ? "bg-tg text-tgf" : "bg-td text-tdf",
      ].join(" ")}
    >
      <svg viewBox="0 0 24 24" fill="none" style={{ width: 12, height: 12 }}>
        {tipo === "sim" ? (
          <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}

function Icone({ tipo }: { tipo: "ok" | "atencao" }) {
  return (
    <span aria-hidden="true" className="mt-[1px] flex size-7 shrink-0 items-center justify-center rounded-full bg-current/15">
      <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}>
        {tipo === "ok" ? (
          <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M12 6v7m0 4.5v.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}

const CEDULAS = [20000, 10000, 5000, 2000, 1000, 500, 200] as const;
const MOEDAS = [100, 50, 25, 10, 5] as const;

function centavosParaTexto(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

const rotuloDoValor = (c: number) => (c >= 100 ? `R$ ${c / 100}` : `${c} centavos`);

/**
 * Apoio opcional para contar: quantas notas e moedas de cada valor. O total
 * vai para o campo "Total contado"; o servidor confere a soma como confere
 * qualquer número digitado. Em centavos inteiros, para não acumular erro.
 */
function ContagemPorNotas({
  quantidades,
  aoAjustar,
}: {
  quantidades: Record<number, number>;
  aoAjustar: (valor: number, delta: number) => void;
}) {
  const total = Object.entries(quantidades).reduce((soma, [valor, q]) => soma + Number(valor) * q, 0);
  const mudar = aoAjustar;

  const grupo = (titulo: string, valores: readonly number[]) => (
    <div>
      <p className="m-0 mb-1 text-[12px] font-bold uppercase tracking-wide text-muted">{titulo}</p>
      <ul className="m-0 flex list-none flex-col p-0">
        {valores.map((valor) => {
          const q = quantidades[valor] ?? 0;
          return (
            <li key={valor} className="flex items-center justify-between gap-2 border-b border-border-shalon py-1 last:border-b-0">
              <span className={["text-[14px]", q > 0 ? "font-semibold text-ink" : "text-ink-2"].join(" ")}>
                {rotuloDoValor(valor)}
              </span>
              <span className="flex items-center">
                <button
                  type="button"
                  onClick={() => mudar(valor, -1)}
                  disabled={q === 0}
                  aria-label={`Menos uma de ${rotuloDoValor(valor)}`}
                  className="flex size-11 cursor-pointer items-center justify-center rounded-10 border-0 bg-transparent text-[20px] text-ink disabled:cursor-not-allowed disabled:text-muted disabled:opacity-40"
                >
                  −
                </button>
                <span aria-live="polite" className="min-w-8 text-center text-[15px] font-bold tabular-nums text-ink">
                  {q}
                </span>
                <button
                  type="button"
                  onClick={() => mudar(valor, 1)}
                  aria-label={`Mais uma de ${rotuloDoValor(valor)}`}
                  className="flex size-11 cursor-pointer items-center justify-center rounded-10 border-0 bg-transparent text-[20px] text-ink"
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <details className="group rounded-12 border border-border-shalon bg-elev">
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 px-3 text-[14px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span>Contar por notas e moedas</span>
        <span className="flex items-center gap-2 text-ink-2">
          {total > 0 ? <span className="tabular-nums">{formatBRL(total / 100)}</span> : null}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0 transition-transform group-open:rotate-180"
            style={{ width: 18, height: 18 }}
          >
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className="grid gap-x-6 gap-y-3 border-t border-border-shalon px-3 pb-3 pt-3 sm:grid-cols-2">
        {grupo("Notas", CEDULAS)}
        {grupo("Moedas", MOEDAS)}
      </div>
    </details>
  );
}

/** O relatório do fechamento, pronto para a tela e para o papel (mesma montagem). */
function relatorioDe(conferencia: ConferenciaDoFechamento): RelatorioDeFechamento | null {
  const r = conferencia.resumo;
  if (r === null) return null;
  return montarRelatorioDeFechamento({
    recebimentos: r.recebimentos_por_metodo,
    totalRecebido: r.total_recebido ?? null,
    fundoInicial: r.fundo_inicial,
    movimentos: r.movimentos_da_gaveta ?? null,
    entrou: r.entrou_na_gaveta ?? null,
    saiu: r.saiu_da_gaveta ?? null,
    legado: {
      recebidoEmDinheiro: r.recebido_em_dinheiro,
      reforcos: r.reforcos,
      sangrias: r.sangrias,
      despesas: r.despesas_pelo_caixa,
      entradas: r.entradas_pelo_caixa,
      estornos: r.estornos,
      diferencasDeMotoboy: r.diferencas_de_motoboy ?? 0,
    },
    contado: conferencia.contado,
    esperado: conferencia.esperado,
    diferenca: conferencia.diferenca,
    dinheiroForaDaGaveta: r.dinheiro_fora_da_gaveta,
  });
}

/** Linha de total: mesmo desenho do `ParDeDados`, em negrito. */
function ParTotal({ chave, valor }: { chave: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-border-shalon py-[9px] text-[14px] font-bold text-ink">
      <span className="shrink-0">{chave}</span>
      <span className="min-w-0 break-words text-right tabular-nums">{valor}</span>
    </div>
  );
}

const subtitulo = "m-0 mt-2 text-[12px] font-bold uppercase tracking-wide text-muted";

function ResumoVisualDoFechamento({
  conferencia,
  aberto,
}: {
  conferencia: ConferenciaDoFechamento;
  /** Fechado, os detalhes são o comprovante e ficam à vista; com diferença, recolhidos. */
  aberto: boolean;
}) {
  const resumo = conferencia.resumo;
  const relatorio = relatorioDe(conferencia);
  return (
    <div id="resumo-impressao-fechamento" className="flex flex-col gap-3 bg-surface">
      <div className="hidden text-center font-mono text-[13px] text-black print:block">
        <p className="m-0 text-[15px] font-bold">PIZZARIA SHALON</p>
        <p className="m-0">FECHAMENTO DE CAIXA</p>
        {resumo ? <p className="m-0">Data {new Date(`${resumo.data_operacional}T12:00:00`).toLocaleDateString("pt-BR")}</p> : null}
      </div>

      <div className="rounded-12 border border-border-shalon bg-elev p-3 print:rounded-none print:border-x-0 print:bg-white">
        <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-muted print:text-black">
          Dinheiro da gaveta
        </p>
        <ParDeDados chave="Você contou" valor={formatBRL(conferencia.contado)} />
        <ParDeDados chave="O sistema esperava" valor={formatBRL(conferencia.esperado)} />
        <ParDeDados
          chave="Diferença"
          valor={
            <strong className={conferencia.diferenca === 0 ? "text-tgf print:text-black" : "text-tdf print:text-black"}>
              {conferencia.diferenca === 0 ? formatBRL(0) : `${conferencia.diferenca > 0 ? "+" : "−"} ${formatBRL(Math.abs(conferencia.diferenca))}`}
            </strong>
          }
        />
      </div>

      {resumo && relatorio ? (
        <>
          {relatorio.foraDaGaveta > 0 ? (
            <p className="m-0 rounded-12 border border-twb bg-tw p-3 text-[13px] font-semibold text-twf print:rounded-none print:border-x-0 print:bg-white print:text-black">
              Dinheiro recebido que ainda não entrou na gaveta (ex.: com o motoboy): {formatBRL(relatorio.foraDaGaveta)}
            </p>
          ) : null}

          <details open={aberto} className="group flex flex-col gap-3">
            <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 rounded-12 border border-border-shalon px-3 text-[14px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <span>Recebimentos e movimentos da sessão</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="shrink-0 text-ink-2 transition-transform group-open:rotate-180"
                style={{ width: 18, height: 18 }}
              >
                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>

            {/* Só o que teve movimento: forma sem recebimento, sangria zerada e
                fundo zerado não aparecem. */}
            <div className="rounded-12 border border-border-shalon p-3 print:rounded-none print:border-x-0">
              <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-muted print:text-black">
                Recebido por forma de pagamento
              </p>
              {relatorio.recebidos.length > 0 ? (
                <>
                  {relatorio.recebidos.map((r) => (
                    <ParDeDados key={r.rotulo} chave={r.rotulo} valor={formatBRL(r.valor)} />
                  ))}
                  {relatorio.totalRecebido !== null ? (
                    <ParTotal chave="Total recebido" valor={formatBRL(relatorio.totalRecebido)} />
                  ) : null}
                </>
              ) : (
                <p className="m-0 text-[13px] text-muted print:text-black">Nenhum recebimento nesta sessão.</p>
              )}
            </div>

            <div className="rounded-12 border border-border-shalon p-3 print:rounded-none print:border-x-0">
              <p className="m-0 mb-1 text-[12px] font-bold uppercase tracking-wide text-muted print:text-black">
                Movimento da gaveta (só dinheiro)
              </p>
              {relatorio.fundo > 0 ? <ParDeDados chave="Fundo inicial" valor={formatBRL(relatorio.fundo)} /> : null}

              {relatorio.entradas.length > 0 ? (
                <>
                  <p className={subtitulo}>Entrou</p>
                  {relatorio.entradas.map((l) => (
                    <ParDeDados key={`e-${l.rotulo}`} chave={l.rotulo} valor={formatBRL(l.valor)} />
                  ))}
                  {relatorio.totalEntrou !== null ? (
                    <ParTotal chave="Total que entrou" valor={formatBRL(relatorio.totalEntrou)} />
                  ) : null}
                </>
              ) : null}

              {relatorio.saidas.length > 0 ? (
                <>
                  <p className={subtitulo}>Saiu</p>
                  {relatorio.saidas.map((l) => (
                    <ParDeDados key={`s-${l.rotulo}`} chave={l.rotulo} valor={formatBRL(l.valor)} />
                  ))}
                  {relatorio.totalSaiu !== null ? (
                    <ParTotal chave="Total que saiu" valor={formatBRL(relatorio.totalSaiu)} />
                  ) : null}
                </>
              ) : null}

              <ParTotal chave="Esperado na gaveta" valor={formatBRL(relatorio.esperado)} />
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
