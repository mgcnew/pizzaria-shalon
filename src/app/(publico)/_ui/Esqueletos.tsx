import type { ReactNode } from "react";
import { Skeleton } from "@/ui/patterns";

/**
 * Peças dos skeletons de rota do cardápio público (`loading.tsx`).
 *
 * Mesmo princípio do painel (D-2026-09-29-87): cada página tem o seu, no
 * formato real dela, e o `loading.tsx` próprio é o que faz o Next pré-carregar
 * a rota e mostrar a tela nova no toque, em vez de manter a anterior parada
 * até o servidor responder. Títulos fixos são texto de verdade; o resto usa o
 * `Skeleton` do design. Ver D-2026-09-29-96.
 */

const passo = (i: number) => Math.min(i, 8) * 0.04;

export function TelaPublicaCarregando({
  nome,
  className = "",
  children,
}: {
  nome: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" className={`motion-tab-in ${className}`}>
      <span className="sr-only">Carregando {nome}</span>
      {children}
    </div>
  );
}

/** O link "← Voltar…" do topo das páginas internas. */
export function VoltarCarregando() {
  return (
    <div className="flex min-h-touch items-center">
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

/** Título de página, real quando é fixo; barra quando depende do dado. */
export function TituloPublicoCarregando({ titulo }: { titulo?: string }) {
  return titulo ? (
    <h1 className="m-0 mb-4 mt-2 font-display text-[26px] font-extrabold text-ink">{titulo}</h1>
  ) : (
    <Skeleton className="mb-4 mt-3 h-8 w-[min(260px,70%)]" delay={0.04} />
  );
}

/** O card do cardápio: foto 4:3, nome em duas linhas e a linha de preço. */
export function CardCarregando({ indice = 0 }: { indice?: number }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-16 border border-border-shalon bg-surface">
      <Skeleton className="aspect-[4/3] w-full rounded-none" delay={passo(indice)} />
      <div className="flex flex-1 flex-col gap-[6px] p-2 sm:p-3">
        <Skeleton className="h-[12px] w-[85%]" delay={passo(indice) + 0.02} />
        <Skeleton className="h-[12px] w-[55%]" delay={passo(indice) + 0.04} />
        <div className="mt-auto flex items-center justify-between gap-2 pt-[6px]">
          <Skeleton className="h-4 w-[45%]" delay={passo(indice) + 0.06} />
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" delay={passo(indice) + 0.08} />
        </div>
      </div>
    </div>
  );
}

/** A grade de cards, com as mesmas colunas da página. */
export function GradeCarregando({ quantidade }: { quantidade: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: quantidade }, (_, i) => (
        <CardCarregando key={i} indice={i} />
      ))}
    </div>
  );
}

/** Blocos de conteúdo (cartões de pedido, seções de formulário). */
export function BlocosPublicosCarregando({
  quantidade,
  className = "h-[96px]",
}: {
  quantidade: number;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: quantidade }, (_, i) => (
        <Skeleton key={i} className={`w-full rounded-14 ${className}`} delay={passo(i)} />
      ))}
    </div>
  );
}
