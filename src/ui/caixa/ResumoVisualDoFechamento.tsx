import { ParDeDados } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import type { ResumoDeFechamento } from "@/application/caixa/tipos";
import {
  montarRelatorioDeFechamento,
  type RelatorioDeFechamento,
} from "@/domain/caixa/relatorioDeFechamento";

/**
 * O fechamento do caixa em leitura: dinheiro da gaveta, recebido por forma de
 * pagamento, vendido, movimento da gaveta. Usado no passo de fechar e, depois,
 * em cada sessão do relatório de caixa — a mesma montagem, para os dois nunca
 * divergirem.
 */

export type ConferenciaDoFechamento = {
  fechado: boolean;
  esperado: number;
  contado: number;
  diferenca: number;
  resumo: ResumoDeFechamento | null;
};

/** O relatório do fechamento, pronto para a tela e para o papel (mesma montagem). */
export function relatorioDe(conferencia: ConferenciaDoFechamento): RelatorioDeFechamento | null {
  const r = conferencia.resumo;
  if (r === null) return null;
  return montarRelatorioDeFechamento({
    recebimentos: r.recebimentos_por_metodo,
    totalRecebido: r.total_recebido ?? null,
    itensVendidos: r.itens_vendidos ?? null,
    fundoInicial: r.fundo_inicial,
    movimentos: r.movimentos_da_gaveta ?? null,
    entrou: r.entrou_na_gaveta ?? null,
    saiu: r.saiu_da_gaveta ?? null,
    legado: {
      recebidoEmDinheiro: r.recebido_em_dinheiro,
      reforcos: r.reforcos,
      sangrias: r.sangrias,
      despesas: r.despesas_pelo_caixa,
      entradas: r.entradas_pelo_caixa,
      estornos: r.estornos,
      diferencasDeMotoboy: r.diferencas_de_motoboy ?? 0,
    },
    contado: conferencia.contado,
    esperado: conferencia.esperado,
    diferenca: conferencia.diferenca,
    dinheiroForaDaGaveta: r.dinheiro_fora_da_gaveta,
  });
}

/** Linha de total: mesmo desenho do `ParDeDados`, em negrito. */
function ParTotal({ chave, valor }: { chave: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-border-shalon py-[9px] text-[14px] font-bold text-ink">
      <span className="shrink-0">{chave}</span>
      <span className="min-w-0 break-words text-right tabular-nums">{valor}</span>
    </div>
  );
}

const subtitulo = "m-0 mt-2 text-[12px] font-bold uppercase tracking-wide text-muted";

