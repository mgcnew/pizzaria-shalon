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

  return (
    <button
      type="button"
      onClick={() => alternarFavorito(produtoId)}
      aria-pressed={marcado}
      aria-label={marcado ? `Remover ${nome} dos favoritos` : `Salvar ${nome} nos favoritos`}
      title={marcado ? "Salvo neste aparelho" : "Salvar neste aparelho"}
      className={[
        "inline-flex min-h-touch items-center justify-center gap-2 rounded-pill border-[1.5px]",
        compacto ? "min-w-touch px-0" : "px-[14px] text-[13px] font-semibold",
        marcado
          ? "border-brand-yellow bg-brand-yellow text-ink"
          : "border-border-shalon bg-surface text-ink-2",
      ].join(" ")}
    >
      <span aria-hidden="true">{marcado ? "★" : "☆"}</span>
      {compacto ? null : marcado ? "Salvo" : "Salvar"}
    </button>
  );
}
