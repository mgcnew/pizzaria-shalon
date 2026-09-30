"use client";

import Link from "next/link";
import { useState } from "react";
import { formatBRL } from "@/lib/format";
import { filtrarSabores } from "@/domain/catalogo/buscaDeSabor";
import type { SaborDaFogazza } from "@/application/publico/tipos";

/**
 * Lista de sabores de um card de fogazza — RN-FOG-003.
 *
 * O cliente chegou pelo card "Fogazza salgada" (ou doce) e escolhe UM sabor
 * (RN-FOG-004). Cada linha abre a página daquele sabor como fogazza, com o
 * configurador de sempre e o tamanho fixo.
 *
 * As linhas repetem o desenho das opções do configurador (sabores do meio a
 * meio): 56px, borda de 2px, nome, descrição em uma linha e preço à direita.
 * A caixa de busca repete a do cardápio. A busca filtra a lista que já está
 * na tela — mesma regra de palavras da busca do cardápio — e não decide nada
 * de preço nem de disponibilidade: isso veio pronto do banco.
 */
export function EscolherSabor({
  cardSlug,
  sabores,
}: {
  cardSlug: string;
  sabores: SaborDaFogazza[];
}) {
  const [termo, setTermo] = useState("");
  const visiveis = filtrarSabores(sabores, termo);

  return (
    <section className="mt-5 pb-8" aria-labelledby="escolha-o-sabor">
      <h2 id="escolha-o-sabor" className="m-0 mb-1 text-[16px] font-bold text-ink">
        Escolha o sabor
      </h2>
      <p className="m-0 mb-[10px] text-[13px] text-muted">
        Obrigatório · {sabores.length} {sabores.length === 1 ? "sabor" : "sabores"}
      </p>

      <div
        role="search"
        className="motion-interactive mb-3 flex min-h-[50px] items-center gap-[10px] rounded-10 border-[1.5px] border-border-shalon bg-surface px-[14px] transition-colors focus-within:border-brand-orange"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          width="20"
          height="20"
          className="h-5 w-5 shrink-0 text-muted"
          style={{ width: 20, height: 20 }}
        >
          <circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.8" />
          <path d="m15.5 15.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <label htmlFor="busca-sabor" className="sr-only">
          Buscar sabor
        </label>
        <input
          id="busca-sabor"
          // `text`, e não `search`: o "×" nativo do navegador somaria um
          // segundo botão de limpar ao nosso, que tem o alvo de 44px.
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
            className="motion-interactive flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-10 border-0 bg-tn text-[18px] text-ink-2 transition-colors hover:bg-border-shalon hover:text-ink"
          >
            ×
          </button>
        ) : null}
      </div>

      {visiveis.length === 0 ? (
        <p role="status" className="m-0 rounded-13 border border-dashed border-border-shalon bg-elev px-4 py-6 text-center text-[14px] text-ink-2">
          Nenhum sabor com “{termo.trim()}”.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {visiveis.map((s) => {
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
                  {s.em_promocao ? (
                    <span className="block text-[12px] text-muted line-through tabular-nums">
                      {formatBRL(s.preco_de)}
                    </span>
                  ) : null}
                  <span className="block text-[14px] font-semibold tabular-nums text-ink-2">
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
                    href={`/produto/${cardSlug}/${s.slug}`}
                    className={`${classe} motion-interactive transition-colors hover:border-brand-orange`}
                  >
                    {conteudo}
                  </Link>
                ) : (
                  // Esgotado continua na lista, marcado — some da escolha, não
                  // do cardápio (mesmo tratamento dos sabores do meio a meio).
                  <div aria-disabled="true" className={`${classe} opacity-60`}>
                    {conteudo}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
