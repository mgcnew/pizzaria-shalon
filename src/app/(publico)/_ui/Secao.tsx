import type { ReactNode } from "react";

/**
 * Cabeçalho de seção do cardápio — o do design: título em Bricolage
 * Grotesque 21px, legenda opcional alinhada à direita.
 */
export function Secao({
  titulo,
  legenda,
  children,
  className = "",
}: {
  titulo: string;
  legenda?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`px-4 pt-6 ${className}`}>
      <div className="flex items-baseline justify-between gap-3 pb-3">
        <h2 className="m-0 font-display text-[21px] font-bold text-ink">{titulo}</h2>
        {legenda ? <span className="text-[13px] text-muted">{legenda}</span> : null}
      </div>
      {children}
    </section>
  );
}
