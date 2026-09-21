import Image from "next/image";
import Link from "next/link";
import type { CategoriaPublica } from "@/application/publico/tipos";

const VISUAIS: Record<string, { src: string; fundo: string }> = {
  tudo: {
    src: "/categorias/tudo.webp",
    fundo: "bg-[#fff0d8]",
  },
  "pizzas-salgadas": {
    src: "/categorias/pizzas-salgadas.webp",
    fundo: "bg-[#fff0d8]",
  },
  "pizzas-doces": {
    src: "/categorias/pizzas-doces-v2.webp",
    fundo: "bg-[#fde8e5]",
  },
  fogazza: {
    src: "/categorias/fogazza-v2.webp",
    fundo: "bg-[#fff2d5]",
  },
  combos: {
    src: "/categorias/combos.webp",
    fundo: "bg-[#ffebd0]",
  },
  bebidas: {
    src: "/categorias/bebidas.webp",
    fundo: "bg-[#e8f3eb]",
  },
};

function CirculoCategoria({
  slug,
  nome,
  ativa,
}: {
  slug: string;
  nome: string;
  ativa: boolean;
}) {
  const visual = VISUAIS[slug];

  return (
    <span
      className={[
        "relative flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-full border-2 transition-[border-color,transform,box-shadow] sm:h-[74px] sm:w-[74px]",
        ativa
          ? "border-brand-orange shadow-[0_0_0_3px_rgb(238_122_23/0.16)]"
          : "border-border-shalon group-hover:-translate-y-0.5 group-hover:border-brand-orange",
        visual?.fundo ?? "bg-tn",
      ].join(" ")}
    >
      {visual ? (
        <Image
          src={visual.src}
          alt=""
          width={256}
          height={256}
          sizes="74px"
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <span aria-hidden="true" className="font-display text-[24px] font-extrabold text-ink-2">
          {nome.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/**
 * Categorias públicas em atalhos visuais circulares. Cada categoria conhecida
 * usa uma imagem própria; categorias criadas depois recebem uma inicial como
 * fallback e continuam navegáveis por URL compartilhável.
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
    <nav
      aria-label="Categorias do cardápio"
      className="flex snap-x snap-proximity gap-4 overflow-x-auto px-4 pb-2 pt-1"
      data-hscroll="true"
    >
      <Link
        href="/"
        aria-current={atual === undefined ? "page" : undefined}
        className="group flex w-[74px] shrink-0 snap-start flex-col items-center gap-2 text-center"
      >
        <CirculoCategoria slug="tudo" nome="Tudo" ativa={atual === undefined} />
        <span className="text-[12.5px] font-bold leading-[1.2] text-ink">Tudo</span>
      </Link>

      {comItens.map((categoria) => {
        const ativa = categoria.slug === atual;
        return (
          <Link
            key={categoria.id}
            href={`/categoria/${categoria.slug}`}
            aria-current={ativa ? "page" : undefined}
            className="group flex w-[84px] shrink-0 snap-start flex-col items-center gap-2 text-center"
          >
            <CirculoCategoria slug={categoria.slug} nome={categoria.nome} ativa={ativa} />
            <span
              className={[
                "line-clamp-2 text-[12.5px] font-semibold leading-[1.2]",
                ativa ? "text-ink" : "text-ink-2 group-hover:text-ink",
              ].join(" ")}
            >
              {categoria.nome}
            </span>
            {categoria.pausada ? (
              <span className="-mt-1 text-[9.5px] font-bold uppercase tracking-[0.04em] text-warning">
                Pausada
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
