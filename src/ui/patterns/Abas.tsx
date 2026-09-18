import Link from "next/link";

/**
 * Abas em pílula com rolagem horizontal — o mesmo padrão do design aprovado
 * em "Produtos" e em "Configurações": altura mínima 42px, raio 999px, borda
 * de 1.5px, e a aba ativa no par CTA.
 *
 * DIFERENÇA DELIBERADA: no protótipo a aba era estado de JavaScript. Aqui é
 * um link com parâmetro na URL — a página continua sendo Server Component, a
 * aba fica compartilhável e o botão "voltar" do navegador funciona (PI-004).
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
              "inline-flex min-h-[42px] shrink-0 items-center rounded-pill border-[1.5px] px-[14px]",
              "text-[13.5px] font-semibold",
              ativa
                ? "border-cta bg-cta text-cta-fg"
                : "border-border-shalon bg-surface text-ink-2 hover:border-brand-orange",
            ].join(" ")}
          >
            {aba.nome}
          </Link>
        );
      })}
    </div>
  );
}
