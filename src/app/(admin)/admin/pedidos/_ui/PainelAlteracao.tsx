"use client";

import { useState, useTransition } from "react";
import { formatBRL } from "@/lib/format";
import { retirarAlteracao } from "@/application/pedidos/acoes";
import type { RevisaoDoPedido } from "@/application/pedidos/tipos";

/**
 * Proposta de alteração aberta antes do "Editar pedido" (D-2026-11-01-182).
 *
 * Não nascem mais propostas novas: a edição vale na hora (RN-ALT-009). Este
 * painel só existe para a que ainda espera o cliente poder ser resolvida.
 */
export function PainelAlteracao({
  pedidoId,
  podeRetirar,
  revisaoAberta,
}: {
  pedidoId: string;
  podeRetirar: boolean;
  revisaoAberta: RevisaoDoPedido;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  return (
    <div className="rounded-12 border border-twb bg-tw p-3">
      <p className="m-0 text-[14px] font-bold text-twf">Alteração aguardando o cliente</p>
      <p className="m-0 mt-1 text-[13.5px] text-ink-2">{revisaoAberta.motivo}</p>
      <p className="m-0 mt-1 text-[13.5px] text-ink-2">
        Total: {formatBRL(revisaoAberta.total_antes)} →{" "}
        <strong>{formatBRL(revisaoAberta.total_depois)}</strong>
      </p>
      <p className="m-0 mt-2 text-[12.5px] text-muted">
        O pedido não avança enquanto o cliente não responder pelo link de acompanhamento. Para
        editar agora, retire a proposta.
      </p>

      {podeRetirar ? (
        <button
          type="button"
          disabled={ocupado}
          onClick={() =>
            iniciar(async () => {
              const r = await retirarAlteracao(pedidoId);
              if (!r.ok) setErro(r.erro);
            })
          }
          className="mt-2 min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[13.5px] font-semibold text-ink"
        >
          Retirar a proposta
        </button>
      ) : null}

      {erro !== null ? (
        <p role="alert" className="m-0 mt-2 text-[13px] font-semibold text-tdf">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
