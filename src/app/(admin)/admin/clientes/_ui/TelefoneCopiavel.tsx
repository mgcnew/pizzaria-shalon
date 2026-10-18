"use client";

import { useState } from "react";
import { formatarTelefone } from "@/lib/format";

/**
 * Telefone do cliente na lista, com botão de copiar (17/10/2026).
 *
 * Sem área de transferência (navegador bloqueou), o número continua na tela
 * para selecionar à mão.
 */
export function TelefoneCopiavel({ telefone }: { telefone: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(telefone.replace(/\D/g, ""));
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="tabular-nums text-ink">{formatarTelefone(telefone)}</span>
      <button
        type="button"
        onClick={copiar}
        aria-label={copiado ? "Telefone copiado" : `Copiar telefone ${telefone}`}
        title={copiado ? "Copiado" : "Copiar"}
        className={[
          "flex size-8 cursor-pointer items-center justify-center rounded-10 border-0 bg-transparent transition-colors",
          copiado ? "text-tgf" : "text-muted hover:bg-elev hover:text-ink",
        ].join(" ")}
      >
        {copiado ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="size-[15px]">
            <path d="m5 12 5 5 9-10" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[15px]">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" />
          </svg>
        )}
      </button>
    </span>
  );
}
