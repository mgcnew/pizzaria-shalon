import type { SelectHTMLAttributes, ReactNode } from "react";

/**
 * Select — vitrine "Input · Select · QuantitySelector" do design aprovado.
 *
 * Mesmas medidas dos selects do administrativo no protótipo: altura mínima
 * 46px, padding 10px/12px, borda de 1.5px, raio 11px.
 */

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  labelOculto?: boolean;
  children: ReactNode;
};

export function Select({
  label,
  hint,
  labelOculto = false,
  id,
  className = "",
  children,
  ...props
}: Props) {
  const campoId = id ?? `campo-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const hintId = hint ? `${campoId}-hint` : undefined;

  return (
    <div className="w-full">
      <label
        htmlFor={campoId}
        className={
          labelOculto ? "sr-only" : "mb-[6px] block text-[14px] font-semibold text-ink"
        }
      >
        {label}
      </label>
      <select
        id={campoId}
        aria-describedby={hintId}
        className={[
          "w-full min-h-[46px] rounded-11 border-[1.5px] border-border-shalon",
          "bg-surface px-3 py-[10px] text-[14px] font-medium text-ink",
          "motion-interactive transition-colors focus:border-brand-orange focus:outline-none",
          className,
        ].join(" ")}
        {...props}
      >
        {children}
      </select>
      {hint ? (
        <p id={hintId} className="mt-[6px] text-[12px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
