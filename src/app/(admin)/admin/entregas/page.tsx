import type { Metadata } from "next";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { listarCorridas, obterCentral, obterCorrida } from "@/application/entregas/consultas";
import { listarPedidosAReceber } from "@/application/pdv/consultas";
import { formasParaRecebimento } from "@/application/configuracoes/consultas";
import { obterCaixa } from "@/application/caixa/consultas";
import { Cartao } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { PainelDeEntregas } from "./_ui/PainelDeEntregas";

export const metadata: Metadata = { title: "Entregas" };

/**
 * /admin/entregas
 *
 * A central operacional da rua. Servidor busca; o painel exibe e age.
 *
 * `deliveries.settle` esconde o acerto da interface — mas quem esconde de
 * verdade é a RPC, que recusa a chamada direta do mesmo jeito (CLAUDE.md §12).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ corrida?: string }>;
}) {
  const { corrida: corridaId } = await searchParams;

  const [sessao, central, corrida, historico, aReceber, formasDeRecebimento, caixa] =
    await Promise.all([
      obterSessaoInterna(),
      obterCentral(),
      corridaId ? obterCorrida(corridaId) : Promise.resolve(null),
      listarCorridas(10),
      // Receber no acerto (D-2026-10-01-111) usa a MESMA autoridade da fila
      // de pedidos para saber quem está devendo — nada de segundo critério.
      corridaId ? listarPedidosAReceber() : Promise.resolve({ pedidos: [] }),
      corridaId ? formasParaRecebimento() : Promise.resolve([]),
      corridaId ? obterCaixa() : Promise.resolve(null),
    ]);
  const cobraveis = Object.fromEntries(aReceber.pedidos.map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="m-0 font-display text-[24px] font-bold text-ink">Entregas</h1>
        <p className="m-0 mt-1 text-[13.5px] text-muted">
          Saída, retorno e acerto do motoboy. Dinheiro com quem entrega não é dinheiro no caixa.
        </p>
      </header>

      <PainelDeEntregas
        central={central}
        corrida={corrida}
        podeAcertar={podeNaUI(sessao, "deliveries.settle")}
        podeReceber={podeNaUI(sessao, "payments.register")}
        cobraveis={cobraveis}
        formasDeRecebimento={formasDeRecebimento}
        caixaAberto={caixa?.aberto ?? false}
      />

      {historico.length > 0 ? (
        <Cartao titulo="Corridas acertadas" largura="cheio">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="border-b border-border-shalon py-2 font-semibold">Motoboy</th>
                  <th className="border-b border-border-shalon py-2 font-semibold">Acertada em</th>
                  <th className="border-b border-border-shalon py-2 text-right font-semibold">
                    Entregas
                  </th>
                  <th className="border-b border-border-shalon py-2 text-right font-semibold">
                    Falhas
                  </th>
                  <th className="border-b border-border-shalon py-2 text-right font-semibold">
                    Esperado
                  </th>
                  <th className="border-b border-border-shalon py-2 text-right font-semibold">
                    Devolvido
                  </th>
                  <th className="border-b border-border-shalon py-2 text-right font-semibold">
                    Diferença
                  </th>
                  <th className="border-b border-border-shalon py-2 font-semibold">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((c) => (
                  <tr key={c.corrida_id}>
                    <td className="border-b border-border-shalon py-2 text-ink">{c.motoboy}</td>
                    <td className="border-b border-border-shalon py-2 text-muted">
                      {c.acertada_em ? new Date(c.acertada_em).toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-right text-ink">
                      {c.pedidos}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-right text-ink">
                      {c.falhas}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-right text-ink">
                      {c.esperado === null ? "—" : formatBRL(c.esperado)}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-right text-ink">
                      {c.devolvido === null ? "—" : formatBRL(c.devolvido)}
                    </td>
                    <td
                      className={`border-b border-border-shalon py-2 text-right font-semibold ${
                        c.diferenca && c.diferenca !== 0 ? "text-tdf" : "text-ink"
                      }`}
                    >
                      {c.diferenca === null ? "—" : formatBRL(c.diferenca)}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-muted">
                      {c.motivo ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      ) : null}
    </div>
  );
}
