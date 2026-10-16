import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Moldura das telas de acesso do painel (15/10/2026): login, recuperação e
 * nova senha usam a mesma, para que as três pareçam um fluxo só.
 *
 * Duas faixas: a da MARCA (fundo escuro da barra lateral do painel, com o
 * logo e uma frase do que o painel é) e a do FORMULÁRIO. No computador ficam
 * lado a lado; no celular a marca vira uma faixa curta no topo e o cartão
 * sobe sobre ela, sem rolagem desnecessária.
 *
 * Só usa tokens do design aprovado: `sidebar`, `dark-ink`, o amarelo da
 * marca e o CTA. O brilho do fundo é decoração e nunca carrega texto.
 */
export function MolduraDeAcesso({
  titulo,
  subtitulo,
  children,
  rodape,
}: {
  titulo: string;
  subtitulo: string;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  return (
    <main
      data-acento="vermelho"
      className="grid min-h-screen bg-bg lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
    >
      {/* Marca */}
      <section
        aria-label="Pizzaria Shalon"
        className="relative isolate flex flex-col items-center justify-center overflow-hidden bg-sidebar px-6 pb-14 pt-9 text-center lg:items-start lg:justify-between lg:px-12 lg:py-14 lg:text-left"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 -z-10 h-[360px] w-[360px] rounded-full bg-brand-yellow/20 blur-[90px] lg:-right-32 lg:-top-32 lg:h-[520px] lg:w-[520px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-24 -z-10 hidden h-[420px] w-[420px] rounded-full bg-brand-red/30 blur-[100px] lg:block"
        />

        <Image
          src="/marca/logo-shalon.webp"
          alt="Pizzaria Shalon — Tradição desde 1995"
          width={512}
          height={256}
          priority
          className="h-[64px] w-auto lg:h-[96px]"
        />

        <div className="hidden lg:block">
          <span className="inline-block rounded-pill bg-brand-yellow/15 px-[10px] py-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-brand-yellow">
            Painel da equipe
          </span>
          <p className="mb-0 mt-4 max-w-[18ch] text-balance font-display text-[40px] font-extrabold leading-[1.05] text-dark-ink">
            Pedidos, caixa e cardápio no mesmo lugar.
          </p>
          <p className="mb-0 mt-4 max-w-[38ch] text-[16px] text-dark-ink-2">
            Tradição desde 1995, agora com tudo à mão para quem toca o balcão.
          </p>
        </div>

        <p className="m-0 hidden text-[12.5px] text-dark-ink-2 lg:block">
          Acesso restrito à equipe da Pizzaria Shalon.
        </p>
      </section>

      {/* Formulário */}
      <section className="relative z-10 -mt-7 flex items-start justify-center px-4 pb-10 lg:mt-0 lg:items-center lg:px-12 lg:py-14">
        <div className="w-full max-w-[420px]">
          <div className="rounded-20 border border-border-shalon bg-surface p-6 shadow-[0_18px_48px_rgb(30_24_20/0.12)] lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            <h1 className="m-0 font-display text-[26px] font-extrabold leading-[1.1] text-ink lg:text-[30px]">
              {titulo}
            </h1>
            <p className="mb-0 mt-1.5 text-[14.5px] text-ink-2">{subtitulo}</p>

            {children}
          </div>

          {rodape ? <div className="mt-5 text-center text-[13px] text-muted">{rodape}</div> : null}
        </div>
      </section>
    </main>
  );
}
