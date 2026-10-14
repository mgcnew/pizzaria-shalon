"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Button, Input, StatusBadge, Textarea } from "@/ui/components";
import { Aviso, ParDeDados } from "@/ui/patterns";
import { useAvisarOperacaoEmVoo } from "@/ui/operacaoEmVoo";
import { formatBRL } from "@/lib/format";
import {
  abrirCaixa,
  fecharCaixa,
  iniciarFechamentoCego,
  movimentarCaixa,
} from "@/application/caixa/acoes";
import type { ResumoDeFechamento } from "@/application/caixa/tipos";
import { HistoricoDeVendas } from "./HistoricoDeVendas";
import { ESPACO_FINAL_MM, MARGEM_ESQUERDA_MM, useImpressoraDoAparelho } from "@/ui/impressao/impressoraDoAparelho";
import { useImprimirDocumento } from "@/ui/impressao/useImprimirDocumento";
import { AREA_UTIL_MM } from "@/ui/impressao/imprimir";
import { montarFechamentoDeCaixa } from "@/domain/impressao/cupons";

type Operacao = "abrir" | "reforco" | "sangria" | "fechar" | null;

export type ComandosDoCaixa = {
  abrirReforco: () => void;
  abrirSangria: () => void;
};

/** Projeção deliberadamente sem saldo, fundo, recebimentos ou movimentos. */
export type EstadoVisivelDoCaixa =
  | { aberto: false }
  | { aberto: true; aberta_por: string | null };

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

/** Barra operacional do caixa: oferece ações sem expor o saldo esperado. */
export function PainelDoCaixa({
  estado,
  tentativa,
  aoRegistrarComandos,
  venda,
  aoConcluirVenda,
  podeEstornar,
}: {
  estado: EstadoVisivelDoCaixa;
  tentativa: string;
  aoRegistrarComandos?: (comandos: ComandosDoCaixa | null) => void;
  venda: { quantidade: number; total: number };
  aoConcluirVenda: () => void;
  podeEstornar: boolean;
}) {
  const [operacao, setOperacao] = useState<Operacao>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const chave = useRef(tentativa);
  // Precisa ser estável: focar um campo recalcula a faixa de atalhos do PDV e
  // renderiza este painel novamente. Uma função inline faria o efeito do modal
  // rodar de novo e devolver o foco ao contêiner, roubando-o do input.
  const fecharOperacao = useCallback(() => setOperacao(null), []);

  function abrir(proxima: Exclude<Operacao, null>) {
    setErro(null);
    setOperacao(proxima);
  }

  useEffect(() => {
    aoRegistrarComandos?.({
      abrirReforco: () => abrir("reforco"),
      abrirSangria: () => abrir("sangria"),
    });
    return () => aoRegistrarComandos?.(null);
  }, [aoRegistrarComandos]);

  useAvisarOperacaoEmVoo(enviando);

  function executar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado.ok) {
        setErro(resultado.erro ?? "Não foi possível concluir esta ação.");
        return;
      }
      chave.current = crypto.randomUUID();
      setOperacao(null);
    });
  }

  return (
    <>
      <section className="rounded-16 border border-border-shalon bg-surface p-3 shadow-[0_6px_22px_rgb(41_37_36/0.06)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tom={estado.aberto ? "sucesso" : "neutro"}>
                {estado.aberto ? "Caixa aberto" : "Caixa fechado"}
              </StatusBadge>
              <span className="text-[12.5px] text-muted">
                {estado.aberto
                  ? `Aberto por ${estado.aberta_por ?? "—"}`
                  : "Abra para iniciar as operações da gaveta"}
              </span>
              {estado.aberto ? (
                <button
                  type="button"
                  onClick={() => abrir("fechar")}
                  className="ml-1 min-h-8 cursor-pointer rounded-9 border border-border-shalon bg-transparent px-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-danger hover:text-danger"
                >
                  Fechar caixa
                </button>
              ) : null}
            </div>
          </div>

          {estado.aberto ? (
            <div className="flex flex-1 flex-wrap justify-end gap-2 sm:flex-none">
              <HistoricoDeVendas podeEstornar={podeEstornar} />
              <Button
                tamanho="sm"
                disabled={venda.quantidade === 0}
                onClick={aoConcluirVenda}
                className="sm:mr-1"
              >
                Concluir venda
                {venda.quantidade > 0 ? ` · ${venda.quantidade} · ${formatBRL(venda.total)}` : ""}
              </Button>
            </div>
          ) : (
            <div className="flex flex-1 flex-wrap justify-end gap-2 sm:flex-none">
              <HistoricoDeVendas podeEstornar={podeEstornar} />
              <Button tamanho="sm" disabled={venda.quantidade === 0} onClick={aoConcluirVenda}>
                Concluir venda
                {venda.quantidade > 0 ? ` · ${venda.quantidade} · ${formatBRL(venda.total)}` : ""}
              </Button>
              <Button tamanho="sm" variante="secundario" onClick={() => abrir("abrir")}>
                Abrir caixa
              </Button>
            </div>
          )}
        </div>

      </section>

      {operacao !== null ? (
        <ModalDeCaixa titulo={tituloDaOperacao(operacao)} aoFechar={fecharOperacao}>
          {operacao === "abrir" ? (
            <FormularioDeAbertura
              enviando={enviando}
              erro={erro}
              aoConfirmar={(fundo) => executar(() => abrirCaixa({ fundo }))}
              aoCancelar={fecharOperacao}
            />
          ) : null}

          {operacao === "reforco" || operacao === "sangria" ? (
            <FormularioDeMovimento
              tipo={operacao}
              enviando={enviando}
              erro={erro}
              aoCancelar={fecharOperacao}
              aoConfirmar={(valor, motivo) =>
                executar(() =>
                  movimentarCaixa({
                    tipo: operacao === "sangria" ? "withdrawal" : "supply",
                    valor,
                    ...(motivo ? { motivo } : {}),
                    tentativa: chave.current,
                  }),
                )
              }
            />
          ) : null}

          {operacao === "fechar" ? (
            <FormularioDeFechamento
              erroExterno={erro}
              aoErro={setErro}
              aoCancelar={fecharOperacao}
            />
          ) : null}
        </ModalDeCaixa>
      ) : null}
    </>
  );
}

