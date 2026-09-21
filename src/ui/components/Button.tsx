import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Button — extraído da vitrine "Componentes › Button" do design aprovado.
 *
 * Variantes e medidas vêm do protótipo, não do padrão do Tailwind:
 *   primário    → fundo CTA (troca com o tema de acento), texto CTA
 *   destaque    → vermelho da marca, texto branco
 *   secundário  → transparente com borda de 1.5px
 *   fantasma    → sem borda e sem fundo
 *   perigo      → texto na cor danger, sem fundo
 *   desabilitado→ fundo #F1EBE3 (token --shalon-tn) e texto muted
 *
 * Alvo de toque mínimo de 44px em todos os tamanhos (CLAUDE.md §38).
 */

type Variante = "primario" | "destaque" | "secundario" | "fantasma" | "perigo";
type Tamanho = "sm" | "md" | "lg" | "xl";

const VARIANTES: Record<Variante, string> = {
  primario: "border-0 bg-cta text-cta-fg",
  destaque: "border-0 bg-brand-red text-white",
  secundario:
    "border-[1.5px] border-border-shalon bg-transparent text-ink hover:border-brand-orange",
  fantasma: "border-0 bg-transparent text-ink-2",
  perigo: "border-0 bg-transparent text-danger",
};

const TAMANHOS: Record<Tamanho, string> = {
  sm: "min-h-[40px] px-[13px] text-[13px]",
  md: "min-h-touch px-[14px] text-[14px]",
  lg: "min-h-touch-cta px-[18px] text-[16px]",
  xl: "min-h-touch-cta-lg px-[20px] text-[17px]",
};

const RAIOS: Record<Tamanho, string> = {
  sm: "rounded-10",
  md: "rounded-11",
  lg: "rounded-12",
  xl: "rounded-13",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamanho?: Tamanho;
  fullWidth?: boolean;
  children: ReactNode;
};

export function Button({
  variante = "primario",
  tamanho = "lg",
  fullWidth = false,
  className = "",
  disabled,
  children,
  ...props
}: Props) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold cursor-pointer " +
    "motion-interactive transition-colors disabled:cursor-not-allowed";

  const estiloDesabilitado = disabled
    ? "border-0 bg-tn text-muted hover:border-transparent"
    : VARIANTES[variante];

  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        base,
        TAMANHOS[tamanho],
        RAIOS[tamanho],
        estiloDesabilitado,
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
