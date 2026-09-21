import { Skeleton } from "@/ui/patterns";

export default function LoadingAdmin() {
  return (
    <div role="status" aria-live="polite" className="motion-tab-in flex flex-col gap-4 px-4 py-5">
      <span className="sr-only">Carregando conteúdo</span>
      <div className="flex items-center justify-between gap-4">
        <div className="flex w-full max-w-[360px] flex-col gap-2">
          <Skeleton className="h-6 w-[42%]" />
          <Skeleton className="h-3 w-[72%]" delay={0.08} />
        </div>
        <Skeleton className="h-11 w-32 rounded-11" delay={0.12} />
      </div>
      <Skeleton className="h-12 w-full rounded-12" delay={0.16} />
      <Skeleton className="h-28 w-full rounded-16" delay={0.2} />
      <Skeleton className="h-28 w-full rounded-16" delay={0.24} />
    </div>
  );
}
