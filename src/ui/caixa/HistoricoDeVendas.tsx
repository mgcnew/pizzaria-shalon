"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { estornarPagamento } from "@/application/caixa/acoes";
import {
  listarHistoricoDeVendas,
  obterItensDaSegundaVia,
  type ItemDaSegundaVia,
} from "@/application/pdv/acoes";
import type { VendaNoHistoricoDoPdv } from "@/application/pdv/tipos";
import { formatBRL } from "@/lib/format";
import { Button, Input, StatusBadge } from "@/ui/components";
import { useImprimirDocumento } from "@/ui/impressao/useImprimirDocumento";
import { ConviteDoApp } from "@/ui/impressao/ConviteDoApp";
import { CONVITE } from "@/ui/impressao/convite";
import { AREA_UTIL_MM } from "@/ui/impressao/imprimir";
import { montarCupomDeVenda } from "@/domain/impressao/cupons";

const ROTULOS_ORIGEM: Record<string, string> = {
  counter: "PDV / Balcão",
  shalon_link: "Cardápio",
  whatsapp: "WhatsApp",
  phone: "Telefone",
  ifood: "iFood",
  other: "Outro",
};

function formatarData(valor: string | null) {
  if (!valor) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(valor));
}

export function HistoricoDeVendas({ podeEstornar }: { podeEstornar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [vendas, setVendas] = useState<VendaNoHistoricoDoPdv[]>([]);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<VendaNoHistoricoDoPdv | null>(null);
  const [segundaVia, setSegundaVia] = useState<{
    venda: VendaNoHistoricoDoPdv;
    itens: ItemDaSegundaVia[];
  } | null>(null);
  const [preparandoVia, setPreparandoVia] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [carregando, iniciar] = useTransition();
  const painel = useRef<HTMLDivElement>(null);

  async function consultar() {
    const resultado = await listarHistoricoDeVendas(150);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return false;
    }
    setVendas(resultado.vendas);
    return true;
  }

  function abrir() {
    setAberto(true);
    setErro(null);
    setMensagem(null);
    iniciar(async () => { await consultar(); });
  }

  function fechar() {
    if (carregando) return;
    setAberto(false);
    setSelecionada(null);
    setSegundaVia(null);
    setMotivo("");
  }

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    painel.current?.focus();
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflow;
      anterior?.focus();
    };
  }, [aberto]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return vendas;
    return vendas.filter((venda) =>
      [
        String(venda.numero),
        venda.cliente ?? "",
        venda.formas,
        ROTULOS_ORIGEM[venda.origem] ?? venda.origem,
      ].some((valor) => valor.toLocaleLowerCase("pt-BR").includes(termo)),
    );
  }, [busca, vendas]);

  function confirmarEstorno() {
    if (selecionada === null || motivo.trim().length < 3) return;
    setErro(null);
    setMensagem(null);
    iniciar(async () => {
      const resultado = await estornarPagamento({
        pedido_id: selecionada.pedido_id,
        motivo: motivo.trim(),
      });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      const numero = selecionada.numero;
      setSelecionada(null);
      setMotivo("");
      setMensagem(`Pagamento da venda #${numero} estornado com sucesso.`);
      await consultar();
    });
  }

  async function prepararSegundaVia(venda: VendaNoHistoricoDoPdv) {
    setErro(null);
    setMensagem(null);
    setPreparandoVia(venda.pedido_id);
    const resultado = await obterItensDaSegundaVia(venda.pedido_id);
    setPreparandoVia(null);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setSegundaVia({ venda, itens: resultado.itens });
  }

  return (
    <>
      <Button variante="secundario" tamanho="sm" onClick={abrir}>
        Histórico de vendas
      </Button>

      {aberto ? (
        <div
          className="fixed inset-0 z-[85] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) fechar();
          }}
        >
          <div
            ref={painel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-historico-vendas"
            tabIndex={-1}
            className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-20 border border-border-shalon bg-surface shadow-2xl outline-none sm:max-w-[1040px] sm:rounded-20"
          >
            <header className="flex items-start justify-between gap-3 border-b border-border-shalon px-4 py-4 sm:px-5">
              <div>
                <h2 id="titulo-historico-vendas" className="m-0 font-display text-[20px] font-bold text-ink">
                  Histórico de vendas
                </h2>
                <p className="m-0 mt-1 text-[12.5px] text-muted">
                  Pagamentos do PDV e de Pedidos. Os 150 recebimentos mais recentes.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar histórico"
                onClick={fechar}
                className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-shalon bg-elev text-[20px] text-ink"
              >
                ×
              </button>
            </header>

            <div className="border-b border-border-shalon px-4 py-3 sm:px-5">
              <label htmlFor="buscar-venda-paga" className="sr-only">Buscar venda</label>
              <input
                id="buscar-venda-paga"
                type="search"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Buscar por pedido, cliente, origem ou pagamento"
                className="min-h-touch w-full rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[14px] text-ink focus:border-brand-orange focus:outline-none"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {erro ? (
                <p role="alert" className="m-0 mb-3 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf">
                  {erro}
                </p>
              ) : null}
              {mensagem ? (
                <p role="status" className="m-0 mb-3 rounded-10 bg-tg px-3 py-2 text-[13px] font-semibold text-tgf">
                  {mensagem}
                </p>
              ) : null}

              {carregando && vendas.length === 0 ? (
                <p className="m-0 py-10 text-center text-[13.5px] text-muted">Carregando vendas…</p>
              ) : filtradas.length === 0 ? (
                <p className="m-0 py-10 text-center text-[13.5px] text-muted">
                  Nenhuma venda encontrada.
                </p>
              ) : (
                <div className="lg:overflow-hidden lg:rounded-12 lg:border lg:border-border-shalon">
                  <div className="hidden grid-cols-[90px_1fr_1fr_130px_125px] gap-3 bg-elev px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted lg:grid">
                    <span>Venda</span><span>Cliente / origem</span><span>Pagamento</span>
                    <span>Recebido</span><span className="text-right">Ação</span>
                  </div>
                  <ul className="m-0 grid list-none gap-3 p-0 lg:block">
                    {filtradas.map((venda) => {
                      const estornada = venda.situacao_pagamento === "reversed";
                      return (
                        <li
                          key={venda.pedido_id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 rounded-14 border border-border-shalon bg-surface p-4 shadow-[0_5px_18px_rgb(41_37_36/0.05)] lg:grid-cols-[90px_1fr_1fr_130px_210px] lg:items-center lg:gap-3 lg:rounded-none lg:border-0 lg:border-b lg:px-3 lg:py-3 lg:shadow-none lg:last:border-b-0"
                        >
                          <div className="col-start-1 row-start-1 lg:col-auto lg:row-auto">
                            <strong className="text-[14px] text-ink">#{venda.numero}</strong>
                            <p className="m-0 text-[11.5px] text-muted">{formatarData(venda.pago_em)}</p>
                          </div>
                          <div className="col-start-1 row-start-2 min-w-0 lg:col-auto lg:row-auto">
                            <p className="m-0 truncate text-[13.5px] font-semibold text-ink">{venda.cliente || "Balcão"}</p>
                            <p className="m-0 text-[12px] text-muted">{ROTULOS_ORIGEM[venda.origem] ?? venda.origem}</p>
                          </div>
                          <div className="col-start-2 row-start-2 min-w-0 text-right lg:col-auto lg:row-auto lg:text-left">
                            <p className="m-0 truncate text-[13px] text-ink-2">{venda.formas || "—"}</p>
                            <StatusBadge tom={estornada ? "neutro" : "sucesso"}>
                              {estornada ? "Estornado" : "Pago"}
                            </StatusBadge>
                          </div>
                          <div className="col-start-2 row-start-1 text-right lg:col-auto lg:row-auto lg:text-left">
                            <strong className={estornada ? "text-[14px] tabular-nums text-muted line-through" : "text-[14px] tabular-nums text-ink"}>
                              {formatBRL(venda.valor_pago)}
                            </strong>
                            {estornada ? <p className="m-0 text-[11.5px] text-muted">{formatarData(venda.estornado_em)}</p> : null}
                          </div>
                          <div className="col-span-2 flex flex-wrap justify-end gap-2 border-t border-border-shalon pt-3 lg:col-auto lg:row-auto lg:border-0 lg:pt-0">
                            <Button
                              variante="secundario"
                              tamanho="sm"
                              disabled={preparandoVia === venda.pedido_id}
                              onClick={() => { void prepararSegundaVia(venda); }}
                            >
                              {preparandoVia === venda.pedido_id ? "Preparando…" : "Imprimir 2ª via"}
                            </Button>
                            {!estornada && venda.pode_estornar && podeEstornar ? (
                              <Button variante="perigo" tamanho="sm" onClick={() => {
                                setSelecionada(venda);
                                setMotivo("");
                                setErro(null);
                              }}>
                                Estornar
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {selecionada ? (
              <div className="border-t border-border-shalon bg-elev px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 mb-2 text-[13px] font-semibold text-danger">
                      Estornar venda #{selecionada.numero} · {formatBRL(selecionada.valor_pago)}
                    </p>
                    <Input
                      label="Motivo do estorno"
                      value={motivo}
                      onChange={(evento) => setMotivo(evento.target.value)}
                      placeholder="Ex.: devolução ao cliente"
                      autoFocus
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variante="perigo" tamanho="md" disabled={carregando || motivo.trim().length < 3} onClick={confirmarEstorno}>
                      {carregando ? "Estornando…" : "Confirmar estorno"}
                    </Button>
                    <Button variante="fantasma" tamanho="md" disabled={carregando} onClick={() => setSelecionada(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
                <p className="m-0 mt-2 text-[11.5px] text-muted">
                  O estorno abrange todas as formas confirmadas desta venda e gera os movimentos compensatórios necessários.
                </p>
              </div>
            ) : null}
          </div>

          {segundaVia ? (
            <PreviaSegundaVia
              venda={segundaVia.venda}
              itens={segundaVia.itens}
              aoFechar={() => setSegundaVia(null)}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function PreviaSegundaVia({
  venda,
  itens,
  aoFechar,
}: {
  venda: VendaNoHistoricoDoPdv;
  itens: ItemDaSegundaVia[];
  aoFechar: () => void;
}) {
  const { imprimir, enviando, erro: erroDeImpressao, papel } = useImprimirDocumento();
  const quantidade = itens.reduce((total, item) => total + item.quantidade, 0);
  const estornada = venda.situacao_pagamento === "reversed";

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      onKeyDown={(evento) => {
        if (evento.key !== "Escape") return;
        evento.stopPropagation();
        aoFechar();
      }}
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-segunda-via"
        className="max-h-[94dvh] w-full overflow-y-auto rounded-t-20 border border-border-shalon bg-surface p-4 shadow-2xl sm:max-w-[440px] sm:rounded-20 sm:p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3 print:hidden">
          <div>
            <h3 id="titulo-segunda-via" className="m-0 font-display text-[19px] font-bold text-ink">
              Segunda via do recibo
            </h3>
            <p className="m-0 mt-1 text-[12px] text-muted">Confira antes de enviar para a impressora de {papel} mm.</p>
          </div>
          <button
            type="button"
            aria-label="Fechar segunda via"
            onClick={aoFechar}
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-shalon bg-elev text-[20px] text-ink"
          >
            ×
          </button>
        </div>

        <div id="cupom-segunda-via" className={`mx-auto w-full ${papel === "80" ? "max-w-[80mm]" : "max-w-[58mm]"} bg-white p-[3mm] font-mono text-[10px] leading-[1.35] text-black shadow-[0_4px_18px_rgb(0_0_0/0.12)] print:shadow-none`}>
          <p className="m-0 text-center text-[12px] font-bold">PIZZARIA SHALON</p>
          <p className="m-0 text-center">COMPROVANTE NAO FISCAL</p>
          <p className="m-0 mt-1 text-center font-bold">*** SEGUNDA VIA ***</p>
          {estornada ? <p className="m-0 mt-1 border border-black p-1 text-center font-bold">PAGAMENTO ESTORNADO</p> : null}
          <div className="my-2 border-y border-dashed border-black py-1">
            <p className="m-0">VENDA #{venda.numero}</p>
            <p className="m-0">{formatarData(venda.pago_em)}</p>
            <p className="m-0">{venda.cliente || "Balcão"}</p>
          </div>
          {itens.map((item) => (
            <div key={item.linha} className="mb-1.5">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <span>{item.quantidade}x {item.nome}</span>
                <span>{formatBRL(item.total)}</span>
              </div>
              {item.detalhes.map((detalhe, indice) => (
                <p key={`${item.linha}-${indice}`} className="m-0 pl-2 text-[9px]">+ {detalhe}</p>
              ))}
            </div>
          ))}
          <div className="mt-2 border-t border-dashed border-black pt-1">
            <p className="m-0 flex justify-between"><span>{quantidade} item(ns)</span><strong>{formatBRL(venda.valor_pago)}</strong></p>
            <p className="m-0 flex justify-between gap-2"><span>Pagamento</span><span className="text-right">{venda.formas || "—"}</span></p>
          </div>
          <p className="mb-0 mt-3 text-center">Obrigado pela preferencia!</p>
          <ConviteDoApp />
        </div>

        <div className="mt-4 flex gap-2 print:hidden">
          <Button
            disabled={enviando}
            onClick={() =>
              void imprimir((largura) =>
                montarCupomDeVenda(
                  {
                    numero: venda.numero,
                    data: formatarData(venda.pago_em),
                    cliente: venda.cliente ?? "",
                    itens,
                    total: venda.valor_pago,
                    pagamento: venda.formas || "—",
                    segundaVia: true,
                    estornado: estornada,
                    convite: CONVITE,
                  },
                  largura,
                ),
              )
            }
            tamanho="md"
            className="flex-1"
          >
            {enviando ? "Enviando…" : `Imprimir em ${papel} mm`}
          </Button>
          <Button variante="secundario" onClick={aoFechar} tamanho="md">
            Fechar
          </Button>
        </div>
        {erroDeImpressao ? (
          <p role="alert" className="m-0 mt-2 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf print:hidden">
            {erroDeImpressao}
          </p>
        ) : null}
        <style>{`
          @media print {
            @page { size: ${papel}mm auto; margin: 0; }
            body * { visibility: hidden !important; }
            #cupom-segunda-via, #cupom-segunda-via * { visibility: visible !important; }
            /* A térmica deixa traço fino apagado: tudo em negrito e preto puro. */
            #cupom-segunda-via, #cupom-segunda-via * {
              font-weight: 700 !important;
              color: #000 !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            #cupom-segunda-via {
              position: absolute !important;
              inset: 0 auto auto 0 !important;
              /* Área que a impressora alcança, não a largura do papel: o valor fica à
                 direita e era cortado (AREA_UTIL_MM). */
              width: ${AREA_UTIL_MM[papel]}mm !important;
              max-width: ${AREA_UTIL_MM[papel]}mm !important;
              margin: 0 !important;
              padding: 2mm 0 6mm !important;
            }
          }
        `}</style>
      </section>
    </div>
  );
}
