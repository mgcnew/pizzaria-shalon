"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  resumoProducaoDoPedido,
  type ResumoProducao,
} from "@/application/pedidos/resumoProducao";
import { usePopoverFixo } from "@/ui/hooks/usePopoverFixo";

/** Consulta curta sob demanda; não torna a fila inteira mais pesada. */
export function InfoProducaoPedido({ pedidoId, numero }: { pedidoId: string; numero: number }) {
  const id = useId();
  const botao = useRef<HTMLButtonElement>(null);
  const buscando = useRef(false);
  const fechamento = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [resumo, setResumo] = useState<ResumoProducao | null>(null);
  const [falhou, setFalhou] = useState(false);
  const posicao = usePopoverFixo(botao, aberto, 280, 200, "inicio");

  useEffect(() => () => {
    if (fechamento.current) clearTimeout(fechamento.current);
  }, []);

  function cancelarFechamento() {
    if (fechamento.current) clearTimeout(fechamento.current);
    fechamento.current = null;
  }

  function fecharDepois() {
    cancelarFechamento();
    fechamento.current = setTimeout(() => setAberto(false), 140);
  }

  function abrir() {
    cancelarFechamento();
    setAberto(true);
    if (resumo || buscando.current) return;
    buscando.current = true;
    setCarregando(true);
    setFalhou(false);
    void resumoProducaoDoPedido(pedidoId).then((resultado) => {
      if (resultado) setResumo(resultado);
      else setFalhou(true);
    }).catch(() => setFalhou(true)).finally(() => {
      buscando.current = false;
      setCarregando(false);
    });
  }

  return (
    <>
      <button
        ref={botao}
        type="button"
        aria-label={`Ver itens de produção do pedido #${numero}`}
        aria-describedby={aberto ? id : undefined}
        onPointerEnter={abrir}
        onPointerLeave={fecharDepois}
        onFocus={abrir}
        onBlur={() => setAberto(false)}
        onClick={abrir}
        onKeyDown={(evento) => {
          if (evento.key === "Escape") setAberto(false);
        }}
        className="inline-flex h-8 w-8 shrink-0 cursor-help items-center justify-center rounded-full border border-border-shalon bg-surface text-[12px] font-bold text-ink-2 hover:border-brand-orange hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange"
      >
        i
      </button>
      {aberto && posicao ? createPortal(
        <div
          id={id}
          role="tooltip"
          style={posicao}
          onPointerEnter={cancelarFechamento}
          onPointerLeave={() => setAberto(false)}
          className="fixed z-[80] w-[min(280px,calc(100vw-16px))] overflow-y-auto rounded-12 border border-border-shalon bg-surface p-3 text-left shadow-[0_10px_28px_rgb(41_37_36/0.18)]"
        >
          <p className="m-0 text-[12px] font-bold text-ink">Pedido #{numero} · produção</p>
          {carregando ? <p className="m-0 mt-2 text-[12px] text-muted">Carregando itens…</p> : null}
          {falhou ? <p className="m-0 mt-2 text-[12px] text-muted">Não foi possível carregar. Passe novamente para tentar.</p> : null}
          {resumo && !resumo.exigeProducao ? (
            <p className="m-0 mt-2 text-[12px] text-muted">Este pedido não exige produção.</p>
          ) : null}
          {resumo?.exigeProducao ? (
            <>
              <p className="m-0 mt-1 text-[11px] text-muted">Itens da comanda</p>
              <ul className="m-0 mt-2 list-none space-y-2 p-0">
                {resumo.itens.map((item, indice) => (
                  <li key={indice} className="border-t border-border-shalon pt-2 first:border-0 first:pt-0">
                    <span className="block text-[12px] font-semibold text-ink">{item.quantidade}× {item.nome}</span>
                    {item.tamanho ? <span className="block text-[11px] text-muted">{item.tamanho}</span> : null}
                    {item.componentes.map((componente) => (
                      <span key={componente} className="block pl-2 text-[11px] text-ink-2">· {componente}</span>
                    ))}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>, document.body,
      ) : null}
    </>
  );
}
