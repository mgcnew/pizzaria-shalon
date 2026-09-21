import { Skeleton, SkeletonCard } from "@/ui/patterns";

export default function LoadingPublico() {
  return (
    <div role="status" aria-live="polite" className="motion-tab-in flex flex-col gap-4 px-4 py-5">
      <span className="sr-only">Carregando cardápio</span>
      <Skeleton className="h-[50px] w-full rounded-12" />
      <Skeleton className="h-[240px] w-full rounded-20" delay={0.08} />
      <div className="flex gap-4 overflow-hidden py-1">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-[74px] w-[74px] shrink-0 rounded-pill" delay={item * 0.05} />
        ))}
      </div>
      <div className="rounded-16 border border-border-shalon bg-surface p-3">
        <SkeletonCard />
      </div>
      <div className="rounded-16 border border-border-shalon bg-surface p-3">
        <SkeletonCard />
      </div>
    </div>
  );
}
