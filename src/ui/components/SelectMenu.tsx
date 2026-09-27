"use client";

import { useEffect, useId, useRef, useState } from "react";

export type OpcaoSelectMenu = {
  valor: string;
  texto: string;
  descricao?: string;
};

export function SelectMenu({
  name,
  label,
  opcoes,
  valor,
  aoMudar,
  hint,
}: {
  name?: string;
  label: string;
  opcoes: readonly OpcaoSelectMenu[];
  valor: string;
  aoMudar: (valor: string) => void;
  hint?: string;
}) {
  const idBase = useId().replace(/:/g, "");
  const botaoId = `select-menu-${idBase}`;
  const listaId = `${botaoId}-lista`;
  const hintId = hint ? `${botaoId}-hint` : undefined;
  const raizRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const [aberto, setAberto] = useState(false);
  const indiceSelecionado = Math.max(0, opcoes.findIndex((opcao) => opcao.valor === valor));
  const [indiceAtivo, setIndiceAtivo] = useState(indiceSelecionado);
  const selecionada = opcoes[indiceSelecionado];
  const valorEfetivo = selecionada?.valor ?? "";

  useEffect(() => {
    if (!aberto) return;

    function fecharAoClicarFora(evento: MouseEvent) {
      if (!raizRef.current?.contains(evento.target as Node)) setAberto(false);
    }

    function fecharComEscape(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setAberto(false);
      botaoRef.current?.focus();
    }

    document.addEventListener("mousedown", fecharAoClicarFora);
    document.addEventListener("keydown", fecharComEscape);
    return () => {
      document.removeEventListener("mousedown", fecharAoClicarFora);
      document.removeEventListener("keydown", fecharComEscape);
    };
  }, [aberto]);

  function abrir() {
    setIndiceAtivo(indiceSelecionado);
    setAberto(true);
  }

  function escolher(indice: number) {
    const opcao = opcoes[indice];
    if (!opcao) return;
    aoMudar(opcao.valor);
    setAberto(false);
    botaoRef.current?.focus();
  }

  function navegar(evento: React.KeyboardEvent<HTMLButtonElement>) {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      if (!aberto) {
        abrir();
        return;
      }
      const passo = evento.key === "ArrowDown" ? 1 : -1;
      setIndiceAtivo((atual) => (atual + passo + opcoes.length) % opcoes.length);
      return;
    }

    if (evento.key === "Home" && aberto) {
      evento.preventDefault();
      setIndiceAtivo(0);
      return;
    }

    if (evento.key === "End" && aberto) {
      evento.preventDefault();
      setIndiceAtivo(opcoes.length - 1);
      return;
    }

    if ((evento.key === "Enter" || evento.key === " ") && aberto) {
      evento.preventDefault();
      escolher(indiceAtivo);
    }
  }

  return (
    <div
      ref={raizRef}
      className="relative w-full"
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget)) setAberto(false);
      }}
    >
      {name ? <input type="hidden" name={name} value={valorEfetivo} /> : null}
      <label id={`${botaoId}-label`} className="mb-[6px] block text-[14px] font-semibold text-ink">
        {label}
      </label>
      <button
        ref={botaoRef}
        id={botaoId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-autocomplete="none"
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-labelledby={`${botaoId}-label ${botaoId}`}
        aria-describedby={hintId}
        aria-activedescendant={aberto ? `${botaoId}-opcao-${indiceAtivo}` : undefined}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={navegar}
        className={[
          "motion-interactive flex min-h-[46px] w-full cursor-pointer items-center justify-between gap-3",
          "rounded-11 border-[1.5px] bg-surface px-3 py-[10px] text-left text-[14px] font-medium text-ink",
          "transition-colors focus:outline-none",
          aberto ? "border-brand-orange" : "border-border-shalon hover:border-brand-orange",
        ].join(" ")}
      >
        <span className="min-w-0 truncate">{selecionada?.texto ?? "Selecione"}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`motion-interactive h-4 w-4 shrink-0 text-muted transition-transform ${aberto ? "rotate-180" : ""}`}
          fill="none"
        >
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto ? (
        <div
          id={listaId}
          role="listbox"
          aria-labelledby={`${botaoId}-label`}
          className="motion-popover-in scrollbar-subtle absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[280px] overflow-y-auto rounded-12 border border-border-shalon bg-surface p-1.5 shadow-[0_16px_42px_rgb(30_24_20/0.22)]"
        >
          {opcoes.map((opcao, indice) => {
            const selecionadaAgora = opcao.valor === valorEfetivo;
            const ativa = indice === indiceAtivo;
            return (
              <div
                key={opcao.valor}
                id={`${botaoId}-opcao-${indice}`}
                role="option"
                aria-selected={selecionadaAgora}
                onMouseEnter={() => setIndiceAtivo(indice)}
                onMouseDown={(evento) => {
                  evento.preventDefault();
                  escolher(indice);
                }}
                className={[
                  "flex cursor-pointer items-center gap-3 rounded-10 px-3 py-2.5 text-left",
                  ativa ? "bg-tn" : "bg-transparent",
                ].join(" ")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-ink">{opcao.texto}</span>
                  {opcao.descricao ? (
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                      {opcao.descricao}
                    </span>
                  ) : null}
                </span>
                {selecionadaAgora ? (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-cta" fill="none">
                    <path d="m4 10 3.5 3.5L16 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {hint ? (
        <p id={hintId} className="mt-[6px] text-[12px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