function tituloDaOperacao(operacao: Exclude<Operacao, null>) {
  if (operacao === "abrir") return "Abrir caixa";
  if (operacao === "reforco") return "Registrar reforço";
  if (operacao === "sangria") return "Registrar sangria";
  return "Fechar caixa";
}

function ModalDeCaixa({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    painel.current?.focus();
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflow;
      anterior?.focus();
    };
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-operacao-caixa"
        tabIndex={-1}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-20 border border-border-shalon bg-surface p-5 shadow-2xl outline-none sm:max-w-[560px] sm:rounded-20"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="titulo-operacao-caixa" className="m-0 font-display text-[19px] font-bold text-ink">
            {titulo}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full border border-border-shalon bg-elev text-[20px] text-ink"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormularioDeAbertura({ enviando, erro, aoConfirmar, aoCancelar }: {
  enviando: boolean; erro: string | null; aoConfirmar: (fundo: number) => void; aoCancelar: () => void;
}) {
  return (
    <form className="flex flex-col gap-4" action={(dados) => aoConfirmar(paraNumero(String(dados.get("fundo") ?? "")) ?? 0)}>
      <p className="m-0 text-[13.5px] text-muted">Informe somente o fundo físico colocado na gaveta.</p>
      {erro ? <Aviso erro={erro} /> : null}
      <Input name="fundo" label="Fundo inicial" inputMode="decimal" placeholder="0,00" defaultValue="0,00" />
      <Acoes enviando={enviando} rotulo="Abrir caixa" aoCancelar={aoCancelar} />
    </form>
  );
}

