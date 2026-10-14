/**
 * Gráficos do dashboard (14/10/2026) — leves de propósito.
 *
 * SEM BIBLIOTECA E SEM JAVASCRIPT NO NAVEGADOR: são componentes de servidor,
 * feitos de HTML e CSS. A interação (destacar a barra e mostrar a dica) é
 * `:hover`/`:focus` puro. Nada a baixar, nada a hidratar.
 *
 * UMA SÉRIE POR GRÁFICO, UMA COR (`--shalon-grafico`): vermelho da marca no
 * tema claro, laranja no escuro — contraste medido contra o cartão. Sem
 * legenda, porque o título do cartão já diz o que é; sem paleta de categorias
 * para confundir.
 *
 * O NÚMERO NUNCA DEPENDE DO MOUSE. Na barra horizontal o valor fica escrito na
 * ponta. Na coluna, o maior valor fica escrito e os outros aparecem na dica —
 * e todos vão, por extenso, no `aria-label` de cada coluna, que o teclado
 * alcança (Tab).
 *
 * Os textos chegam já formatados do servidor: valor monetário é formatado por
 * `formatBRL`, e este arquivo não decide nada de dinheiro.
 */

export type ItemDeColuna = {
  chave: string;
  /** Rótulo curto no eixo (ex.: "19h", "Sex"). */
  rotulo: string;
  /** Rótulo completo, para a dica e o leitor de tela (ex.: "Sexta-feira"). */
  rotuloCompleto: string;
  /** Altura da coluna. */
  valor: number;
  /** O valor já formatado, como aparece na dica. */
  valorTexto: string;
  /** Linha secundária da dica (ex.: "12 pedidos"). */
  detalhe?: string;
};

/**
 * Colunas verticais (horário, dia da semana). Dica acima da coluna sob o
 * ponteiro ou o foco; o maior valor fica escrito sobre a coluna.
 */
export function GraficoDeColunas({
  itens,
  descricao,
  rotulosACada = 1,
}: {
  itens: ItemDeColuna[];
  /** Resumo para leitor de tela (ex.: "Pedidos por hora do dia"). */
  descricao: string;
  /** Mostra o rótulo do eixo a cada N colunas, para não amontoar. */
  rotulosACada?: number;
}) {
  const maximo = Math.max(0, ...itens.map((i) => i.valor));
  const indiceDoMaior = itens.findIndex((i) => i.valor === maximo && maximo > 0);

  return (
    <figure className="m-0" aria-label={descricao}>
      <div className="flex h-[168px] items-end gap-[2px] border-b border-border-shalon pt-6">
        {itens.map((item, indice) => {
          const altura = maximo > 0 ? Math.max(item.valor > 0 ? 3 : 0, (item.valor / maximo) * 100) : 0;
          // A dica não pode sair do cartão nas pontas.
          const alinhamento =
            indice < 2 ? "left-0" : indice > itens.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
          return (
            <div
              key={item.chave}
              tabIndex={0}
              role="img"
              aria-label={`${item.rotuloCompleto}: ${item.valorTexto}${item.detalhe ? `, ${item.detalhe}` : ""}`}
              className="group relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center rounded-t-[4px] outline-none focus:bg-grafico-trilha"
            >
              {indice === indiceDoMaior ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11.5px] font-semibold text-ink group-hover:opacity-0 group-focus:opacity-0"
                  style={{ bottom: `calc(${altura}% + 4px)` }}
                >
                  {item.valorTexto}
                </span>
              ) : null}
              <span
                aria-hidden="true"
                className="block w-full max-w-[24px] rounded-t-[4px] bg-grafico transition-opacity duration-150 group-hover:opacity-80 group-focus:opacity-80"
                style={{ height: `${altura}%` }}
              />
              <span
                role="presentation"
                className={[
                  "pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-10 border border-border-shalon bg-surface px-2.5 py-1.5 text-left opacity-0 shadow-[0_6px_18px_rgb(41_37_36/0.14)] transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100",
                  alinhamento,
                ].join(" ")}
              >
                <span className="block text-[13px] font-bold text-ink">{item.valorTexto}</span>
                <span className="block text-[11.5px] text-muted">
                  {item.rotuloCompleto}
                  {item.detalhe ? ` · ${item.detalhe}` : ""}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="mt-1.5 flex gap-[2px]">
        {itens.map((item, indice) => (
          <span key={item.chave} className="min-w-0 flex-1 text-center text-[11px] tabular-nums text-muted">
            {indice % rotulosACada === 0 ? item.rotulo : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

export type ItemDeBarra = {
  chave: string;
  rotulo: string;
  /** Linha pequena embaixo do rótulo (ex.: categoria). */
  subtitulo?: string | null;
  valor: number;
  valorTexto: string;
  /** Texto pequeno ao lado do valor (ex.: "12 un", "48%"). */
  detalhe?: string;
};

/**
 * Barras horizontais, ordenadas por quem chama (ranking, formas de
 * pagamento, origem). O valor fica escrito na ponta de cada linha — são
 * poucas linhas, e o número é o que se procura.
 */
export function GraficoDeBarras({ itens, descricao }: { itens: ItemDeBarra[]; descricao: string }) {
  const maximo = Math.max(0, ...itens.map((i) => i.valor));
  return (
    <ul aria-label={descricao} className="m-0 flex list-none flex-col gap-3 p-0">
      {itens.map((item) => {
        const largura = maximo > 0 ? Math.max(item.valor > 0 ? 1.5 : 0, (item.valor / maximo) * 100) : 0;
        return (
          <li key={item.chave} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold text-ink">{item.rotulo}</span>
                {item.subtitulo ? (
                  <span className="block truncate text-[12px] text-muted">{item.subtitulo}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-right">
                <span className="text-[13.5px] font-semibold text-ink">{item.valorTexto}</span>
                {item.detalhe ? <span className="ml-1.5 text-[12px] text-muted">{item.detalhe}</span> : null}
              </span>
            </div>
            <div aria-hidden="true" className="h-2.5 w-full overflow-hidden rounded-[4px] bg-grafico-trilha">
              <div
                className="h-full rounded-[4px] bg-grafico transition-opacity duration-150 group-hover:opacity-80"
                style={{ width: `${largura}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
