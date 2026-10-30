"use client";

export type AtalhoDaFaixa = {
  tecla: string;
  rotulo: string;
  /** Inativo fica apagado, sem sumir: a faixa não muda de lugar nem de tamanho. */
  ativo: boolean;
  /** Só faz sentido com teclado, e some abaixo de `lg`. */
  soTeclado?: boolean;
};

/**
 * Atalhos sempre à vista e clicáveis (D-2026-10-30-179), no PDV e em Pedidos.
 * Fica presa sob o cabeçalho, porque o rodapé das duas telas já tem barra.
 *
 * `onMouseDown` impede o botão de tomar o foco: o campo de leitura do PDV
 * continua pronto para o próximo bipe. Quem decide o que cada um faz é a mesma
 * tabela do teclado, então o clique não abre um caminho que a tecla recusaria.
 */
export function FaixaDeAtalhos({
  atalhos,
  aoAcionar,
}: {
  atalhos: readonly AtalhoDaFaixa[];
  aoAcionar: (atalho: AtalhoDaFaixa) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Atalhos"
      className="sticky top-[53px] z-20 flex flex-wrap gap-1.5 rounded-12 border border-border-shalon bg-elev p-1.5 shadow-[0_4px_14px_rgb(41_37_36/0.08)]"
    >
      {atalhos.map((a) => (
        <button
          key={a.tecla}
          type="button"
          disabled={!a.ativo}
          aria-keyshortcuts={a.tecla.length > 1 && a.tecla.startsWith("F") ? a.tecla : undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => aoAcionar(a)}
          className={[
            "min-h-touch min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-9 border border-border-shalon bg-surface px-1.5 text-[12px] font-semibold leading-[1.15] text-ink hover:border-brand-orange disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border-shalon lg:min-h-9 lg:flex-none lg:px-2.5",
            a.soTeclado ? "hidden lg:flex" : "flex",
          ].join(" ")}
        >
          <kbd className="hidden rounded-8 border border-border-shalon bg-elev px-1.5 py-[1px] font-mono text-[11px] font-semibold text-ink lg:inline">
            {a.tecla}
          </kbd>
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}
