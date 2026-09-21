"use client";

import Form from "next/form";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type CategoriaFiltro = { id: string; nome: string };

export function FiltrosProdutos({
  busca,
  categoria,
  situacao,
  categorias,
}: {
  busca: string;
  categoria: string;
  situacao: string;
  categorias: readonly CategoriaFiltro[];
}) {
  const [aberto, setAberto] = useState(false);
  const filtrosRef = useRef<HTMLDivElement>(null);
  const quantidadeAtivos = Number(Boolean(categoria)) + Number(Boolean(situacao));
  const hrefLimpar = busca
    ? `/admin/produtos?busca=${encodeURIComponent(busca)}`
    : "/admin/produtos";

  useEffect(() => {
    if (!aberto) return;

    function fecharAoClicarFora(evento: PointerEvent) {
      if (!filtrosRef.current?.contains(evento.target as Node)) setAberto(false);
    }

    function fecharComEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }

    document.addEventListener("pointerdown", fecharAoClicarFora);
    document.addEventListener("keydown", fecharComEscape);
    return () => {
      document.removeEventListener("pointerdown", fecharAoClicarFora);
      document.removeEventListener("keydown", fecharComEscape);
    };
  }, [aberto]);

  return (
    <Form
      action="/admin/produtos"
      onSubmit={() => setAberto(false)}
      className="mb-[14px] flex items-center gap-[10px]"
    >
      <input type="hidden" name="aba" value="produtos" />

      <div className="motion-interactive flex min-h-[48px] min-w-0 flex-1 items-center gap-[10px] rounded-12 border-[1.5px] border-border-shalon bg-surface px-[14px] transition-colors focus-within:border-brand-orange">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="19"
          height="19"
          className="h-[19px] w-[19px] shrink-0 text-muted"
        >
          <circle cx="10.7" cy="10.7" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m15.3 15.3 4.1 4.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <label htmlFor="busca-produto" className="sr-only">
          Buscar produto ou categoria
        </label>
        <input
          id="busca-produto"
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Buscar produto ou categoria"
          enterKeyHint="search"
          className="min-h-[46px] min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
        />
      </div>

      <div ref={filtrosRef} className="relative z-10 shrink-0">
        <button
          type="button"
          aria-label="Filtrar produtos"
          aria-haspopup="dialog"
          aria-expanded={aberto}
          aria-controls="painel-filtros-produtos"
          onClick={() => setAberto((valor) => !valor)}
          className={[
            "motion-interactive inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-12 border-[1.5px] px-[14px] text-[14px] font-semibold transition-colors",
            aberto || quantidadeAtivos > 0
              ? "border-brand-orange bg-elev text-ink"
              : "border-border-shalon bg-surface text-ink hover:border-brand-orange",
          ].join(" ")}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" className="h-[18px] w-[18px]">
            <path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Filtrar</span>
          {quantidadeAtivos > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-brand-orange px-1 text-[11px] font-bold text-white">
              {quantidadeAtivos}
            </span>
          ) : null}
        </button>

        <div
          id="painel-filtros-produtos"
          role="dialog"
          aria-label="Filtros de produtos"
          hidden={!aberto}
          className={[
            "absolute right-0 top-[calc(100%+8px)] w-[min(340px,calc(100vw-32px))] rounded-14 border border-border-shalon bg-surface p-4 shadow-[0_16px_42px_rgb(30_24_20/0.16)]",
            aberto ? "motion-popover-in" : "",
          ].join(" ")}
        >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-[15px] font-bold text-ink">Filtrar produtos</p>
                <p className="mb-0 mt-0.5 text-[12px] text-muted">
                  Refine por categoria e disponibilidade.
                </p>
              </div>
              {quantidadeAtivos > 0 ? (
                <Link
                  href={hrefLimpar}
                  onClick={() => setAberto(false)}
                  className="motion-interactive inline-flex min-h-[34px] items-center px-1 text-[12px] font-semibold text-brand-red transition-colors hover:text-danger"
                >
                  Limpar
                </Link>
              ) : null}
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1.5 text-[12.5px] font-semibold text-ink-2">
                Categoria
                <select
                  name="categoria"
                  defaultValue={categoria}
                  className="motion-interactive min-h-touch rounded-10 border-[1.5px] border-border-shalon bg-surface px-3 text-[14px] font-medium text-ink outline-none transition-colors focus:border-brand-orange"
                >
                  <option value="">Todas as categorias</option>
                  {categorias.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-[12.5px] font-semibold text-ink-2">
                Status
                <select
                  name="situacao"
                  defaultValue={situacao}
                  className="motion-interactive min-h-touch rounded-10 border-[1.5px] border-border-shalon bg-surface px-3 text-[14px] font-medium text-ink outline-none transition-colors focus:border-brand-orange"
                >
                  <option value="">Qualquer status</option>
                  <option value="disponivel">Disponíveis</option>
                  <option value="indisponivel">Indisponíveis</option>
                  <option value="hoje">Indisponíveis hoje</option>
                  <option value="inativo">Inativos</option>
                  <option value="promo">Em promoção</option>
                </select>
              </label>
            </div>

            <button
              type="submit"
              className="motion-interactive mt-4 inline-flex min-h-touch w-full cursor-pointer items-center justify-center rounded-11 bg-cta px-4 text-[14px] font-bold text-cta-fg transition-opacity hover:opacity-90"
            >
              Aplicar filtros
            </button>
        </div>
      </div>
    </Form>
  );
}
