"use client";

import { useState, useTransition } from "react";
import { executarComando } from "@/application/pedidos/acoes";
import type { AcaoDoPedido } from "@/application/pedidos/tipos";

/**
 * Os comandos da máquina de estados, como botões.
 *
 * A lista vem PRONTA do servidor (`acoes_do_pedido`), já filtrada por
 * permissão e por estado. Este componente não sabe — e não deve saber — que
 * "aceitar" só vale em `waiting_store_confirmation`: essa regra vive no
 * banco, e duplicá-la aqui criaria uma segunda verdade (CLAUDE.md §21).
 *
 * Comando destrutivo pede motivo antes, e o motivo é obrigatório de verdade:
 * o banco recusa sem ele (RN-STATE-009 e RN-STATE-010).
 */
export function AcoesDoPedido({
  pedidoId,
  acoes,
  compacto = false,
}: {
  pedidoId: string;
  acoes: AcaoDoPedido[];
  compacto?: boolean;
}) {
  const [pedindoMotivo, setPedindoMotivo] = useState<AcaoDoPedido | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [executando, iniciar] = useTransition();

  function disparar(acao: AcaoDoPedido, motivoInformado?: string) {
    setErro(null);
    iniciar(async () => {
      const r = await executarComando({
        pedido_id: pedidoId,
        comando: acao.comando,
        motivo: motivoInformado,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setPedindoMotivo(null);
      setMotivo("");
    });
  }

  if (acoes.length === 0 && erro === null) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {acoes.map((acao) => (
          <button
            key={acao.comando}
            type="button"
            disabled={executando}
            onClick={() =>
              acao.exige_motivo ? setPedindoMotivo(acao) : disparar(acao)
            }
            className={[
              "min-h-touch cursor-pointer rounded-11 border-[1.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-60",
              compacto ? "px-3 text-[13px]" : "px-4 text-[14px]",
              acao.destrutivo
                ? "border-tdb bg-td text-tdf"
                : "border-transparent bg-cta text-cta-fg",
            ].join(" ")}
          >
            {acao.rotulo}
          </button>
        ))}
      </div>

      {pedindoMotivo !== null ? (
        <div className="rounded-12 border border-border-shalon bg-elev p-3">
          <label
            htmlFor={`motivo-${pedidoId}`}
            className="mb-[6px] block text-[13.5px] font-semibold text-ink"
          >
            Motivo — {pedindoMotivo.rotulo}
          </label>
          <textarea
            id={`motivo-${pedidoId}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={400}
            className="w-full resize-y rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 py-2 text-[14px] text-ink focus:border-brand-orange focus:outline-none"
          />
          <p className="m-0 mt-1 text-[12px] text-muted">
            Fica registrado no histórico do pedido e na auditoria.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={executando || motivo.trim().length < 3}
              onClick={() => disparar(pedindoMotivo, motivo.trim())}
              className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
            >
              {executando ? "Registrando…" : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPedindoMotivo(null);
                setMotivo("");
              }}
              className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink"
            >
              Voltar
            </button>
          </div>
        </div>
      ) : null}

      {erro !== null ? (
        <p
          role="alert"
          className="m-0 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf"
        >
          {erro}
        </p>
      ) : null}
    </div>
  );
}
