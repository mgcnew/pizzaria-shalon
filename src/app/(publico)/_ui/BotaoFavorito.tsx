"use client";

import { useLoja } from "@/ui/publico/useLoja";

/**
 * Favoritar.
 *
 * ADAPTAÇÃO REGISTRADA (A-06): o protótipo não traz controle de favorito no
 * card nem na página de produto — favoritos aparecem apenas como item de menu
 * em 79.8. O botão foi montado com o vocabulário visual aprovado (alvo de
 * 44px, raio 999px, borda de 1.5px, amarelo da marca quando ativo).
 *
 * RN-FAV-001: é local, deste aparelho. A microcopy diz isso em vez de sugerir
 * uma conta que não existe.
 */
export function BotaoFavorito({
  produtoId,
  nome,
  compacto = false,
}: {
  produtoId: string;
  nome: string;
  compacto?: boolean;
}) {
  const { ehFavorito, alternarFavorito } = useLoja();
  const marcado = ehFavorito(produtoId);

  const rotulo = marcado ? `Remover ${nome} dos favoritos` : `Salvar ${nome} nos favoritos`;
  const titulo = marcado ? "Salvo neste aparelho" : "Salvar neste aparelho";
  const estrela = (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[15px] w-[15px]">
      <path
        d="m12 3.6 2.55 5.2 5.73.83-4.14 4.04.98 5.7L12 16.68 6.88 19.37l.98-5.7L3.72 9.63l5.73-.83L12 3.6Z"
        fill={marcado ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );

  // Sobre a foto do card (D-2026-09-28-86): o círculo VISÍVEL tem 30px e é
  // translúcido, para não tapar a pizza num card de ~105px; o alvo de toque
  // continua com 44px (CLAUDE.md §38) — a margem negativa devolve a diferença.
  if (compacto) {
    return (
      <button
        type="button"
        onClick={() => alternarFavorito(produtoId)}
        aria-pressed={marcado}
        aria-label={rotulo}
        title={titulo}
        className="-m-[7px] inline-flex min-h-touch min-w-touch cursor-pointer items-center justify-center border-0 bg-transparent p-0"
      >
        <span
          className={[
            "motion-interactive flex h-[30px] w-[30px] items-center justify-center rounded-pill shadow-[0_1px_4px_rgb(0_0_0/0.18)] transition-colors",
            marcado
              ? "bg-brand-yellow text-ink"
              : "bg-surface/85 text-ink-2 backdrop-blur-[6px]",
          ].join(" ")}
        >
          {estrela}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => alternarFavorito(produtoId)}
      aria-pressed={marcado}
      aria-label={rotulo}
      title={titulo}
      className={[
        "inline-flex min-h-touch items-center justify-center gap-2 rounded-pill border-[1.5px] px-[14px] text-[13px] font-semibold",
        marcado
          ? "border-brand-yellow bg-brand-yellow text-ink"
          : "border-border-shalon bg-surface text-ink-2",
      ].join(" ")}
    >
      {estrela}
      {marcado ? "Salvo" : "Salvar"}
    </button>
  );
}
