import Link from "next/link";

/**
 * Busca do cardápio — caixa de 50px, borda 1.5px, raio discreto,
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
        className="flex min-h-[50px] items-center gap-[10px] rounded-10 border-[1.5px] border-border-shalon bg-surface px-[14px] transition-colors focus-within:border-brand-orange"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          width="20"
          height="20"
          className="h-5 w-5 shrink-0 text-muted"
          style={{ width: 20, height: 20 }}
        >
          <circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.8" />
          <path d="m15.5 15.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <label htmlFor="busca-cardapio" className="sr-only">
          Buscar no cardápio
        </label>
        <input
          id="busca-cardapio"
          type="search"
          name="q"
          defaultValue={termo}
          placeholder="Buscar pizzas, sabores, combos..."
          enterKeyHint="search"
          autoComplete="off"
          className="min-h-[48px] min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
        />
        {termo ? (
          <Link
            href="/"
            aria-label="Limpar busca"
            className="flex min-h-touch min-w-touch items-center justify-center rounded-10 bg-tn text-[18px] text-ink-2 transition-colors hover:bg-border-shalon hover:text-ink"
          >
            ×
          </Link>
        ) : null}
      </form>
    </div>
  );
}
