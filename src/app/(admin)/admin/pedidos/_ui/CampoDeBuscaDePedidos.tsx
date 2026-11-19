"use client";

/**
 * Campo de busca da fila, no mesmo desenho da busca de Clientes.
 *
 * Filtra no navegador, a cada tecla, sem ir ao servidor: a lista já está
 * toda na tela (`filtrarPedidosPorBusca`).
 */
export function CampoDeBuscaDePedidos({
  id,
  valor,
  aoMudar,
}: {
  id: string;
  valor: string;
  aoMudar: (valor: string) => void;
}) {
  return (
    <div className="relative w-full sm:w-[260px]">
      <label htmlFor={id} className="sr-only">
        Buscar pedido por número ou nome do cliente
      </label>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 size-[16px] -translate-y-1/2 text-muted">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id={id}
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") aoMudar("");
        }}
        placeholder="Número ou cliente"
        autoComplete="off"
        enterKeyHint="search"
        className="min-h-touch w-full rounded-11 border-[1.5px] border-border-shalon bg-surface pl-9 pr-3 text-[13.5px] text-ink focus:border-brand-orange focus:outline-none"
      />
    </div>
  );
}
