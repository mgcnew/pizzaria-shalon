import Link from "next/link";
import type { ChaveDePeriodo } from "@/application/analitico/tipos";

/**
 * Seleção de período.
 *
 * Links, não JavaScript: o período é estado de URL, então a pessoa pode
 * recarregar, voltar e compartilhar a tela que está vendo. Também é o que
 * permite ao servidor buscar já com o recorte certo, sem um segundo
 * carregamento (07 §9).
 */

const PERIODOS: { chave: ChaveDePeriodo; rotulo: string }[] = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "ontem", rotulo: "Ontem" },
  { chave: "7d", rotulo: "7 dias" },
  { chave: "30d", rotulo: "30 dias" },
  { chave: "mes_atual", rotulo: "Mês atual" },
];

export function SeletorDePeriodo({
  atual,
  base,
  extras = {},
}: {
  atual: ChaveDePeriodo;
  base: string;
  extras?: Record<string, string | undefined>;
}) {
  return (
    <nav aria-label="Período" className="flex flex-wrap gap-2">
      {PERIODOS.map((p) => {
        const parametros = new URLSearchParams();
        for (const [chave, valor] of Object.entries(extras)) {
          if (valor) parametros.set(chave, valor);
        }
        parametros.set("periodo", p.chave);
        const ativo = p.chave === atual;
        return (
          <Link
            key={p.chave}
            href={`${base}?${parametros.toString()}`}
            aria-current={ativo ? "page" : undefined}
            className={[
              "motion-interactive inline-flex min-h-touch items-center rounded-11 px-[14px] text-[13.5px] font-semibold transition-colors",
              ativo
                ? "bg-cta text-cta-fg"
                : "border-[1.5px] border-border-shalon text-ink hover:border-brand-orange",
            ].join(" ")}
          >
            {p.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
