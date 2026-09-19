import Link from "next/link";

/**
 * Busca do cardápio — a do design: caixa de 50px, borda 1.5px, raio 14,
 * ícone à esquerda e botão de limpar quando há termo.
 *
 * É um formulário GET: o termo viaja na URL, a página continua Server
 * Component e o resultado é compartilhável. A consulta acontece no banco,
 * com normalização de acento e caixa (RN-BUSCA-001) — não se carrega o
 * cardápio inteiro no navegador para filtrar depois.
 */
export function Busca({ termo }: { termo: string }) {
  return (
    <div className="px-4 pt-4">
      <form
        role="search"
        action="/"
        className="flex items-center gap-[10px] rounded-14 border-[1.5px] border-border-shalon bg-surface px-[14px] focus-within:border-brand-orange"
      >
        <span aria-hidden="true" className="text-[17px] text-muted">
          ⌕
        </span>
        <input
          type="search"
          name="q"
          defaultValue={termo}
          aria-label="Buscar no cardápio"
          placeholder="Buscar pizzas, sabores, combos..."
          className="min-h-[50px] flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
        />
        {termo ? (
          <Link
            href="/"
            aria-label="Limpar busca"
            className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-pill bg-tn text-[15px] text-ink-2"
          >
            ×
          </Link>
        ) : null}
      </form>
    </div>
  );
}
