import { Cartao } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import type { SessaoHistorica } from "@/application/caixa/tipos";

/**
 * O histórico de fechamentos.
 *
 * Fase 12, consolidação PDV × Caixa · 09-PDV-FRENTE-DE-CAIXA.md §4.3
 *
 * ERA A ÚNICA COISA QUE EXISTIA SÓ EM `/admin/caixa`. Veio para a aba Caixa do
 * PDV inteira — mesmas seis colunas, mesma marca de sessão corrigida, mesma
 * consulta (`sessoes_de_caixa`, SECURITY INVOKER sob `cash.view`). Extraída
 * como componente em vez de copiada: duas tabelas de fechamento divergindo com
 * o tempo é exatamente o problema que esta consolidação existe para acabar.
 *
 * SÓ SESSÕES FECHADAS. A aberta é o assunto do painel acima, com o esperado
 * vivo; repeti-la aqui, com `esperado` ainda nulo, seria duas linhas para a
 * mesma sessão dizendo coisas diferentes. Quem filtra é quem chama.
 *
 * A DIFERENÇA EM VERMELHO É LEITURA, NÃO AUTORIDADE — o número foi calculado
 * pelo servidor no momento de fechar e está gravado (RN-CAIXA-014). Aqui só se
 * mostra o que já aconteceu: esta tabela não decide nem recalcula nada.
 */
export function SessoesAnteriores({ sessoes }: { sessoes: SessaoHistorica[] }) {
  if (sessoes.length === 0) return null;

  return (
    <Cartao titulo="Sessões anteriores" largura="cheio">
      {/* `min-w` + rolagem própria: seis colunas de dinheiro não cabem num
          celular, e deixar a PÁGINA rolar na horizontal quebra o resto do
          PDV (CLAUDE.md §38). */}
      <div className="overflow-x-auto">
        {/* `pr-4` entre colunas, menos na última. Sem isso "Diferença"
            (alinhada à direita) encosta em "Justificativa" (à esquerda) com
            gap zero, e o cabeçalho lê "DiferençaJustificativa" — medido em
            1111px, onde uma termina exatamente onde a outra começa. */}
        <table className="w-full min-w-[640px] border-collapse text-[13px] [&_td]:pr-4 [&_th]:pr-4 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0">
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
            {sessoes.map((s) => (
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
  );
}
