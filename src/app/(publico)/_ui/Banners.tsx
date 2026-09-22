import Link from "next/link";
import { listarBanners, urlDaImagem } from "@/application/publico/consultas";
import { formatBRL } from "@/lib/format";
import type { BannerPublico, ProdutoPublico } from "@/application/publico/tipos";
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
 *
 * OS COMBOS ENTRAM AQUI, e não em seção própria (D-2026-09-21-56, revisada).
 * Combo é oferta, e oferta pertence ao topo — junto do banner, onde a pessoa
 * olha primeiro. Eles continuam no cardápio, dentro da categoria deles: a
 * faixa é atalho, não é o único caminho.
 */

/** Faixa de combos colada ao banner. Só aparece quando há combo. */
function FaixaCombos({ combos }: { combos: ProdutoPublico[] }) {
  if (combos.length === 0) return null;

  const precos = combos.map((c) => c.preco).filter((p) => p !== null);
  const menor = precos.length > 0 ? Math.min(...precos) : null;
  // O destino é a categoria do próprio combo — entidade, nunca URL digitada.
  const slug = combos[0]?.categoria_slug ?? null;

  return (
    <section className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-16 bg-sidebar px-4 py-[14px]">
      <div className="min-w-0">
        <p className="m-0 font-display text-[17px] font-bold text-dark-ink">
          Combos para compartilhar
        </p>
        <p className="m-0 text-[13px] text-dark-ink-2">
          {combos.length} {combos.length === 1 ? "opção" : "opções"}
          {menor !== null ? ` · a partir de ${formatBRL(menor)}` : ""}
        </p>
      </div>

      {slug ? (
        <Link
          href={`/categoria/${slug}`}
          className="inline-flex min-h-touch items-center rounded-12 bg-cta px-[18px] text-[15px] font-semibold text-cta-fg no-underline"
        >
          Ver combos
        </Link>
      ) : null}
    </section>
  );
}

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
  combos,
}: {
  nomeLoja: string;
  combos: ProdutoPublico[];
}) {
  const banners = await listarBanners();
  if (banners.length === 0) {
    return (
      <>
      <section className="mx-4 mt-4 flex flex-wrap items-center gap-[18px] rounded-20 bg-sidebar p-5">
        <div className="min-w-[200px] flex-[1_1_220px]">
          <span className="inline-block rounded-pill bg-brand-yellow/15 px-[10px] py-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-brand-yellow">
            Tradição desde 1995
          </span>
          <h1 className="mb-[6px] mt-[10px] text-balance font-display text-[30px] font-extrabold leading-[1.08] text-dark-ink">
            {nomeLoja}
          </h1>
          <p className="m-0 max-w-[34ch] text-[15px] text-dark-ink-2">
            Massa fresca todos os dias, assada na hora e entregue quentinha na sua casa.
          </p>
        </div>
      </section>
      <FaixaCombos combos={combos} />
      </>
    );
  }

  const cartoes = await Promise.all(
    banners.map(async (b) => ({ ...b, url: await urlDaImagem(b.imagem_path), href: destino(b) })),
  );

  return (
    <>
      <CarrosselBanners banners={cartoes} />
      <FaixaCombos combos={combos} />
    </>
  );
}
