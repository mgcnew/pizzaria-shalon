"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { BannerPublico } from "@/application/publico/tipos";

export type BannerDoCarrossel = BannerPublico & {
  url: string;
  href: string | null;
};

function ChamadaBanner({ banner }: { banner: BannerDoCarrossel }) {
  const conteudo = (
    <>
      <span>{banner.destino_tipo === "promotion" ? "Ver promoção" : "Ver destaque"}</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </>
  );
  const classe =
    "mt-4 inline-flex min-h-touch items-center gap-2 rounded-12 bg-cta px-4 text-[14px] font-bold text-cta-fg shadow-[0_8px_24px_rgb(0_0_0/0.18)] transition-transform hover:-translate-y-0.5";

  if (!banner.href) return null;

  return banner.destino_tipo === "external" ? (
    <a href={banner.href} target="_blank" rel="noopener noreferrer" className={classe}>
      {conteudo}
    </a>
  ) : (
    <Link href={banner.href} className={classe}>
      {conteudo}
    </Link>
  );
}

export function CarrosselBanners({ banners }: { banners: BannerDoCarrossel[] }) {
  const [atual, setAtual] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (banners.length < 2 || pausado) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const intervalo = window.setInterval(() => {
      setAtual((indice) => (indice + 1) % banners.length);
    }, 5500);

    return () => window.clearInterval(intervalo);
  }, [banners.length, pausado]);

  const banner = banners[atual] ?? banners[0];
  if (!banner) return null;

  return (
    <section
      aria-label="Destaques e promoções da Shalon"
      aria-roledescription="carrossel"
      onPointerEnter={() => setPausado(true)}
      onPointerLeave={() => setPausado(false)}
      onFocusCapture={() => setPausado(true)}
      onBlurCapture={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget)) setPausado(false);
      }}
      className="relative mx-4 mt-4 h-[clamp(240px,45vw,360px)] overflow-hidden rounded-20 bg-sidebar shadow-[0_12px_30px_rgb(30_24_20/0.14)]"
    >
      <div key={banner.id} className="absolute inset-0 [animation:shalonFadeIn_320ms_ease-out_both]">
        <Image
          src={banner.url}
          alt={banner.titulo ?? "Destaque da Pizzaria Shalon"}
          fill
          sizes="(max-width: 768px) calc(100vw - 32px), 1088px"
          priority={atual === 0}
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(24_15_11/0.92)_0%,rgb(24_15_11/0.7)_48%,rgb(24_15_11/0.12)_100%)]" />
        <div className="absolute inset-0 flex items-end p-5 pb-11 sm:items-center sm:p-8 sm:pb-12">
          <div className="max-w-[min(78%,560px)]">
            <span className="inline-flex rounded-pill border border-brand-yellow/30 bg-black/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-yellow backdrop-blur-sm">
              {banner.destino_tipo === "promotion" ? "Oferta por tempo limitado" : "Destaque Shalon"}
            </span>
            {banner.titulo ? (
              <h1 className="mb-0 mt-2.5 text-balance font-display text-[clamp(25px,5vw,42px)] font-extrabold leading-[1.02] text-dark-ink">
                {banner.titulo}
              </h1>
            ) : null}
            {banner.corpo ? (
              <p className="mb-0 mt-2 max-w-[42ch] text-[clamp(13px,2.2vw,16px)] leading-[1.45] text-dark-ink-2">
                {banner.corpo}
              </p>
            ) : null}
            <ChamadaBanner banner={banner} />
          </div>
        </div>
      </div>

      {banners.length > 1 ? (
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-pill bg-black/35 px-3 py-2 backdrop-blur-sm">
          {banners.map((item, indice) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAtual(indice)}
              aria-label={`Mostrar destaque ${indice + 1} de ${banners.length}`}
              aria-current={indice === atual ? "true" : undefined}
              className={[
                "h-2.5 cursor-pointer rounded-pill border-0 transition-[width,background-color]",
                indice === atual ? "w-6 bg-brand-yellow" : "w-2.5 bg-white/65 hover:bg-white",
              ].join(" ")}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
