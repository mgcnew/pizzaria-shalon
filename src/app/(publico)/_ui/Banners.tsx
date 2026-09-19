import Image from "next/image";
import Link from "next/link";
import { listarBanners, urlDaImagem } from "@/application/publico/consultas";
import type { BannerPublico } from "@/application/publico/tipos";

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

export async function Banners() {
  const banners = await listarBanners();
  if (banners.length === 0) return null;

  const cartoes = await Promise.all(
    banners.map(async (b) => ({ ...b, url: await urlDaImagem(b.imagem_path), href: destino(b) })),
  );

  return (
    <section aria-label="Destaques da Shalon" className="pt-4">
      <div className="flex snap-x snap-proximity gap-[14px] overflow-x-auto px-4 pb-[6px]">
        {cartoes.map((b) => {
          const conteudo = (
            <>
              <Image
                src={b.url}
                alt={b.titulo ?? "Banner da Pizzaria Shalon"}
                width={640}
                height={320}
                className="h-[150px] w-full object-cover"
              />
              {b.titulo || b.corpo ? (
                <div className="px-[14px] py-3">
                  {b.titulo ? (
                    <p className="m-0 font-display text-[18px] font-bold text-ink">{b.titulo}</p>
                  ) : null}
                  {b.corpo ? (
                    <p className="mt-1 text-[13.5px] text-ink-2">{b.corpo}</p>
                  ) : null}
                </div>
              ) : null}
            </>
          );

          const classe =
            "block w-[min(86%,520px)] shrink-0 snap-start overflow-hidden rounded-18 border border-border-shalon bg-surface";

          if (!b.href) {
            return (
              <div key={b.id} className={classe}>
                {conteudo}
              </div>
            );
          }

          return b.destino_tipo === "external" ? (
            <a
              key={b.id}
              href={b.href}
              target="_blank"
              rel="noopener noreferrer"
              className={classe}
            >
              {conteudo}
            </a>
          ) : (
            <Link key={b.id} href={b.href} className={classe}>
              {conteudo}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
