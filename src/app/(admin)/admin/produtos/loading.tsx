import { Skeleton } from "@/ui/patterns";
import {
  BotaoCarregando,
  CabecalhoCarregando,
  TabelaCarregando,
  TelaCarregando,
} from "../_ui/Esqueletos";

/**
 * Skeleton do catálogo: busca com filtro, tabela no desktop e cartões com
 * foto abaixo de `lg`, como o `PainelProdutos`.
 *
 * As ferramentas (categorias, tamanhos, combos…) e a edição abrem em modal por
 * query ou por rota interceptada, sem passar por aqui.
 */
export default function Loading() {
  return (
    <TelaCarregando nome="os produtos" className="flex flex-col gap-4">
      <CabecalhoCarregando
        titulo="Produtos"
        como="h2"
        classeTitulo="text-[22px] font-extrabold"
        className="flex items-start justify-between gap-4"
        reserva="min-w-[min(100%,170px)]"
        acoes={
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
            <BotaoCarregando className="w-[150px]" />
            <BotaoCarregando className="w-[104px]" />
          </div>
        }
      />

      <div className="mb-[14px] flex items-center gap-[10px]">
        <Skeleton className="h-12 min-w-0 flex-1 rounded-12" delay={0.04} />
        <Skeleton className="h-12 w-12 shrink-0 rounded-12 sm:w-[108px]" delay={0.06} />
      </div>

      <TabelaCarregando linhas={7} colunas={5} className="hidden lg:block" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:hidden">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded-16 border border-border-shalon bg-surface"
          >
            <Skeleton className="aspect-[5/2] w-full rounded-none" delay={i * 0.04} />
            <div className="p-3">
              <Skeleton className="h-[14px] w-[62%]" delay={i * 0.04 + 0.04} />
              <Skeleton className="mt-2 h-3 w-[84%]" delay={i * 0.04 + 0.06} />
              <div className="mt-3 flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-16" delay={i * 0.04 + 0.08} />
                <Skeleton className="h-10 w-24 rounded-10" delay={i * 0.04 + 0.1} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </TelaCarregando>
  );
}
