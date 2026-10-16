"use client";

import Link from "next/link";
import { useState } from "react";
import { formatBRL } from "@/lib/format";
import { filtrarSabores } from "@/domain/catalogo/buscaDeSabor";
import type { SaborDaFogazza } from "@/application/publico/tipos";

/**
 * Fogazzas de uma promoção, em LISTA com busca (D-2026-10-15-137).
 *
 * Nem todo sabor de fogazza tem foto, e um card sem foto é um quadrado vazio.
 * A lista é o mesmo formato da página da fogazza ("Escolha o sabor"): nome,
 * ingredientes, preço — e funciona igual com ou sem imagem. Os grupos são os
 * cards de fogazza (doce, salgada); uma busca filtra todos de uma vez.
 *
 * Preço e disponibilidade vêm prontos do banco; esta lista só exibe.
 */
export type GrupoDeFogazza = {
  cardSlug: string;
  cardNome: string;
  sabores: SaborDaFogazza[];
};

export function ListaDeFogazzasEmPromocao({ grupos }: { grupos: GrupoDeFogazza[] }) {
  const [termo, setTermo] = useState("");
  const total = grupos.reduce((n, g) => n + g.sabores.length, 0);

  const visiveis = grupos
    .map((g) => ({ ...g, sabores: filtrarSabores(g.sabores, termo) }))
    .filter((g) => g.sabores.length > 0);

  return (
    <section aria-labelledby="fogazzas-em-promocao" className="mt-2 pb-8">
      <h2 id="fogazzas-em-promocao" className="m-0 mb-1 text-[16px] font-bold text-ink">
        Fogazzas em promoção
      </h2>
      <p className="m-0 mb-[10px] text-[13px] text-muted">
        {total} {total === 1 ? "sabor" : "sabores"} · toque no sabor para pedir
      </p>

      <div
        role="search"
        className="motion-interactive mb-3 flex min-h-[50px] items-center gap-[10px] rounded-10 border-[1.5px] border-border-shalon bg-surface px-[14px] transition-colors focus-within:border-brand-orange"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-muted">
          <circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.8" />
          <path d="m15.5 15.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <label htmlFor="busca-fogazza-promocao" className="sr-only">
          Buscar sabor
        </label>
        <input
          id="busca-fogazza-promocao"
          type="text"
          inputMode="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar sabor..."
          enterKeyHint="search"
          autoComplete="off"
          className="min-h-[48px] min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
        />
        {termo ? (
          <button
            type="button"
            onClick={() => setTermo("")}
            aria-label="Limpar busca"
            className="flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-10 border-0 bg-tn text-[18px] text-ink-2 hover:text-ink"
          >
            ×
          </button>
        ) : null}
      </div>

      {visiveis.length === 0 ? (
        <p
          role="status"
          className="m-0 rounded-13 border border-dashed border-border-shalon bg-elev px-4 py-6 text-center text-[14px] text-ink-2"
        >
          Nenhum sabor com “{termo.trim()}”.
        </p>
      ) : (
        visiveis.map((g) => (
          <div key={g.cardSlug} className="mb-4 last:mb-0">
            {grupos.length > 1 ? (
              <h3 className="m-0 mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
                {g.cardNome}
              </h3>
            ) : null}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {g.sabores.map((s) => {
                const conteudo = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink">
                        {s.nome}
                        {s.disponivel ? "" : " · indisponível hoje"}
                      </span>
                      {s.descricao ? (
                        <span className="block truncate text-[13px] text-ink-2">{s.descricao}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right">
                      {s.em_promocao && s.preco_de > s.preco ? (
                        <span className="block text-[12px] text-muted line-through tabular-nums">
                          {formatBRL(s.preco_de)}
                        </span>
                      ) : null}
                      <span className="block text-[14px] font-semibold tabular-nums text-ink">
                        {formatBRL(s.preco)}
                      </span>
                    </span>
                    {s.disponivel ? (
                      <span aria-hidden="true" className="shrink-0 text-[18px] text-muted">
                        ›
                      </span>
                    ) : null}
                  </>
                );
                const classe =
                  "flex min-h-[56px] items-center gap-3 rounded-13 border-2 border-border-shalon bg-surface px-[14px] py-[13px] text-left";
                return (
                  <li key={s.variacao_id}>
                    {s.disponivel ? (
                      <Link
                        href={`/produto/${g.cardSlug}/${s.slug}`}
                        className={`${classe} motion-interactive transition-colors hover:border-brand-orange`}
                      >
                        {conteudo}
                      </Link>
                    ) : (
                      <div aria-disabled="true" className={`${classe} opacity-60`}>
                        {conteudo}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
