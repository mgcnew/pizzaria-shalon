import Link from "next/link";
import type { ReactNode } from "react";
import { IndicadorDeNavegacao } from "@/ui/components/IndicadorDeNavegacao";

/**
 * Abas em pílula com rolagem horizontal — o mesmo padrão do design aprovado
 * em "Produtos" e em "Configurações": altura mínima 42px, raio 999px, borda
 * de 1.5px, e a aba ativa no par CTA.
 *
 * DIFERENÇA DELIBERADA: no protótipo a aba era estado de JavaScript. Aqui é
 * um link com parâmetro na URL — a página continua sendo Server Component, a
 * aba fica compartilhável e o botão "voltar" do navegador funciona (PI-004).
 *
 * Trocar só a query não mostra o `loading.tsx` da rota: o Next mantém a aba
 * anterior na tela até o servidor responder. O traço pulsante na base da aba
 * clicada é o retorno visual dessa espera.
 */

export type Aba = { nome: string; valor: string };

export function Abas({
  abas,
  atual,
  parametro,
  base,
}: {
  abas: readonly Aba[];
  atual: string;
  parametro: string;
  base: string;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      role="tablist"
      aria-label="Seções"
    >
      {abas.map((aba) => {
        const ativa = aba.valor === atual;
        return (
          <Link
            key={aba.valor}
            href={`${base}?${parametro}=${aba.valor}`}
            role="tab"
            aria-selected={ativa}
            className={[
              "relative inline-flex min-h-[42px] shrink-0 items-center rounded-pill border-[1.5px] px-[14px]",
              "text-[13.5px] font-semibold",
              ativa
                ? "border-cta bg-cta text-cta-fg"
                : "border-border-shalon bg-surface text-ink-2 hover:border-brand-orange",
            ].join(" ")}
          >
            {aba.nome}
            <IndicadorDeNavegacao forma="traco" tom={ativa ? "texto" : "marca"} />
          </Link>
        );
      })}
    </div>
  );
}

export type AbaComIcone = Aba & { icone: ReactNode };

/**
 * As mesmas abas, para quando são muitas e não cabem no celular: abaixo de
 * `md`, uma grade de ícones sem rolagem lateral, com o nome da aba ativa logo
 * abaixo; a partir de 480px cada ícone já leva o nome. De `md` em diante, as
 * pílulas de sempre.
 */
export function AbasComIcones({
  abas,
  atual,
  parametro,
  base,
}: {
  abas: readonly AbaComIcone[];
  atual: string;
  parametro: string;
  base: string;
}) {
  const nomeAtivo = abas.find((aba) => aba.valor === atual)?.nome;
  return (
    <div>
      <div
        className="grid gap-1 md:flex md:gap-2"
        style={{ gridTemplateColumns: `repeat(${abas.length}, minmax(0, 1fr))` }}
        role="tablist"
        aria-label="Seções"
      >
        {abas.map((aba) => {
          const ativa = aba.valor === atual;
          return (
            <Link
              key={aba.valor}
              href={`${base}?${parametro}=${aba.valor}`}
              role="tab"
              aria-selected={ativa}
              aria-label={aba.nome}
              title={aba.nome}
              className={[
                "relative flex min-h-touch min-w-0 flex-col items-center justify-center gap-[2px] rounded-12 border-[1.5px] py-1",
                "md:inline-flex md:min-h-[42px] md:flex-row md:rounded-pill md:px-[14px] md:py-0",
                ativa
                  ? "border-cta bg-cta text-cta-fg"
                  : "border-border-shalon bg-surface text-ink-2 hover:border-brand-orange",
              ].join(" ")}
            >
              <span className="flex md:hidden">{aba.icone}</span>
              <span className="hidden truncate text-[10.5px] font-semibold min-[480px]:block md:block md:text-[13.5px]">
                {aba.nome}
              </span>
              <IndicadorDeNavegacao forma="traco" tom={ativa ? "texto" : "marca"} />
            </Link>
          );
        })}
      </div>
      <p className="mb-0 mt-2 text-center text-[13px] font-semibold text-ink min-[480px]:hidden">
        {nomeAtivo}
      </p>
    </div>
  );
}
