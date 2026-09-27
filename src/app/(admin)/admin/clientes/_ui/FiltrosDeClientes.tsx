"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** Filtros de ausência e cadência dentro de um painel compacto. */
const AUSENCIAS = [15, 30, 60, 90];

const CADENCIAS: { valor: string; rotulo: string }[] = [
  { valor: "recorrente", rotulo: "Recorrentes" },
  { valor: "atencao", rotulo: "Em atenção" },
  { valor: "afastado", rotulo: "Afastados" },
  { valor: "base_fraca", rotulo: "Base fraca" },
  { valor: "dados_insuficientes", rotulo: "Sem histórico" },
];

function Chip({
  ativo,
  href,
  aoEscolher,
  children,
}: {
  ativo: boolean;
  href: string;
  aoEscolher: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "true" : undefined}
      onClick={aoEscolher}
      className={[
        "motion-interactive inline-flex min-h-touch items-center justify-center rounded-11 px-3 text-[13px] font-semibold transition-colors",
        ativo
          ? "bg-cta text-cta-fg"
          : "border-[1.5px] border-border-shalon bg-surface text-ink hover:border-brand-orange",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

export function FiltrosDeClientes({
  ausencia,
  classificacao,
  busca,
}: {
  ausencia?: string;
  classificacao?: string;
  busca?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const quantidadeAtivos = Number(Boolean(ausencia)) + Number(Boolean(classificacao));

  const url = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) if (valor) p.set(chave, valor);
    const query = p.toString();
    return query ? `/admin/clientes?${query}` : "/admin/clientes";
  };

  useEffect(() => {
    if (!aberto) return;

    function fecharAoClicarFora(evento: PointerEvent) {
      if (!raizRef.current?.contains(evento.target as Node)) setAberto(false);
    }

    function fecharComEscape(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setAberto(false);
      botaoRef.current?.focus();
    }

    document.addEventListener("pointerdown", fecharAoClicarFora);
    document.addEventListener("keydown", fecharComEscape);
    return () => {
      document.removeEventListener("pointerdown", fecharAoClicarFora);
      document.removeEventListener("keydown", fecharComEscape);
    };
  }, [aberto]);

  return (
    <div ref={raizRef} className="relative">
      <button
        ref={botaoRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls="painel-filtros-clientes"
        onClick={() => setAberto((atual) => !atual)}
        className={[
          "motion-interactive inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-11 border-[1.5px] px-3 text-[13px] font-semibold transition-colors",
          aberto || quantidadeAtivos > 0
            ? "border-brand-orange bg-elev text-ink"
            : "border-border-shalon bg-surface text-ink hover:border-brand-orange",
        ].join(" ")}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none">
          <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
        Filtros
        {quantidadeAtivos > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-brand-orange px-1 text-[11px] font-bold text-white">
            {quantidadeAtivos}
          </span>
        ) : null}
      </button>

      {aberto ? (
        <div
          id="painel-filtros-clientes"
          role="dialog"
          aria-label="Filtros de clientes"
          className="motion-popover-in absolute right-0 top-[calc(100%+8px)] z-50 w-[min(380px,calc(100vw-32px))] rounded-14 border border-border-shalon bg-surface p-4 shadow-[0_16px_42px_rgb(30_24_20/0.18)]"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="m-0 text-[15px] font-bold text-ink">Filtrar clientes</p>
              <p className="mb-0 mt-0.5 text-[12px] text-muted">Combine ausência e cadência.</p>
            </div>
            {quantidadeAtivos > 0 ? (
              <Link
                href={url({ busca })}
                onClick={() => setAberto(false)}
                className="inline-flex min-h-[34px] items-center text-[12px] font-semibold text-brand-red hover:text-danger"
              >
                Limpar
              </Link>
            ) : null}
          </div>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-2 text-[12px] font-bold uppercase tracking-[0.05em] text-muted">
              Sem comprar há
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {AUSENCIAS.map((dias) => (
                <Chip
                  key={dias}
                  ativo={ausencia === String(dias)}
                  aoEscolher={() => setAberto(false)}
                  href={url({
                    busca,
                    ausencia: ausencia === String(dias) ? undefined : String(dias),
                    cadencia: classificacao,
                  })}
                >
                  {dias}+ dias
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset className="m-0 mt-4 min-w-0 border-0 border-t border-border-shalon p-0 pt-4">
            <legend className="px-2 text-[12px] font-bold uppercase tracking-[0.05em] text-muted">
              Cadência
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {CADENCIAS.map((cadencia) => (
                <Chip
                  key={cadencia.valor}
                  ativo={classificacao === cadencia.valor}
                  aoEscolher={() => setAberto(false)}
                  href={url({
                    busca,
                    ausencia,
                    cadencia: classificacao === cadencia.valor ? undefined : cadencia.valor,
                  })}
                >
                  {cadencia.rotulo}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
