import Link from "next/link";
import type { CategoriaPublica } from "@/application/publico/tipos";

function IconeCategoria({ slug }: { slug: string }) {
  const classe = "h-5 w-5";
  const propriedades = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    width: 20,
    height: 20,
    fill: "none",
    className: classe,
  } as const;

  if (slug === "pizzas-salgadas") {
    return (
      <svg {...propriedades}>
        <path d="M5 19 9.1 5.2c.25-.85 1.28-1.18 1.98-.64l10.1 7.76c.7.54.55 1.63-.27 1.97L5 19Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M8.3 7.8c3.15.55 6.12 2.02 8.5 4.18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="10.3" cy="11.2" r="1.15" fill="currentColor" />
        <circle cx="14.2" cy="14.1" r="1.15" fill="currentColor" />
      </svg>
    );
  }

  if (slug === "pizzas-doces") {
    return (
      <svg {...propriedades}>
        <path d="M5 19 9.1 5.2c.25-.85 1.28-1.18 1.98-.64l10.1 7.76c.7.54.55 1.63-.27 1.97L5 19Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M8.3 7.8c3.15.55 6.12 2.02 8.5 4.18M8.2 13.1c1.1-1.3 2.1 1.35 3.2.05s2.08 1.3 3.2 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M17.2 8.2c-.9-.9-2.4.4-.3 2.25 2.1-.75 1.5-2.63.3-2.25Z" fill="currentColor" />
      </svg>
    );
  }

  if (slug === "fogazza") {
    return (
      <svg {...propriedades}>
        <path d="M3.5 14.5C7.8 5.6 16.2 5.6 20.5 14.5c-4.9 4.65-12.1 4.65-17 0Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M6.2 14.2c3.85 1.6 7.75 1.6 11.6 0M7.7 12.2l.65.35m3-1.35.65.35m3-1.35.65.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (slug === "combos") {
    return (
      <svg {...propriedades}>
        <path d="M3.5 10.5h11l-1 9h-9l-1-9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M5.5 10.5 8 5h2.5l2 5.5M16.5 7h4l-1 12h-2l-1-12Zm.5 4h3M18 7l1-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (slug === "bebidas") {
    return (
      <svg {...propriedades}>
        <path d="M7 8h10l-1 12H8L7 8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M6 8h12M10 12h6M14 8l1-5h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (slug === "tudo") {
    return (
      <svg {...propriedades}>
        <rect x="4" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
        <rect x="14" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
        <rect x="4" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
        <rect x="14" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  return (
    <svg {...propriedades}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

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
          "inline-flex min-h-touch shrink-0 snap-start items-center gap-2 rounded-pill border-[1.5px] px-4 text-[14px] font-semibold",
          atual === undefined
            ? "border-cta bg-cta text-cta-fg"
            : "border-border-shalon bg-surface text-ink-2",
        ].join(" ")}
      >
        <IconeCategoria slug="tudo" />
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
            <IconeCategoria slug={c.slug} />
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
