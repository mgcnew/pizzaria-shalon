import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { obterCaixa, obterResumoDeFechamento, listarSessoes } from "@/application/caixa/consultas";
import { Cartao } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { PainelDoCaixa } from "./_ui/PainelDoCaixa";

export const metadata: Metadata = { title: "Caixa" };

/**
 * /admin/caixa
 *
 * Servidor busca; o painel exibe e age. Nenhum número desta página é
 * calculado aqui: `caixa_atual` e `resumo_do_fechamento` vêm do banco, que é
 * quem sabe o que entrou na gaveta e o que só passou pela maquininha.
 */
export default async function Page() {
  const estado = await obterCaixa();
  const [resumo, sessoes] = await Promise.all([
    estado.aberto ? obterResumoDeFechamento(estado.sessao_id) : Promise.resolve(null),
    listarSessoes(10),
  ]);

  const anteriores = sessoes.filter((s) => s.status === "closed");

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="m-0 font-display text-[24px] font-bold text-ink">Caixa</h1>
        <p className="m-0 mt-1 text-[13.5px] text-muted">
          Sessão, movimentos e fechamento. A sessão é operacional: a meia-noite não fecha,
          não cria e não troca caixa.
        </p>
      </header>

      <PainelDoCaixa estado={estado} resumo={resumo} tentativa={randomUUID()} />

      {anteriores.length > 0 ? (
        <Cartao titulo="Sessões anteriores" largura="cheio">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="border-b border-border-shalon py-2 font-semibold">Data</th>
                  <th className="border-b border-border-shalon py-2 font-semibold">Fechada em</th>
                  <th className="border-b border-border-shalon py-2 text-right font-semibold">
                    Esperado
                  </th>
                  <th className="border-b border-border-shalon py-2 text-right font-semibold">
                    Contado
                  </th>
                  <th className="border-b border-border-shalon py-2 text-right font-semibold">
                    Diferença
                  </th>
                  <th className="border-b border-border-shalon py-2 font-semibold">Justificativa</th>
                </tr>
              </thead>
              <tbody>
                {anteriores.map((s) => (
                  <tr key={s.sessao_id}>
                    <td className="border-b border-border-shalon py-2 text-ink">
                      {new Date(`${s.data_operacional}T12:00:00`).toLocaleDateString("pt-BR")}
                      {s.corrigida ? " · corrigida" : ""}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-muted">
                      {s.fechada_em ? new Date(s.fechada_em).toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-right text-ink">
                      {s.esperado === null ? "—" : formatBRL(s.esperado)}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-right text-ink">
                      {s.contado === null ? "—" : formatBRL(s.contado)}
                    </td>
                    <td
                      className={`border-b border-border-shalon py-2 text-right font-semibold ${
                        s.diferenca && s.diferenca !== 0 ? "text-tdf" : "text-ink"
                      }`}
                    >
                      {s.diferenca === null ? "—" : formatBRL(s.diferenca)}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-muted">
                      {s.justificativa ?? "—"}
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
