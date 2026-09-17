/**
 * Skeleton — vitrine "Estados › Skeleton / Loading" do design aprovado.
 *
 * Usa o fundo neutro (--shalon-tn) e a animação shalonPulse do protótipo.
 * O atraso escalonado entre linhas reproduz o efeito do design.
 */

export function Skeleton({
  className = "",
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-shalon-pulse rounded-6 bg-tn ${className}`}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    />
  );
}

/** Esqueleto de cartão de produto: miniatura + três linhas, como no design. */
export function SkeletonCard() {
  return (
    <div className="flex gap-3">
      <Skeleton className="h-[84px] w-[84px] shrink-0 rounded-12" />
      <div className="flex flex-1 flex-col gap-2 pt-1">
        <Skeleton className="h-[14px] w-[70%]" />
        <Skeleton className="h-[12px] w-[90%]" delay={0.15} />
        <Skeleton className="h-[12px] w-[50%]" delay={0.3} />
      </div>
    </div>
  );
}
