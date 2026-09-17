import type { ReactNode } from "react";

/**
 * Badge — vitrine "Badge · Chip · StatusBadge" do design aprovado.
 *
 * `destaque`      → pill amarelo ("Mais pedido")
 * `promocao`      → retângulo vermelho claro ("Promoção")
 * `indisponivel`  → retângulo neutro ("Indisponível hoje")
 * `atencao`       → retângulo âmbar (usado no administrativo)
 */

type Tom = "destaque" | "promocao" | "indisponivel" | "atencao";

const TONS: Record<Tom, string> = {
  destaque: "bg-brand-yellow text-ink rounded-pill",
  promocao: "bg-td text-tdf rounded-6",
  indisponivel: "bg-tn text-ink-2 rounded-6",
  atencao: "bg-tw text-twf rounded-6",
};

export function Badge({ tom = "destaque", children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span
      className={`inline-block px-[10px] py-[4px] text-[11px] font-bold uppercase tracking-[0.04em] ${TONS[tom]}`}
    >
      {children}
    </span>
  );
}
