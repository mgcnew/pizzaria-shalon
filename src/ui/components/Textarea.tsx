import type { TextareaHTMLAttributes } from "react";

/**
 * Textarea — mesmas medidas do campo de descrição no modal de produto do
 * design: padding 11px/13px, borda 1.5px, raio 11px, redimensionamento
 * vertical.
 */

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
};

export function Textarea({ label, hint, id, className = "", ...props }: Props) {
  const campoId = id ?? `campo-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const hintId = hint ? `${campoId}-hint` : undefined;

  return (
    <div className="w-full">
      <label htmlFor={campoId} className="mb-[6px] block text-[14px] font-semibold text-ink">
        {label}
      </label>
      <textarea
        id={campoId}
        aria-describedby={hintId}
        rows={props.rows ?? 2}
        className={[
          "w-full resize-y rounded-11 border-[1.5px] border-border-shalon",
          "bg-surface px-[13px] py-[11px] text-[14.5px] text-ink",
          "motion-interactive transition-colors placeholder:text-muted focus:border-brand-orange focus:outline-none",
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
