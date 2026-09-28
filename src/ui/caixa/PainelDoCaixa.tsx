"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
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
}: {
  estado: EstadoVisivelDoCaixa;
  tentativa: string;
  aoRegistrarComandos?: (comandos: ComandosDoCaixa | null) => void;
  venda: { quantidade: number; total: number };
  aoConcluirVenda: () => void;
}) {
  const [operacao, setOperacao] = useState<Operacao>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const chave = useRef(tentativa);

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
        <ModalDeCaixa titulo={tituloDaOperacao(operacao)} aoFechar={() => setOperacao(null)}>
          {operacao === "abrir" ? (
            <FormularioDeAbertura
              enviando={enviando}
              erro={erro}
              aoConfirmar={(fundo) => executar(() => abrirCaixa({ fundo }))}
              aoCancelar={() => setOperacao(null)}
            />
          ) : null}

          {operacao === "reforco" || operacao === "sangria" ? (
            <FormularioDeMovimento
              tipo={operacao}
              enviando={enviando}
              erro={erro}
              aoCancelar={() => setOperacao(null)}
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
              enviando={enviando}
              erroExterno={erro}
              aoErro={setErro}
              aoCancelar={() => setOperacao(null)}
              aoConfirmar={(contado, justificativa) =>
                executar(() =>
                  fecharCaixa({ contado, ...(justificativa ? { justificativa } : {}) }),
                )
              }
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

function FormularioDeFechamento({ enviando, erroExterno, aoErro, aoCancelar, aoConfirmar }: {
  enviando: boolean; erroExterno: string | null; aoErro: (erro: string | null) => void;
  aoCancelar: () => void; aoConfirmar: (contado: number, justificativa: string) => void;
}) {
  const [contadoTexto, setContadoTexto] = useState("");
  const [conferencia, setConferencia] = useState<{
    fechado: boolean;
    esperado: number;
    contado: number;
    diferenca: number;
  } | null>(null);
  const [conferindo, iniciarConferencia] = useTransition();
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
            setConferencia({
              fechado: resultado.fechado,
              esperado: resultado.esperado,
              contado: resultado.contado,
              diferenca: resultado.diferenca,
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
      aoConfirmar(contado, String(dados.get("justificativa") ?? "").trim());
    }}>
      <div className="rounded-12 border border-border-shalon bg-elev p-3">
        <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">Resultado da conferência</p>
        <ParDeDados chave="Valor contado" valor={formatBRL(conferencia.contado)} />
        <ParDeDados chave="Valor esperado" valor={formatBRL(conferencia.esperado)} />
        <ParDeDados chave="Diferença" valor={<strong className={diferenca === 0 ? "text-tgf" : "text-tdf"}>{formatBRL(diferenca ?? 0)}</strong>} />
      </div>
      {conferencia.fechado ? (
        <p className="m-0 rounded-12 border border-tsb bg-ts p-3 text-[13.5px] font-semibold text-tsf">Contagem correta. O caixa foi fechado com sucesso.</p>
      ) : (
        <p className="m-0 rounded-12 border border-twb bg-tw p-3 text-[13.5px] font-semibold text-twf">Há {diferenca !== null && diferenca > 0 ? "sobra" : "falta"} de {formatBRL(Math.abs(diferenca ?? 0))}.</p>
      )}
      {erroExterno ? <Aviso erro={erroExterno} /> : null}
      {precisaJustificar ? <Textarea name="justificativa" label="Justificativa da diferença" rows={3} required autoFocus /> : null}
      <div className="flex flex-wrap gap-2">
        {conferencia.fechado ? (
          <Button type="button" onClick={aoCancelar}>Concluir</Button>
        ) : (
          <Button type="submit" disabled={enviando}>{enviando ? "Fechando…" : "Fechar com justificativa"}</Button>
        )}
        {!conferencia.fechado ? <Button type="button" variante="fantasma" onClick={aoCancelar}>Cancelar</Button> : null}
      </div>
    </form>
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
