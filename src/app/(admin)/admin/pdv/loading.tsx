import { Skeleton } from "@/ui/patterns";
import { CabecalhoCarregando, TelaCarregando } from "../_ui/Esqueletos";

/**
 * Skeleton do PDV: busca/leitor, lista da venda e a barra de operações
 * encostada embaixo, na mesma altura mínima da página, para que nada salte
 * quando o PDV chega.
 */
export default function Loading() {
  return (
    <TelaCarregando nome="o PDV" className="flex min-h-[calc(100dvh-111px)] flex-col gap-5">
      <CabecalhoCarregando
        titulo="PDV"
        subtitulo={2}
        className="flex flex-wrap items-start justify-between gap-3"
        reserva="min-w-[min(100%,720px)]"
        acoes={<Skeleton className="h-9 w-[132px] rounded-pill" delay={0.06} />}
      />

      <section className="rounded-16 border border-border-shalon bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-11 w-24 rounded-11" delay={0.04} />
        </div>
        <Skeleton className="mt-3 h-12 w-full rounded-11" delay={0.06} />
        <Skeleton className="mt-2 h-3 w-[min(360px,80%)]" delay={0.08} />
        <div className="mt-4 overflow-hidden rounded-12 border border-border-shalon">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 border-b border-border-shalon px-3 py-3 last:border-b-0"
            >
              <Skeleton className={`h-[13px] ${["w-[48%]", "w-[62%]", "w-[40%]"][i]}`} delay={0.1 + i * 0.04} />
              <Skeleton className="h-[13px] w-16" delay={0.12 + i * 0.04} />
            </div>
          ))}
        </div>
        <Skeleton className="mt-3 h-[52px] w-full rounded-13" delay={0.24} />
      </section>

      <div className="mt-auto pt-2">
        <Skeleton className="h-14 w-full rounded-16" delay={0.28} />
      </div>
    </TelaCarregando>
  );
}
