"use client";

import { useState, type ReactNode } from "react";

export type SecaoEdicaoProduto = {
  id: string;
  nome: string;
  conteudo: ReactNode;
};

export function AbasEdicaoProduto({ secoes }: { secoes: SecaoEdicaoProduto[] }) {
  const [ativa, setAtiva] = useState(secoes[0]?.id ?? "");
  const secaoAtual = secoes.find((secao) => secao.id === ativa) ?? secoes[0];

  if (!secaoAtual) return null;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Seções da edição do produto"
        className="flex gap-1.5 overflow-x-auto rounded-14 border border-border-shalon bg-elev p-1.5"
      >
        {secoes.map((secao, indice) => {
          const selecionada = secao.id === secaoAtual.id;
          return (
            <button
              key={secao.id}
              type="button"
              role="tab"
              id={`aba-produto-${secao.id}`}
              aria-controls={`painel-produto-${secao.id}`}
              aria-selected={selecionada}
              onClick={() => setAtiva(secao.id)}
              className={[
                "inline-flex min-h-touch shrink-0 cursor-pointer items-center gap-2 rounded-11 border-0 px-3 text-[12.5px] font-bold transition-colors",
                selecionada
                  ? "bg-cta text-cta-fg shadow-[0_4px_12px_rgb(30_24_20/0.1)]"
                  : "bg-transparent text-ink-2 hover:bg-surface hover:text-ink",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-5 w-5 items-center justify-center rounded-pill text-[10px] font-extrabold",
                  selecionada ? "bg-white/20" : "bg-tn text-muted",
                ].join(" ")}
              >
                {indice + 1}
              </span>
              {secao.nome}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`painel-produto-${secaoAtual.id}`}
        aria-labelledby={`aba-produto-${secaoAtual.id}`}
      >
        {secaoAtual.conteudo}
      </div>
    </div>
  );
}
