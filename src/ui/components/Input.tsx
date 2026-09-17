import type { InputHTMLAttributes } from "react";

/**
 * Input — vitrine "Input · Select · QuantitySelector" do design aprovado.
 *
 * Medidas do protótipo: altura mínima 50px, padding 12px/14px, borda de
 * 1.5px, raio 12px, fonte 16px (evita zoom automático no iOS) e foco na cor
 * laranja da marca.
 */

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  /** Oculta visualmente o rótulo, preservando-o para leitores de tela. */
  labelOculto?: boolean;
};

export function Input({ label, hint, labelOculto = false, id, className = "", ...props }: Props) {
  const inputId = id ?? `campo-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const hintId = hint ? `${inputId}-hint` : undefined;

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        className={
          labelOculto
            ? "sr-only"
            : "mb-[6px] block text-[14px] font-semibold text-ink"
        }
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-describedby={hintId}
        className={[
          "w-full min-h-[50px] rounded-12 border-[1.5px] border-border-shalon",
          "bg-surface px-[14px] py-[12px] text-[16px] text-ink",
          "placeholder:text-muted",
          "focus:border-brand-orange focus:outline-none",
          className,
        ].join(" ")}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="mt-[6px] text-[12px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
