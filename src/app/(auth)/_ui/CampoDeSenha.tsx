"use client";

import { useState, type InputHTMLAttributes } from "react";

/**
 * Campo de senha com "mostrar/ocultar".
 *
 * Em celular, digitar senha às cegas é a causa número um de erro de login. O
 * botão troca o tipo do campo; o alvo de toque tem 44px e o estado é
 * anunciado (`aria-pressed`). Mesmas medidas do `Input` do design.
 */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  hint?: string;
};

export function CampoDeSenha({ label, hint, id, className = "", ...props }: Props) {
  const [visivel, setVisivel] = useState(false);
  const campoId = id ?? `campo-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const hintId = hint ? `${campoId}-hint` : undefined;

  return (
    <div className="w-full">
      <label htmlFor={campoId} className="mb-[6px] block text-[14px] font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={campoId}
          type={visivel ? "text" : "password"}
          aria-describedby={hintId}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={[
            "w-full min-h-[50px] rounded-12 border-[1.5px] border-border-shalon",
            "bg-surface py-[12px] pl-[14px] pr-[56px] text-[16px] text-ink",
            "placeholder:text-muted",
            "motion-interactive transition-colors focus:border-brand-orange focus:outline-none",
            className,
          ].join(" ")}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-pressed={visivel}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-1 top-1/2 flex h-[44px] w-[44px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-10 border-0 bg-transparent text-ink-2 hover:text-ink"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path
              d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
            {visivel ? null : (
              <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>
      {hint ? (
        <p id={hintId} className="mt-[6px] text-[12px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
