import type { ReactNode } from "react";

/**
 * Formulário de criar, recolhido por padrão (15/10/2026).
 *
 * O formulário de "novo" ficava aberto ao fim de toda lista, empurrando o que
 * a pessoa veio ver — e a lista é o que se consulta 90% das vezes. Fechado ele
 * vira uma linha de ação; aberto, é o mesmo formulário de antes. Sem
 * JavaScript: é um `<details>`.
 */
export function NovoItem({
  titulo,
  descricao,
  children,
  aberto = false,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
  /** Abre sozinho quando não há nada cadastrado: o próximo passo é criar. */
  aberto?: boolean;
}) {
  return (
    <details
      open={aberto}
      className="group rounded-14 border border-dashed border-border-shalon bg-surface open:border-solid"
    >
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 rounded-14 px-4 text-[14.5px] font-bold text-ink marker:hidden hover:bg-elev [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-pill bg-cta text-[19px] font-semibold leading-none text-cta-fg transition-transform group-open:rotate-45"
        >
          +
        </span>
        {titulo}
      </summary>
      <div className="border-t border-border-shalon p-4">
        {descricao ? <p className="m-0 mb-3 text-[13px] text-muted">{descricao}</p> : null}
        {children}
      </div>
    </details>
  );
}
