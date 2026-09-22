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
  // Fica no canto: a arte do banner é a mensagem, e o botão não pode cobri-la.
  const classe =
    "motion-interactive absolute bottom-3 right-3 z-10 inline-flex min-h-touch items-center gap-1.5 rounded-12 bg-cta px-3 text-[13px] font-bold text-cta-fg shadow-[0_8px_24px_rgb(0_0_0/0.28)] transition-transform hover:-translate-y-0.5 sm:bottom-4 sm:right-4 sm:px-4 sm:text-[14px]";

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

  // A arte é enviada em 2:1. A moldura acompanha essa proporção para que nada
  // seja cortado — nem no celular, nem no desktop.
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
      className="relative mx-4 mt-4 aspect-[2/1] overflow-hidden rounded-20 bg-sidebar shadow-[0_12px_30px_rgb(30_24_20/0.14)]"
    >
      <div key={banner.id} className="motion-tab-in absolute inset-0">
        <Image
          src={banner.url}
          alt={banner.titulo ?? "Destaque da Pizzaria Shalon"}
          fill
          sizes="(max-width: 768px) calc(100vw - 32px), 1088px"
          priority={atual === 0}
          className="object-cover"
        />
        {/* Sem véu escuro sobre a imagem: o banner existe para chamar atenção.
            Texto só aparece quando foi cadastrado, e então ganha sombra
            própria em vez de escurecer a arte inteira. */}
        {banner.titulo || banner.corpo ? (
          <div className="absolute inset-x-0 top-0 p-5 sm:p-8">
            <div className="max-w-[min(78%,560px)] [text-shadow:0_2px_10px_rgb(0_0_0/0.65)]">
              {banner.titulo ? (
                <h1 className="mb-0 text-balance font-display text-[clamp(25px,5vw,42px)] font-extrabold leading-[1.02] text-dark-ink">
                  {banner.titulo}
                </h1>
              ) : null}
              {banner.corpo ? (
                <p className="mb-0 mt-2 max-w-[42ch] text-[clamp(13px,2.2vw,16px)] leading-[1.45] text-dark-ink-2">
                  {banner.corpo}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        <ChamadaBanner banner={banner} />
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
              className="flex h-2.5 w-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0"
            >
              <span
                className={[
                  "motion-interactive block h-2.5 w-6 rounded-pill transition-[background-color,transform]",
                  indice === atual
                    ? "scale-x-100 bg-brand-yellow"
                    : "scale-x-[0.42] bg-white/65 hover:bg-white",
                ].join(" ")}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
