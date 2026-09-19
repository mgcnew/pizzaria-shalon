import Link from "next/link";
import { StatusBadge } from "@/ui/components";
import { formatBRL } from "@/lib/format";
import { rotuloInterno } from "@/domain/pedidos/estados";
import type { PedidoNaFila } from "@/application/pedidos/tipos";
import { AcoesDoPedido } from "./AcoesDoPedido";

/**
 * Um pedido na fila.
 *
 * Desenhado para ser lido de relance no balcão: número grande, modalidade
 * em texto (não só em cor, CLAUDE.md §38), o que está travando e as ações
 * possíveis ali mesmo — sem precisar abrir o detalhe para aceitar.
 */
export function CartaoPedido({ pedido, hora }: { pedido: PedidoNaFila; hora: string }) {
  const estado = rotuloInterno(pedido.status);

  const travas = [
    pedido.aguarda_pix ? "Pix não confirmado" : null,
    pedido.aguarda_aprovacao_entrega ? "Entrega não aprovada" : null,
    pedido.aguarda_cliente ? "Alteração aguardando o cliente" : null,
  ].filter((t): t is string => t !== null);

  return (
    <article className="rounded-16 border border-border-shalon bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/admin/pedidos/${pedido.id}`}
            className="font-display text-[20px] font-extrabold text-ink no-underline"
          >
            #{pedido.numero}
          </Link>
          <p className="m-0 text-[14px] text-ink-2">{pedido.cliente}</p>
          <p className="m-0 text-[12.5px] text-muted">
            {hora} · {pedido.itens} {pedido.itens === 1 ? "item" : "itens"}
            {pedido.origem !== "shalon_link" ? ` · ${pedido.origem}` : ""}
          </p>
        </div>

        <div className="flex flex-col items-end gap-[6px]">
          <StatusBadge tom={estado.tom} pulsante={pedido.status === "waiting_store_confirmation"}>
            {estado.rotulo}
          </StatusBadge>
          <span className="rounded-pill border border-border-shalon px-[10px] py-[3px] text-[12px] font-semibold text-ink">
            {pedido.modalidade === "delivery" ? "Entrega" : "Retirada"}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13.5px] text-ink-2">
          {pedido.forma_pagamento ?? "—"}
          {pedido.troco !== null ? ` · troco ${formatBRL(pedido.troco)}` : ""}
        </span>
        <span className="font-display text-[18px] font-extrabold tabular-nums text-ink">
          {formatBRL(pedido.total)}
        </span>
      </div>

      {travas.length > 0 ? (
        <ul className="m-0 mt-2 list-none p-0">
          {travas.map((t) => (
            <li
              key={t}
              className="mt-1 rounded-10 bg-tw px-3 py-[6px] text-[12.5px] font-semibold text-twf"
            >
              {t}
            </li>
          ))}
        </ul>
      ) : null}

      {pedido.observacao ? (
        <p className="m-0 mt-2 rounded-10 bg-elev px-3 py-2 text-[13px] italic text-ink-2">
          “{pedido.observacao}”
        </p>
      ) : null}

      <div className="mt-3">
        <AcoesDoPedido pedidoId={pedido.id} acoes={pedido.acoes} compacto />
      </div>
    </article>
  );
}