export function ResumoVisualDoFechamento({
  conferencia,
  aberto,
  semConferencia = false,
  idDoDocumento = "resumo-impressao-fechamento",
}: {
  conferencia: ConferenciaDoFechamento;
  /** Sessão ainda aberta: não há contagem nem diferença para mostrar. */
  semConferencia?: boolean;
  /** `null` omite o id — quando há vários resumos na mesma página, ele não pode repetir. */
  idDoDocumento?: string | null;
  /** Fechado, os detalhes são o comprovante e ficam à vista; com diferença, recolhidos. */
  aberto: boolean;
}) {
  const resumo = conferencia.resumo;
  const relatorio = relatorioDe(conferencia);
  return (
    <div id={idDoDocumento ?? undefined} className="flex flex-col gap-3 bg-surface">
      <div className="hidden text-center font-mono text-[13px] text-black print:block">
        <p className="m-0 text-[15px] font-bold">PIZZARIA SHALON</p>
        <p className="m-0">FECHAMENTO DE CAIXA</p>
        {resumo ? <p className="m-0">Data {new Date(`${resumo.data_operacional}T12:00:00`).toLocaleDateString("pt-BR")}</p> : null}
      </div>

      <div className="rounded-12 border border-border-shalon bg-elev p-3 print:rounded-none print:border-x-0 print:bg-white">
        <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-muted print:text-black">
          Dinheiro da gaveta
        </p>
        {semConferencia ? (
          <ParDeDados chave="Esperado na gaveta agora" valor={formatBRL(conferencia.esperado)} />
        ) : (
          <>
          <ParDeDados chave="Você contou" valor={formatBRL(conferencia.contado)} />
          <ParDeDados chave="O sistema esperava" valor={formatBRL(conferencia.esperado)} />
          <ParDeDados
            chave="Diferença"
            valor={
              <strong className={conferencia.diferenca === 0 ? "text-tgf print:text-black" : "text-tdf print:text-black"}>
                {conferencia.diferenca === 0 ? formatBRL(0) : `${conferencia.diferenca > 0 ? "+" : "−"} ${formatBRL(Math.abs(conferencia.diferenca))}`}
              </strong>
            }
          />
          </>
        )}
      </div>

      {resumo && relatorio ? (
        <>
          {relatorio.foraDaGaveta > 0 ? (
            <p className="m-0 rounded-12 border border-twb bg-tw p-3 text-[13px] font-semibold text-twf print:rounded-none print:border-x-0 print:bg-white print:text-black">
              Dinheiro recebido que ainda não entrou na gaveta (ex.: com o motoboy): {formatBRL(relatorio.foraDaGaveta)}
            </p>
          ) : null}

          <details open={aberto} className="group flex flex-col gap-3">
            <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 rounded-12 border border-border-shalon px-3 text-[14px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <span>Recebimentos e movimentos da sessão</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="shrink-0 text-ink-2 transition-transform group-open:rotate-180"
                style={{ width: 18, height: 18 }}
              >
                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>

            {/* Só o que teve movimento: forma sem recebimento, sangria zerada e
                fundo zerado não aparecem. */}
            <div className="rounded-12 border border-border-shalon p-3 print:rounded-none print:border-x-0">
              <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-muted print:text-black">
                Recebido por forma de pagamento
              </p>
              {relatorio.recebidos.length > 0 ? (
                <>
                  {relatorio.recebidos.map((r) => (
                    <ParDeDados key={r.rotulo} chave={r.rotulo} valor={formatBRL(r.valor)} />
                  ))}
                  {relatorio.totalRecebido !== null ? (
                    <ParTotal chave="Total recebido" valor={formatBRL(relatorio.totalRecebido)} />
                  ) : null}
                </>
              ) : (
                <p className="m-0 text-[13px] text-muted print:text-black">Nenhum recebimento nesta sessão.</p>
              )}
            </div>

            {relatorio.vendidos.length > 0 ? (
              <div className="rounded-12 border border-border-shalon p-3 print:rounded-none print:border-x-0">
                <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-muted print:text-black">
                  Vendido na sessão
                </p>
                {relatorio.vendidos.map((l) => (
                  <ParDeDados key={l.rotulo} chave={l.rotulo} valor={String(l.quantidade)} />
                ))}
              </div>
            ) : null}

            <div className="rounded-12 border border-border-shalon p-3 print:rounded-none print:border-x-0">
              <p className="m-0 mb-1 text-[12px] font-bold uppercase tracking-wide text-muted print:text-black">
                Movimento da gaveta (só dinheiro)
              </p>
              {relatorio.fundo > 0 ? <ParDeDados chave="Fundo inicial" valor={formatBRL(relatorio.fundo)} /> : null}

              {relatorio.entradas.length > 0 ? (
                <>
                  <p className={subtitulo}>Entrou</p>
                  {relatorio.entradas.map((l) => (
                    <ParDeDados key={`e-${l.rotulo}`} chave={l.rotulo} valor={formatBRL(l.valor)} />
                  ))}
                  {relatorio.totalEntrou !== null ? (
                    <ParTotal chave="Total que entrou" valor={formatBRL(relatorio.totalEntrou)} />
                  ) : null}
                </>
              ) : null}

              {relatorio.saidas.length > 0 ? (
                <>
                  <p className={subtitulo}>Saiu</p>
                  {relatorio.saidas.map((l) => (
                    <ParDeDados key={`s-${l.rotulo}`} chave={l.rotulo} valor={formatBRL(l.valor)} />
                  ))}
                  {relatorio.totalSaiu !== null ? (
                    <ParTotal chave="Total que saiu" valor={formatBRL(relatorio.totalSaiu)} />
                  ) : null}
                </>
              ) : null}

              <ParTotal chave="Esperado na gaveta" valor={formatBRL(relatorio.esperado)} />
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
