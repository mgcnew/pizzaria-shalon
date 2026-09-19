"use client";

import Link from "next/link";
import { useLoja } from "@/ui/publico/useLoja";
import type { ProdutoPublico } from "@/application/publico/tipos";
import { formatBRL } from "@/lib/format";
import { Badge } from "@/ui/components";

/**
 * Favoritos — RN-FAV-001 e RN-FAV-002.
 *
 * A lista de ids está no navegador; os DADOS vêm do servidor a cada visita,
 * porque preço e disponibilidade mudam. Guardar nome e preço localmente
 * mostraria informação velha.
 *
 * Produto estruturalmente inativo não aparece: o servidor não o devolve.
 * Produto temporariamente indisponível continua aqui, marcado — é justamente
 * o caso em que favoritar serve para alguma coisa.
 */
export function ListaFavoritos({ produtos }: { produtos: ProdutoPublico[] }) {
  const { favoritos, alternarFavorito } = useLoja();

  if (favoritos.length === 0) {
    return (
      <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
        <p className="m-0 font-display text-[20px] font-bold text-ink">
          Nenhum favorito ainda
        </p>
        <p className="mb-[18px] mt-2 text-[14px] text-ink-2">
          Toque na estrela de um item do cardápio para guardá-lo neste aparelho.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-touch-cta items-center rounded-12 bg-cta px-5 text-[16px] font-semibold text-cta-fg"
        >
          Ver cardápio
        </Link>
      </div>
    );
  }

  const disponiveisNoServidor = new Set(produtos.map((p) => p.id));
  const sumiram = favoritos.filter((id) => !disponiveisNoServidor.has(id));

  return (
    <div className="flex flex-col gap-3">
      {produtos.map((p) => (
        <article
          key={p.id}
          className={[
            "flex flex-wrap items-center gap-3 rounded-16 border border-border-shalon bg-surface p-3",
            p.disponivel ? "" : "opacity-70",
          ].join(" ")}
        >
          <div className="min-w-[160px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-[16px] font-semibold text-ink">{p.nome}</h2>
              {p.em_promocao ? <Badge tom="promocao">Promoção</Badge> : null}
              {!p.disponivel ? <Badge tom="indisponivel">Indisponível hoje</Badge> : null}
            </div>
            <p className="m-0 mt-1 text-[13px] text-ink-2">
              {p.categoria_nome}
              {p.preco !== null ? ` · ${formatBRL(p.preco)}` : ""}
            </p>
          </div>

          {p.disponivel ? (
            <Link
              href={`/produto/${p.slug}`}
              className="inline-flex min-h-touch items-center rounded-11 bg-cta px-[14px] text-[14px] font-semibold text-cta-fg"
            >
              Escolher
            </Link>
          ) : (
            <Link
              href={`/produto/${p.slug}`}
              className="inline-flex min-h-touch items-center rounded-11 border-[1.5px] border-border-shalon px-[14px] text-[14px] font-semibold text-ink-2"
            >
              Ver
            </Link>
          )}

          <button
            type="button"
            onClick={() => alternarFavorito(p.id)}
            aria-label={`Remover ${p.nome} dos favoritos`}
            className="inline-flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-pill border-[1.5px] border-border-shalon bg-surface text-[15px] text-ink-2"
          >
            <span aria-hidden="true">★</span>
          </button>
        </article>
      ))}

      {sumiram.length > 0 ? (
        <div className="rounded-14 border border-border-shalon bg-elev p-4">
          <p className="m-0 text-[13.5px] text-ink-2">
            {sumiram.length === 1
              ? "Um item salvo saiu do cardápio."
              : `${sumiram.length} itens salvos saíram do cardápio.`}{" "}
            Eles deixam de aparecer aqui.
          </p>
        </div>
      ) : null}

      <p className="m-0 text-[12px] text-muted">
        Favoritos ficam guardados neste aparelho. Não há conta, e a lista não é compartilhada
        entre celular e computador.
      </p>
    </div>
  );
}
