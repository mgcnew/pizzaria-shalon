"use client";

import { useState, useTransition } from "react";
import { deixarParaPagarDepois, desfazerFiado } from "@/application/fiado/acoes";

/**
 * Fiado do pedido (D-2026-10-17-153).
 *
 * "Pagar depois" não registra pagamento nem mexe no caixa: marca que o valor
 * ficou em aberto por decisão da loja. Quando o cliente pagar, o recebimento
 * de sempre (logo abaixo) entra no caixa aberto daquele dia.
 */
const quando = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function FiadoDoPedido({
  pedidoId,
  fiado,
  pago,
  podeFiado,
  temCliente,
  encerradoSemVenda,
}: {
  pedidoId: string;
  fiado: { em: string; por: string | null; observacao: string | null } | null;
  pago: boolean;
  podeFiado: boolean;
  temCliente: boolean;
  /** Cancelado ou rejeitado: não há o que cobrar. */
  encerradoSemVenda: boolean;
}) {
  const [abrindo, setAbrindo] = useState<"fiado" | "desfazer" | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (fiado && pago) {
    return <p className="m-0 mb-3 text-[13px] text-tgf">Fiado de {quando.format(new Date(fiado.em))} já pago.</p>;
  }

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const r =
        abrindo === "desfazer"
          ? await desfazerFiado(pedidoId, texto)
          : await deixarParaPagarDepois(pedidoId, texto);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setAbrindo(null);
      setTexto("");
    });
  }

  const formulario =
    abrindo !== null ? (
      <form
        className="mt-2 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!enviando) confirmar();
        }}
      >
        <label htmlFor={`fiado-${pedidoId}`} className="text-[13px] font-semibold text-ink">
          {abrindo === "desfazer" ? "Motivo para desfazer" : "Observação (opcional)"}
        </label>
        <input
          id={`fiado-${pedidoId}`}
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={300}
          placeholder={abrindo === "desfazer" ? "Ex.: marcado por engano" : "Ex.: paga sexta"}
          className="min-h-touch rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[14px] text-ink focus:border-brand-orange focus:outline-none"
        />
        {erro ? (
          <p role="alert" className="m-0 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf">
            {erro}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={enviando || (abrindo === "desfazer" && texto.trim().length < 3)}
            className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
          >
            {enviando ? "Salvando…" : abrindo === "desfazer" ? "Desfazer fiado" : "Confirmar fiado"}
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => {
              setAbrindo(null);
              setTexto("");
              setErro(null);
            }}
            className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink"
          >
            Voltar
          </button>
        </div>
      </form>
    ) : null;

  if (fiado) {
    return (
      <div className="mb-3 rounded-12 border border-twb bg-tw px-3 py-2.5 text-[13px] text-twf">
        <p className="m-0 font-bold">Fiado — pagamento para depois</p>
        <p className="m-0 mt-0.5">
          Desde {quando.format(new Date(fiado.em))}
          {fiado.por ? ` · autorizado por ${fiado.por}` : ""}
          {fiado.observacao ? ` · “${fiado.observacao}”` : ""}
        </p>
        <p className="m-0 mt-0.5 text-[12.5px]">
          Não entra no caixa até o cliente pagar. Quando ele pagar, registre o recebimento abaixo.
        </p>
        {podeFiado && abrindo === null ? (
          <button
            type="button"
            onClick={() => setAbrindo("desfazer")}
            className="mt-2 min-h-[36px] cursor-pointer rounded-10 border border-twb bg-surface px-3 text-[12.5px] font-semibold text-ink"
          >
            Desfazer fiado
          </button>
        ) : null}
        {formulario}
      </div>
    );
  }

  if (pago || encerradoSemVenda || !podeFiado) return null;

  if (!temCliente) {
    return (
      <p className="m-0 mb-3 text-[12.5px] text-muted">
        Fiado só para cliente identificado (com nome e WhatsApp).
      </p>
    );
  }

  return (
    <div className="mb-3">
      {abrindo === null ? (
        <button
          type="button"
          onClick={() => setAbrindo("fiado")}
          className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-dashed border-border-shalon bg-surface px-4 text-[13.5px] font-semibold text-ink hover:border-brand-orange"
        >
          Pagar depois (fiado)
        </button>
      ) : (
        <div className="rounded-12 border border-border-shalon bg-elev px-3 py-2.5">
          <p className="m-0 text-[13px] text-ink-2">
            O valor fica em aberto na conta do cliente e não entra no caixa de hoje. Quando ele
            pagar, o recebimento entra no caixa daquele dia.
          </p>
          {formulario}
        </div>
      )}
    </div>
  );
}
