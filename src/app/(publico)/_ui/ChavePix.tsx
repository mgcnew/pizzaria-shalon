"use client";

import { useState } from "react";

/**
 * Chave Pix do pedido.
 *
 * Copiar é o único gesto que importa aqui, e ele precisa funcionar sem área
 * de transferência também — em navegador que bloqueia, a chave continua
 * visível e selecionável.
 *
 * V1 não concilia Pix (CLAUDE.md §23): nada nesta tela marca o pedido como
 * pago. Quem confirma é a pizzaria.
 */
export function ChavePix({ chave, tipo }: { chave: string; tipo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(chave);
      setCopiado(true);
    } catch {
      // Sem área de transferência a chave segue na tela, para copiar à mão.
      setCopiado(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <code className="break-all rounded-10 bg-surface px-3 py-2 text-[14px] text-ink">
        {chave}
      </code>
      <button
        type="button"
        onClick={copiar}
        className="inline-flex min-h-touch cursor-pointer items-center rounded-11 border-[1.5px] border-border-shalon bg-surface px-[14px] text-[13.5px] font-semibold text-ink"
      >
        {copiado ? "Chave copiada" : `Copiar chave ${tipo}`}
      </button>
    </div>
  );
}