function FormularioDeMovimento({ tipo, enviando, erro, aoConfirmar, aoCancelar }: {
  tipo: "reforco" | "sangria"; enviando: boolean; erro: string | null;
  aoConfirmar: (valor: number, motivo: string) => void; aoCancelar: () => void;
}) {
  const sangria = tipo === "sangria";
  return (
    <form
      className="flex flex-col gap-4"
      action={(dados) => {
        const valor = paraNumero(String(dados.get("valor") ?? ""));
        if (valor === null || valor <= 0) return;
        aoConfirmar(valor, String(dados.get("motivo") ?? "").trim());
      }}
    >
      <p className="m-0 text-[13.5px] text-muted">
        {sangria
          ? "Registra dinheiro retirado fisicamente da gaveta. Não é uma despesa."
          : "Registra dinheiro adicionado fisicamente à gaveta. Não é uma receita."}
      </p>
      {erro ? <Aviso erro={erro} /> : null}
      <Input name="valor" label="Valor" inputMode="decimal" placeholder="0,00" required autoFocus />
      <Textarea name="motivo" label={sangria ? "Motivo (obrigatório)" : "Motivo (opcional)"} rows={3} required={sangria} />
      <Acoes enviando={enviando} rotulo={sangria ? "Confirmar sangria" : "Confirmar reforço"} aoCancelar={aoCancelar} />
    </form>
  );
}

type ConferenciaDoFechamento = {
  fechado: boolean;
  esperado: number;
  contado: number;
  diferenca: number;
  resumo: ResumoDeFechamento | null;
};

