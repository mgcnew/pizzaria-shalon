import type { ReactNode } from "react";

/**
 * Cartão de seção — o contêiner branco do design: fundo --surface, borda
 * --border de 1px, raio 16px, padding 16px.
 */
export function Cartao({
  titulo,
  descricao,
  acao,
  children,
  largura = "estreito",
}: {
  titulo?: string;
  descricao?: string;
  acao?: ReactNode;
  children: ReactNode;
  largura?: "estreito" | "cheio";
}) {
  return (
    <section
      className={[
        "rounded-16 border border-border-shalon bg-surface p-4",
        largura === "estreito" ? "max-w-[620px]" : "",
      ].join(" ")}
    >
      {titulo ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-[10px]">
          <div>
            <h2 className="m-0 text-[15.5px] font-bold text-ink">{titulo}</h2>
            {descricao ? (
              <p className="mt-1 text-[12.5px] text-muted">{descricao}</p>
            ) : null}
          </div>
          {acao}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Linha de lista dentro de um cartão: separador inferior, 10px de respiro. */
export function LinhaLista({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border-shalon py-[10px] last:border-b-0">
      {children}
    </div>
  );
}

/** Par rótulo/valor, como nas seções "Dados da pizzaria" e "Pix" do design. */
export function ParDeDados({ chave, valor }: { chave: string; valor: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border-shalon py-[9px] last:border-b-0">
      <span className="shrink-0 text-[13.5px] text-muted">{chave}</span>
      <span className="min-w-0 break-words text-right text-[13.5px] font-semibold text-ink">{valor}</span>
    </div>
  );
}
