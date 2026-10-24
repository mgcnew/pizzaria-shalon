import { formatarCelula } from "@/application/relatorios/formato";
import type { Coluna, Relatorio } from "@/application/relatorios/tipos";
import { DetalheNoCartao, LinhaExpansivel } from "@/ui/caixa/DetalheDaSessao";

/**
 * As linhas do relatório: tabela a partir do `md`, cartões abaixo disso.
 *
 * A tabela de 9 colunas do caixa obrigava a rolar de lado no celular e, com a
 * justificativa quebrando em dez linhas, uma linha ocupava a tela inteira. No
 * celular cada linha vira um cartão: a primeira coluna é o título, o resto vem
 * como rótulo/valor, e o texto longo é limitado a poucas linhas.
 *
 * Os dois usam `formatarCelula`, o mesmo das exportações: tela e arquivo não
 * divergem.
 */

const ehNumerica = (c: Coluna) => c.tipo === "dinheiro" || c.tipo === "numero";

/** "Situação" ganha selo; as demais colunas, só texto. */
const ehSituacao = (c: Coluna) => c.chave === "situacao";

/** Diferença de caixa: zero é verde; sobra ou falta chama atenção, e não só pela cor (o sinal vai no texto). */
const ehDiferenca = (c: Coluna) => c.chave === "diferenca" && c.tipo === "dinheiro";

function tomDaDiferenca(valor: unknown): string {
  const n = Number(valor);
  if (valor === null || valor === undefined || valor === "" || !Number.isFinite(n)) return "text-ink";
  return n === 0 ? "text-tgf" : "text-tdf";
}

function Selo({ texto }: { texto: string }) {
  const aberta = texto === "Aberta";
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-pill border px-[10px] py-[3px] text-[12px] font-semibold",
        aberta ? "border-twb bg-tw text-twf" : "border-border-shalon bg-elev text-ink-2",
      ].join(" ")}
    >
      {texto}
    </span>
  );
}

export function ListaDoRelatorio({
  relatorio,
  sessoes,
}: {
  relatorio: Relatorio;
  /**
   * Só no relatório de caixa: o id da sessão de cada linha (mesma ordem de
   * `linhas`), que permite abrir o fechamento completo dela. `null` = sem detalhe.
   */
  sessoes?: (string | null)[] | undefined;
}) {
  const { colunas, linhas } = relatorio;
  const totais = Object.entries(relatorio.totais ?? {});
  const [titulo, ...resto] = colunas;
  if (!titulo) return null;
  const situacao = resto.find(ehSituacao);
  const detalhes = resto.filter((c) => !ehSituacao(c));

  return (
    <>
      {/* ------------------------------------------------ celular: cartões */}
      <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
        {linhas.map((linha, i) => (
          <li key={i} className="rounded-12 border border-border-shalon bg-elev p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="m-0 text-[15px] font-bold text-ink">
                {formatarCelula(linha[titulo.chave], titulo.tipo)}
              </p>
              {situacao ? <Selo texto={formatarCelula(linha[situacao.chave], situacao.tipo)} /> : null}
            </div>

            <dl className="m-0 mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
              {detalhes.map((c) => {
                const texto = formatarCelula(linha[c.chave], c.tipo);
                const longo = c.tipo === "texto";
                return (
                  <div key={c.chave} className={longo ? "col-span-2" : ""}>
                    <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{c.rotulo}</dt>
                    <dd
                      className={[
                        "m-0 text-[14px]",
                        ehNumerica(c) ? "font-semibold tabular-nums" : "",
                        ehDiferenca(c) ? `font-bold ${tomDaDiferenca(linha[c.chave])}` : "text-ink",
                        c.tipo === "texto" ? "line-clamp-3 whitespace-pre-line break-words" : "",
                      ].join(" ")}
                    >
                      {texto}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {sessoes?.[i] ? <DetalheNoCartao sessaoId={sessoes[i]} /> : null}
          </li>
        ))}
        {totais.length > 0 ? (
          <li className="rounded-12 border border-border-shalon p-3">
            <dl className="m-0 flex flex-col gap-1">
              {totais.map(([chave, valor]) => {
                const coluna = colunas.find((c) => c.chave === chave);
                return (
                  <div key={chave} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[13px] font-semibold text-muted">{coluna?.rotulo ?? chave}</dt>
                    <dd className="m-0 text-[14px] font-bold tabular-nums text-ink">
                      {formatarCelula(valor, coluna?.tipo ?? "numero")}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ) : null}
      </ul>

      {/* ---------------------------------------------- telas maiores: tabela */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-muted">
              {colunas.map((c) => (
                <th
                  key={c.chave}
                  scope="col"
                  className={[
                    "border-b border-border-shalon px-2 py-2 font-semibold first:pl-0 last:pr-0",
                    ehNumerica(c) ? "text-right" : "",
                  ].join(" ")}
                >
                  {c.rotulo}
                </th>
              ))}
              {sessoes ? <th scope="col" className="border-b border-border-shalon py-2 pl-2"><span className="sr-only">Detalhes</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => {
              const celulas = colunas.map((c) => {
                const texto = formatarCelula(linha[c.chave], c.tipo);
                return (
                  <td
                    key={c.chave}
                    className={[
                      "border-b border-border-shalon px-2 py-2 align-top first:pl-0 last:pr-0",
                      ehNumerica(c) ? "whitespace-nowrap text-right tabular-nums" : "",
                      c.tipo === "datahora" ? "whitespace-nowrap" : "",
                      ehDiferenca(c) ? `font-bold ${tomDaDiferenca(linha[c.chave])}` : "text-ink",
                    ].join(" ")}
                  >
                    {ehSituacao(c) ? (
                      <Selo texto={texto} />
                    ) : c.tipo === "texto" ? (
                      <span
                        className="line-clamp-3 max-w-[280px] whitespace-pre-line break-words"
                        title={texto.length > 80 ? texto : undefined}
                      >
                        {texto}
                      </span>
                    ) : (
                      texto
                    )}
                  </td>
                );
              });
              const id = sessoes?.[i] ?? null;
              if (id) {
                return (
                  <LinhaExpansivel key={i} sessaoId={id} colunas={colunas.length}>
                    {celulas}
                  </LinhaExpansivel>
                );
              }
              return (
                <tr key={i}>
                  {celulas}
                  {sessoes ? <td className="border-b border-border-shalon" /> : null}
                </tr>
              );
            })}
          </tbody>
          {totais.length > 0 ? (
            <tfoot>
              <tr>
                <td colSpan={colunas.length + (sessoes ? 1 : 0)} className="py-3 text-right text-[13px] font-semibold text-ink">
                  {totais.map(([chave, valor]) => {
                    const coluna = colunas.find((c) => c.chave === chave);
                    return (
                      <span key={chave} className="ml-4 inline-block">
                        {coluna?.rotulo ?? chave}: {formatarCelula(valor, coluna?.tipo ?? "numero")}
                      </span>
                    );
                  })}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </>
  );
}
