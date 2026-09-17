import type { ReactNode } from "react";

/**
 * StatusBadge — pill com ponto colorido, usado no público (loja aberta/fechada)
 * e no administrativo (status de pedido).
 *
 * As cinco famílias tonais vêm do design: sucesso, atenção, perigo, info e
 * neutro. O texto NUNCA depende só da cor: o rótulo sempre acompanha o ponto
 * (CLAUDE.md §38).
 *
 * Fase 1: componente de apresentação. Não decide status — apenas exibe.
 */

type Tom = "sucesso" | "atencao" | "perigo" | "info" | "neutro";

const TONS: Record<Tom, { caixa: string; ponto: string }> = {
  sucesso: { caixa: "bg-tg text-tgf border-tgb", ponto: "bg-tgf" },
  atencao: { caixa: "bg-tw text-twf border-twb", ponto: "bg-twf" },
  perigo: { caixa: "bg-td text-tdf border-tdb", ponto: "bg-tdf" },
  info: { caixa: "bg-ti text-tif border-tib", ponto: "bg-tif" },
  neutro: { caixa: "bg-tn text-tnf border-tnb", ponto: "bg-muted" },
};

export function StatusBadge({
  tom = "neutro",
  pulsante = false,
  children,
}: {
  tom?: Tom;
  pulsante?: boolean;
  children: ReactNode;
}) {
  const t = TONS[tom];
  return (
    <span
      className={`inline-flex items-center gap-[7px] rounded-pill border px-[11px] py-[5px] text-[12.5px] font-semibold ${t.caixa}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${t.ponto} ${pulsante ? "animate-shalon-pulse" : ""}`}
      />
      {children}
    </span>
  );
}
