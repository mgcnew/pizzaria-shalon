"use client";

import { useState } from "react";

/**
 * Compartilhar link — RN-LINK-001.
 *
 * Usa a Web Share API quando o aparelho oferece (o caso do celular, que é o
 * uso principal) e cai para copiar o endereço quando não há. Sem API e sem
 * área de transferência, mostra o link para copiar à mão — em vez de um
 * botão que não faz nada.
 *
 * Só sai daqui o endereço público da página. Nenhum id interno, nenhum
 * parâmetro de origem, nenhum dado do cliente.
 */
export function Compartilhar({ titulo, caminho }: { titulo: string; caminho: string }) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "manual">("parado");
  const [link, setLink] = useState("");

  async function compartilhar() {
    const url = `${window.location.origin}${caminho}`;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: titulo, url });
        return;
      } catch {
        // Cancelar o compartilhamento não é erro; segue para a cópia.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setEstado("copiado");
      return;
    } catch {
      setLink(url);
      setEstado("manual");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={compartilhar}
        className="inline-flex min-h-touch items-center gap-2 rounded-pill border-[1.5px] border-border-shalon bg-surface px-[14px] text-[13px] font-semibold text-ink-2"
      >
        <span aria-hidden="true">↗</span>
        {estado === "copiado" ? "Link copiado" : "Compartilhar"}
      </button>
      {estado === "manual" ? (
        <p className="m-0 break-all text-[12px] text-muted">{link}</p>
      ) : null}
    </div>
  );
}
