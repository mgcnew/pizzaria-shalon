import type { ReactNode } from "react";
import { formatBRL } from "@/lib/format";
import { descreverDias } from "@/domain/catalogo/diasDaSemana";
import type { CampanhaEmPromocao } from "@/application/publico/tipos";

/**
 * Cabeçalho da campanha de promoção (15/10/2026).
 *
 * Os cards já mostram preço riscado e preço novo; o que faltava era DIZER a
 * oferta uma vez só: o nome, os dias, até quando e o preço comum. Por isso a
 * faixa tem um fundo próprio e o selo "Promoção" some de cada card (repetido
 * em nove cards era ruído, não destaque).
 *
 * Tudo vem calculado do servidor (`campanhas_em_promocao`); aqui só se
 * formata.
 */
function fimDaCampanha(fim: string | null): string | null {
  if (!fim) return null;
  return new Date(fim).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function SecaoDeCampanha({
  campanha,
  quantidade,
  children,
}: {
  campanha: CampanhaEmPromocao;
  quantidade: number;
  children: ReactNode;
}) {
  const dias = descreverDias(campanha.dias);
  const ate = fimDaCampanha(campanha.fim);
  const mesmoPreco = campanha.preco_min === campanha.preco_max;

  const detalhes = [dias, ate ? `até ${ate}` : null, "enquanto durar"]
    .filter((x): x is string => x !== null && !(x === "enquanto durar" && ate !== null))
    .join(" · ");

  return (
    <section
      aria-label={campanha.nome}
      className="mx-4 mt-6 overflow-hidden rounded-20 border border-brand-yellow/40 bg-brand-yellow/15 px-4 pb-4 pt-4"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <span className="inline-block rounded-pill bg-brand-red px-[10px] py-[3px] text-[11.5px] font-bold uppercase tracking-[0.06em] text-white">
            Promoção
          </span>
          <h2 className="m-0 mt-1.5 text-balance font-display text-[22px] font-extrabold leading-[1.1] text-ink">
            {campanha.nome}
          </h2>
          <p className="m-0 mt-1 text-[13.5px] text-ink-2">
            {detalhes}
            {quantidade > 0 ? ` · ${quantidade} ${quantidade === 1 ? "sabor" : "sabores"}` : ""}
          </p>
        </div>

        <p className="m-0 shrink-0 rounded-14 bg-cta px-3.5 py-2 text-cta-fg shadow-cta">
          <span className="block text-[11.5px] font-semibold leading-none">
            {mesmoPreco ? "todas por" : "a partir de"}
          </span>
          <span className="block font-display text-[24px] font-extrabold leading-[1.1] tabular-nums">
            {formatBRL(campanha.preco_min)}
          </span>
        </p>
      </div>

      {children}
    </section>
  );
}
