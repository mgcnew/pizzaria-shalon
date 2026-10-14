/**
 * Gráficos do dashboard (14/10/2026) — leves de propósito.
 *
 * SEM BIBLIOTECA E SEM JAVASCRIPT NO NAVEGADOR: são componentes de servidor,
 * feitos de HTML e CSS. A interação (destacar a barra e mostrar a dica) é
 * `:hover`/`:focus` puro. Nada a baixar, nada a hidratar.
 *
 * COR COM FUNÇÃO, NÃO DECORAÇÃO (14/10/2026: "tudo vermelho disputa
 * atenção"):
 *   - ranking e tempo (mais vendidos, dias, horas): SÓ O MAIOR leva a cor da
 *     marca (`destaque`); o resto fica no neutro. O olho vai direto ao pico;
 *   - categorias (forma de pagamento, canal, modalidade): cada categoria tem
 *     a SUA cor (`serie-1`…`serie-6`), sempre a mesma — a cor segue a coisa,
 *     não a posição no ranking. Paleta validada para daltonismo nos dois
 *     temas. O nome fica escrito ao lado de cada barra: a cor nunca é o único
 *     jeito de saber o que é.
 *
 * O NÚMERO NUNCA DEPENDE DO MOUSE. Na barra horizontal o valor fica escrito na
 * ponta. Na coluna, o maior valor fica escrito e os outros aparecem na dica —
 * e todos vão, por extenso, no `aria-label` de cada coluna, que o teclado
 * alcança (Tab).
 *
 * Os textos chegam já formatados do servidor: valor monetário é formatado por
 * `formatBRL`, e este arquivo não decide nada de dinheiro.
 */

export type CorDoGrafico =
  | "destaque"
  | "neutro"
  | "serie-1"
  | "serie-2"
  | "serie-3"
  | "serie-4"
  | "serie-5"
  | "serie-6";

// Classes escritas por extenso: o Tailwind só gera o que encontra no código.
const FUNDO: Record<CorDoGrafico, string> = {
  destaque: "bg-grafico",
  neutro: "bg-grafico-neutro",
  "serie-1": "bg-serie-1",
  "serie-2": "bg-serie-2",
  "serie-3": "bg-serie-3",
  "serie-4": "bg-serie-4",
  "serie-5": "bg-serie-5",
  "serie-6": "bg-serie-6",
};

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
 * Colunas verticais (horário, dia da semana). A maior leva o destaque e o
 * valor escrito; as outras ficam no neutro, com o valor na dica (ponteiro,
 * toque ou foco).
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
                className={[
                  "block w-full max-w-[24px] rounded-t-[4px] transition-opacity duration-150 group-hover:opacity-80 group-focus:opacity-80",
                  indice === indiceDoMaior ? FUNDO.destaque : FUNDO.neutro,
                ].join(" ")}
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
  /**
   * Cor da categoria (`serie-*`). Sem ela, o gráfico é de ranking: o maior
   * leva o destaque e o resto, o neutro.
   */
  cor?: CorDoGrafico;
};

/**
 * Barras horizontais. Ranking: ordenado por quem chama, o primeiro é o
 * destaque. Categorias: cada item traz a própria `cor`. O valor fica escrito na ponta de cada linha — são
 * poucas linhas, e o número é o que se procura.
 */
export function GraficoDeBarras({ itens, descricao }: { itens: ItemDeBarra[]; descricao: string }) {
  const maximo = Math.max(0, ...itens.map((i) => i.valor));
  return (
    <ul aria-label={descricao} className="m-0 flex list-none flex-col gap-3 p-0">
      {itens.map((item, indice) => {
        const cor = item.cor ?? (indice === 0 && item.valor > 0 ? "destaque" : "neutro");
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
                className={[
                  "h-full rounded-[4px] transition-opacity duration-150 group-hover:opacity-80",
                  FUNDO[cor],
                ].join(" ")}
                style={{ width: `${largura}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
