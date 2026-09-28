"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { estornarPagamento } from "@/application/caixa/acoes";
import { listarHistoricoDeVendas } from "@/application/pdv/acoes";
import type { VendaNoHistoricoDoPdv } from "@/application/pdv/tipos";
import { formatBRL } from "@/lib/format";
import { Button, Input, StatusBadge } from "@/ui/components";

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
                <div className="overflow-hidden rounded-12 border border-border-shalon">
                  <div className="hidden grid-cols-[90px_1fr_1fr_130px_125px] gap-3 bg-elev px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted lg:grid">
                    <span>Venda</span><span>Cliente / origem</span><span>Pagamento</span>
                    <span>Recebido</span><span className="text-right">Ação</span>
                  </div>
                  <ul className="m-0 list-none p-0">
                    {filtradas.map((venda) => {
                      const estornada = venda.situacao_pagamento === "reversed";
                      return (
                        <li
                          key={venda.pedido_id}
                          className="grid gap-2 border-b border-border-shalon bg-surface px-3 py-3 last:border-b-0 lg:grid-cols-[90px_1fr_1fr_130px_125px] lg:items-center lg:gap-3"
                        >
                          <div>
                            <strong className="text-[14px] text-ink">#{venda.numero}</strong>
                            <p className="m-0 text-[11.5px] text-muted">{formatarData(venda.pago_em)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="m-0 truncate text-[13.5px] font-semibold text-ink">{venda.cliente || "Balcão"}</p>
                            <p className="m-0 text-[12px] text-muted">{ROTULOS_ORIGEM[venda.origem] ?? venda.origem}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="m-0 truncate text-[13px] text-ink-2">{venda.formas || "—"}</p>
                            <StatusBadge tom={estornada ? "neutro" : "sucesso"}>
                              {estornada ? "Estornado" : "Pago"}
                            </StatusBadge>
                          </div>
                          <div>
                            <strong className={estornada ? "text-[14px] tabular-nums text-muted line-through" : "text-[14px] tabular-nums text-ink"}>
                              {formatBRL(venda.valor_pago)}
                            </strong>
                            {estornada ? <p className="m-0 text-[11.5px] text-muted">{formatarData(venda.estornado_em)}</p> : null}
                          </div>
                          <div className="lg:text-right">
                            {!estornada && venda.pode_estornar && podeEstornar ? (
                              <Button variante="perigo" tamanho="sm" onClick={() => {
                                setSelecionada(venda);
                                setMotivo("");
                                setErro(null);
                              }}>
                                Estornar
                              </Button>
                            ) : !estornada && !podeEstornar ? (
                              <span className="text-[11.5px] text-muted">Sem permissão</span>
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
        </div>
      ) : null}
    </>
  );
}
