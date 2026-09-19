import Link from "next/link";
import type { CategoriaPublica } from "@/application/publico/tipos";

/**
 * Categorias em pílula com rolagem horizontal — o padrão do design: 44px de
 * altura, raio 999px, borda de 1.5px, `scroll-snap` no eixo x.
 *
 * Cada pílula é um LINK para a página da categoria (RN-LINK-001: categoria
 * tem link compartilhável). No protótipo era filtro em estado local.
 *
 * RN-DISP-004: categoria pausada continua aparecendo — o que muda é a
 * disponibilidade dos produtos dela, e a pílula avisa.
 */
export function ChipsCategorias({
  categorias,
  atual,
}: {
  categorias: CategoriaPublica[];
  atual?: string;
}) {
  const comItens = categorias.filter((c) => c.produtos > 0);
  if (comItens.length === 0) return null;

  return (
    <div className="flex snap-x snap-proximity gap-[10px] overflow-x-auto px-4 pb-[2px] pt-1">
      <Link
        href="/"
        className={[
          "inline-flex min-h-touch shrink-0 snap-start items-center rounded-pill border-[1.5px] px-4 text-[14px] font-semibold",
          atual === undefined
            ? "border-cta bg-cta text-cta-fg"
            : "border-border-shalon bg-surface text-ink-2",
        ].join(" ")}
      >
        Tudo
      </Link>

      {comItens.map((c) => {
        const ativa = c.slug === atual;
        return (
          <Link
            key={c.id}
            href={`/categoria/${c.slug}`}
            className={[
              "inline-flex min-h-touch shrink-0 snap-start items-center gap-2 rounded-pill border-[1.5px] px-4 text-[14px] font-semibold",
              ativa
                ? "border-cta bg-cta text-cta-fg"
                : "border-border-shalon bg-surface text-ink-2",
            ].join(" ")}
          >
            {c.nome}
            {c.pausada ? (
              <span className="text-[11px] font-bold uppercase tracking-[0.04em] opacity-70">
                pausada
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
