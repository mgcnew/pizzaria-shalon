import Link from "next/link";
import { listarBanners, urlDaImagem } from "@/application/publico/consultas";
import type { BannerPublico } from "@/application/publico/tipos";
import { CarrosselBanners } from "./CarrosselBanners";

/**
 * Carrossel de banners do cardápio.
 *
 * RN-BANNER-003/004: a visibilidade já vem decidida do banco — banner de
 * promoção fora da validade e banner de produto indisponível simplesmente
 * não chegam aqui. A interface não refaz esse julgamento.
 *
 * RN-BANNER-002: destino interno é uma ENTIDADE, então o link é montado a
 * partir do slug que o banco devolveu, nunca de uma URL digitada.
 */

function destino(b: BannerPublico): string | null {
  switch (b.destino_tipo) {
    case "product":
      return b.destino_slug ? `/produto/${b.destino_slug}` : null;
    case "category":
      return b.destino_slug ? `/categoria/${b.destino_slug}` : null;
    // Promoção não é página: o banco devolve o slug do produto alvo.
    case "promotion":
      return b.destino_slug ? `/produto/${b.destino_slug}` : null;
    case "external":
      return b.url_externa;
    default:
      return null;
  }
}

export async function Banners({
  nomeLoja,
  temCombos,
}: {
  nomeLoja: string;
  temCombos: boolean;
}) {
  const banners = await listarBanners();
  if (banners.length === 0) {
    return (
      <section className="mx-4 mt-4 flex flex-wrap items-center gap-[18px] rounded-20 bg-sidebar p-5">
        <div className="min-w-[200px] flex-[1_1_220px]">
          <span className="inline-block rounded-pill bg-brand-yellow/15 px-[10px] py-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-brand-yellow">
            Tradição desde 1995
          </span>
          <h1 className="mb-[6px] mt-[10px] text-balance font-display text-[30px] font-extrabold leading-[1.08] text-dark-ink">
            {nomeLoja}
          </h1>
          <p className="m-0 mb-4 max-w-[34ch] text-[15px] text-dark-ink-2">
            Massa fresca todos os dias, assada na hora e entregue quentinha na sua casa.
          </p>
          {temCombos ? (
            <Link
              href="#combos"
              className="inline-flex min-h-touch-cta items-center rounded-12 bg-cta px-5 text-[16px] font-semibold text-cta-fg"
            >
              Ver combos
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  const cartoes = await Promise.all(
    banners.map(async (b) => ({ ...b, url: await urlDaImagem(b.imagem_path), href: destino(b) })),
  );

  return <CarrosselBanners banners={cartoes} />;
}