function FormularioDeFechamento({ erroExterno, aoErro, aoCancelar }: {
  erroExterno: string | null; aoErro: (erro: string | null) => void;
  aoCancelar: () => void;
}) {
  const [contadoTexto, setContadoTexto] = useState("");
  const [conferencia, setConferencia] = useState<ConferenciaDoFechamento | null>(null);
  const [conferindo, iniciarConferencia] = useTransition();
  const { imprimir, enviando, erro: erroDeImpressao } = useImprimirDocumento();
  useAvisarOperacaoEmVoo(conferindo);
  const contado = paraNumero(contadoTexto);
  const diferenca = conferencia?.diferenca ?? null;
  const precisaJustificar = diferenca !== null && diferenca !== 0;

  if (conferencia === null) {
    return (
      <form
        className="flex flex-col gap-4"
        action={() => {
          if (contado === null || contado < 0) return;
          aoErro(null);
          iniciarConferencia(async () => {
            const resultado = await iniciarFechamentoCego({ contado });
            if (!resultado.ok) return aoErro(resultado.erro);
            if (resultado.resumo === null) aoErro("Não foi possível carregar os totais por forma. A contagem foi registrada.");
            setConferencia({
              fechado: resultado.fechado,
              esperado: resultado.esperado,
              contado: resultado.contado,
              diferenca: resultado.diferenca,
              resumo: resultado.resumo,
            });
          });
        }}
      >
        <div className="rounded-12 border border-tib bg-ti p-3 text-[13px] text-tif">
          <p className="m-0 font-semibold">Conferência cega</p>
          <p className="m-0 mt-1">Conte o dinheiro da gaveta e informe o total. O valor esperado só será mostrado depois desta etapa.</p>
        </div>
        {erroExterno ? <Aviso erro={erroExterno} /> : null}
        <Input name="contado" label="Valor contado na gaveta" inputMode="decimal" placeholder="0,00" value={contadoTexto} onChange={(evento) => setContadoTexto(evento.target.value)} required autoFocus />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={conferindo || contado === null}>{conferindo ? "Conferindo…" : "Conferir contagem"}</Button>
          <Button type="button" variante="fantasma" onClick={aoCancelar}>Cancelar</Button>
        </div>
      </form>
    );
  }

  return (
    <form className="flex flex-col gap-4" action={(dados) => {
      if (contado === null || contado < 0) return;
      const justificativa = String(dados.get("justificativa") ?? "").trim();
      aoErro(null);
      iniciarConferencia(async () => {
        const resultado = await fecharCaixa({
          contado,
          ...(justificativa ? { justificativa } : {}),
        });
        if (!resultado.ok) return aoErro(resultado.erro);
        if (resultado.resumo === null) aoErro("Caixa fechado, mas não foi possível carregar os totais por forma.");
        setConferencia((anterior) => anterior === null ? anterior : {
          ...anterior,
          fechado: true,
          resumo: resultado.resumo ?? anterior.resumo,
        });
      });
    }}>
      <ResumoVisualDoFechamento conferencia={conferencia} />
      {conferencia.fechado ? (
        <p className="m-0 rounded-12 border border-tgb bg-tg p-3 text-[13.5px] font-semibold text-tgf">Contagem correta. O caixa foi fechado com sucesso.</p>
      ) : (
        <p className="m-0 rounded-12 border border-twb bg-tw p-3 text-[13.5px] font-semibold text-twf">Há {diferenca !== null && diferenca > 0 ? "sobra" : "falta"} de {formatBRL(Math.abs(diferenca ?? 0))}.</p>
      )}
      {erroExterno ? <Aviso erro={erroExterno} /> : null}
      {erroDeImpressao ? <Aviso erro={erroDeImpressao} /> : null}
      {precisaJustificar ? <Textarea name="justificativa" label="Justificativa da diferença" rows={3} required autoFocus /> : null}
      <div className="flex flex-wrap gap-2">
        {conferencia.fechado ? (
          <>
            <Button type="button" onClick={aoCancelar}>Concluir</Button>
            {conferencia.resumo ? (
              <Button
                type="button"
                variante="secundario"
                disabled={enviando}
                onClick={() => {
                  const resumo = conferencia.resumo;
                  if (resumo === null) return;
                  void imprimir((largura) =>
                    montarFechamentoDeCaixa(
                      {
                        data: new Date(`${resumo.data_operacional}T12:00:00`).toLocaleDateString("pt-BR"),
                        contado: conferencia.contado,
                        esperado: conferencia.esperado,
                        diferenca: conferencia.diferenca,
                        recebimentos: resumo.recebimentos_por_metodo.map((r) => ({ metodo: r.metodo, total: r.total })),
                        movimentos: {
                          fundoInicial: resumo.fundo_inicial,
                          reforcos: resumo.reforcos,
                          sangrias: resumo.sangrias,
                          despesas: resumo.despesas_pelo_caixa,
                          entradas: resumo.entradas_pelo_caixa,
                          estornos: resumo.estornos,
                          diferencasDeMotoboy: resumo.diferencas_de_motoboy ?? 0,
                        },
                        dinheiroForaDaGaveta: resumo.dinheiro_fora_da_gaveta,
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
          <Button type="submit" disabled={conferindo}>{conferindo ? "Fechando…" : "Fechar com justificativa"}</Button>
        )}
        {!conferencia.fechado ? <Button type="button" variante="fantasma" onClick={aoCancelar}>Cancelar</Button> : null}
      </div>
    </form>
  );
}

function ResumoVisualDoFechamento({
  conferencia,
}: {
  conferencia: ConferenciaDoFechamento;
}) {
  const { papel, espacoFinal, margemEsquerda } = useImpressoraDoAparelho();
  const espacoFinalMm = ESPACO_FINAL_MM[espacoFinal];
  const margemEsquerdaMm = MARGEM_ESQUERDA_MM[margemEsquerda];
  const resumo = conferencia.resumo;
  return (
    <div id="resumo-impressao-fechamento" className="flex flex-col gap-3 bg-surface">
      <div className="hidden text-center font-mono text-[11px] text-black print:block">
        <p className="m-0 text-[13px] font-bold">PIZZARIA SHALON</p>
        <p className="m-0">FECHAMENTO DE CAIXA</p>
        {resumo ? <p className="m-0">Data {new Date(`${resumo.data_operacional}T12:00:00`).toLocaleDateString("pt-BR")}</p> : null}
      </div>

      <div className="rounded-12 border border-border-shalon bg-elev p-3 print:rounded-none print:border-x-0 print:bg-white">
        <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-muted print:text-black">
          Dinheiro da gaveta
        </p>
        <ParDeDados chave="Valor contado" valor={formatBRL(conferencia.contado)} />
        <ParDeDados chave="Valor esperado" valor={formatBRL(conferencia.esperado)} />
        <ParDeDados
          chave="Diferença"
          valor={
            <strong className={conferencia.diferenca === 0 ? "text-tgf print:text-black" : "text-tdf print:text-black"}>
              {formatBRL(conferencia.diferenca)}
            </strong>
          }
        />
      </div>

      {resumo ? (
        <>
          <div className="rounded-12 border border-border-shalon p-3 print:rounded-none print:border-x-0">
            <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-muted print:text-black">
              Recebimentos por forma
            </p>
            {resumo.recebimentos_por_metodo.length > 0 ? (
              resumo.recebimentos_por_metodo.map((recebimento) => (
                <ParDeDados
                  key={`${recebimento.metodo}-${recebimento.familia}`}
                  chave={recebimento.metodo}
                  valor={formatBRL(recebimento.total)}
                />
              ))
            ) : (
              <p className="m-0 text-[13px] text-muted print:text-black">Nenhum recebimento nesta sessão.</p>
            )}
          </div>

          <div className="rounded-12 border border-border-shalon p-3 print:rounded-none print:border-x-0">
            <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-muted print:text-black">
              Movimentos da sessão
            </p>
            <ParDeDados chave="Fundo inicial" valor={formatBRL(resumo.fundo_inicial)} />
            <ParDeDados chave="Reforços" valor={formatBRL(resumo.reforcos)} />
            <ParDeDados chave="Sangrias" valor={formatBRL(resumo.sangrias)} />
            <ParDeDados chave="Despesas pelo caixa" valor={formatBRL(resumo.despesas_pelo_caixa)} />
            <ParDeDados chave="Entradas pelo caixa" valor={formatBRL(resumo.entradas_pelo_caixa)} />
            <ParDeDados chave="Estornos" valor={formatBRL(resumo.estornos)} />
            {/* Falta ou sobra já justificada no acerto do motoboy (0144):
                aparece aqui para o fechamento não cobrar de novo. */}
            {(resumo.diferencas_de_motoboy ?? 0) !== 0 ? (
              <ParDeDados
                chave="Diferenças de motoboy"
                valor={formatBRL(resumo.diferencas_de_motoboy)}
              />
            ) : null}
          </div>

          {resumo.dinheiro_fora_da_gaveta > 0 ? (
            <p className="m-0 rounded-12 border border-twb bg-tw p-3 text-[13px] font-semibold text-twf print:rounded-none print:border-x-0 print:bg-white print:text-black">
              Dinheiro fora da gaveta: {formatBRL(resumo.dinheiro_fora_da_gaveta)}
            </p>
          ) : null}
        </>
      ) : null}

      <style>{`
        @media print {
          @page { size: ${papel}mm auto; margin: 0; }
          body * { visibility: hidden !important; }
          #resumo-impressao-fechamento,
          #resumo-impressao-fechamento * { visibility: visible !important; }
          /* A térmica deixa traço fino apagado: tudo em negrito e preto puro. */
          #resumo-impressao-fechamento, #resumo-impressao-fechamento * {
            font-weight: 700 !important;
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #resumo-impressao-fechamento {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            /* Área que a impressora alcança (AREA_UTIL_MM): na largura do papel
               os valores, à direita, eram cortados. */
            width: ${AREA_UTIL_MM[papel]}mm !important;
            padding: 2mm 0 1mm ${margemEsquerdaMm}mm !important;
            box-sizing: border-box !important;
            color: #000 !important;
            font-family: ui-monospace, monospace !important;
            font-size: 11px !important;
          }
          /* Termina num ponto depois do espaço: o driver da térmica descarta papel
             branco no fim e cortava o QR (ver imprimir.ts). */
          #resumo-impressao-fechamento::after {
            content: ".";
            display: block;
            padding-top: ${espacoFinalMm}mm;
            text-align: center;
            font-size: 8px;
            line-height: 1;
            visibility: visible !important;
          }
        }
      `}</style>
    </div>
  );
}

function Acoes({ enviando, rotulo, aoCancelar }: { enviando: boolean; rotulo: string; aoCancelar: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={enviando}>{enviando ? "Registrando…" : rotulo}</Button>
      <Button type="button" variante="fantasma" onClick={aoCancelar}>Cancelar</Button>
    </div>
  );
}
