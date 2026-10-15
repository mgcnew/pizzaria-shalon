"use client";

import { useState } from "react";

/**
 * Escolha dos itens da promoção: busca + marcação de vários (15/10/2026).
 *
 * Os `<input type="checkbox" name={nomeDoCampo}>` ficam sempre montados — a busca só
 * esconde linhas —, então marcar, buscar outra coisa e marcar de novo não
 * perde nada. Cada marcado é um item da promoção.
 */
export type OpcaoDeItem = {
  valor: string;
  nome: string;
  /** Texto à direita: o preço normal já formatado. */
  detalhe: string;
  grupo: string;
};

export function SeletorDeItensDaPromocao({
  opcoes,
  nomeDoCampo = "alvo",
  titulo = "Quais itens entram?",
  ajuda = "Marque quantos quiser. Todos recebem o mesmo preço promocional e as mesmas regras de dia e período.",
}: {
  opcoes: OpcaoDeItem[];
  /** O `name` das caixas: `alvo` na promoção, `produto` no banner. */
  nomeDoCampo?: string;
  titulo?: string;
  ajuda?: string;
}) {
  const [termo, setTermo] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const busca = termo.trim().toLowerCase();
  const visiveis = (o: OpcaoDeItem) =>
    busca === "" || `${o.nome} ${o.grupo}`.toLowerCase().includes(busca);
  const grupos = [...new Set(opcoes.map((o) => o.grupo))];
  const quantosVisiveis = opcoes.filter(visiveis).length;

  function alternar(valor: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(valor)) novo.delete(valor);
      else novo.add(valor);
      return novo;
    });
  }

  function marcarVisiveis() {
    setMarcados((atual) => {
      const novo = new Set(atual);
      for (const o of opcoes) if (visiveis(o)) novo.add(o.valor);
      return novo;
    });
  }

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1 p-0 text-[14px] font-bold text-ink">{titulo}</legend>
      <p className="m-0 mb-2 text-[12.5px] text-muted">{ajuda}</p>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label htmlFor={`busca-${nomeDoCampo}`} className="sr-only">
          Buscar item
        </label>
        <input
          id={`busca-${nomeDoCampo}`}
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar item… (ex.: calabresa)"
          autoComplete="off"
          className="min-h-touch min-w-0 flex-1 rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[15px] text-ink focus:border-brand-orange focus:outline-none"
        />
        {busca !== "" && quantosVisiveis > 0 ? (
          <button
            type="button"
            onClick={marcarVisiveis}
            className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-transparent px-3 text-[13px] font-semibold text-ink hover:border-brand-orange"
          >
            Marcar os {quantosVisiveis} encontrados
          </button>
        ) : null}
      </div>

      <div className="max-h-[260px] overflow-y-auto rounded-12 border border-border-shalon bg-surface">
        {grupos.map((grupo) => {
          const doGrupo = opcoes.filter((o) => o.grupo === grupo);
          if (!doGrupo.some(visiveis)) return null;
          return (
            <div key={grupo}>
              <p className="m-0 bg-elev px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.04em] text-muted">
                {grupo}
              </p>
              {doGrupo.map((o) => (
                <label
                  key={o.valor}
                  hidden={!visiveis(o)}
                  className="flex min-h-[44px] cursor-pointer items-center gap-3 border-t border-border-shalon px-3 py-1.5 text-[14px] text-ink first:border-t-0"
                >
                  <input
                    type="checkbox"
                    name={nomeDoCampo}
                    value={o.valor}
                    checked={marcados.has(o.valor)}
                    onChange={() => alternar(o.valor)}
                    className="h-5 w-5 shrink-0 accent-[var(--shalon-red,#b91c1c)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{o.nome}</span>
                  <span className="shrink-0 text-[13px] tabular-nums text-muted">{o.detalhe}</span>
                </label>
              ))}
            </div>
          );
        })}
        {quantosVisiveis === 0 ? (
          <p className="m-0 px-3 py-4 text-[13.5px] text-muted">Nenhum item com esse nome.</p>
        ) : null}
      </div>

      <p role="status" className="m-0 mt-2 text-[13px] font-semibold text-ink">
        {marcados.size === 0
          ? "Nenhum item marcado."
          : marcados.size === 1
            ? "1 item marcado."
            : `${marcados.size} itens marcados.`}
        {marcados.size > 0 ? (
          <button
            type="button"
            onClick={() => setMarcados(new Set())}
            className="ml-3 cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-brand-red"
          >
            Limpar
          </button>
        ) : null}
      </p>
    </fieldset>
  );
}
