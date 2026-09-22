import { Skeleton } from "@/ui/patterns";

/** Estrutura imediata do modal enquanto somente o seu conteúdo é carregado. */
export function ModalCarregando({ titulo }: { titulo: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-70 flex overflow-y-auto bg-bg lg:items-center lg:justify-center lg:bg-[var(--shalon-scrim-sheet)] lg:p-6"
    >
      <span className="sr-only">Carregando {titulo}</span>
      <section className="motion-modal-in relative flex min-h-full w-full flex-col bg-bg lg:min-h-0 lg:max-h-[88vh] lg:max-w-[760px] lg:overflow-hidden lg:rounded-18 lg:border lg:border-border-shalon lg:bg-surface lg:shadow-[0_22px_70px_rgb(30_24_20/0.26)]">
        <header className="flex shrink-0 items-center gap-3 border-b border-border-shalon bg-surface px-5 py-4">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" delay={0.05} />
          </div>
          <Skeleton className="h-11 w-11 rounded-11" delay={0.08} />
        </header>
        <div className="flex flex-col gap-4 p-5">
          <Skeleton className="h-12 w-full rounded-12" delay={0.1} />
          <Skeleton className="h-32 w-full rounded-16" delay={0.14} />
          <Skeleton className="h-32 w-full rounded-16" delay={0.18} />
        </div>
      </section>
    </div>
  );
}
