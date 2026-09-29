import { Cartao, EmptyState } from "@/ui/patterns";
import { listarAuditoria } from "@/application/configuracoes/consultas";
import { descreverAuditoria } from "@/application/configuracoes/descricaoDaAuditoria";
import { obterLojaPublica } from "@/application/publico/consultas";

/**
 * "Auditoria" — seção do design aprovado, com o mesmo aviso: registro de
 * ações sensíveis, e logs que não podem ser editados nem excluídos pela
 * operação (RN-AUD-004).
 *
 * A leitura exige `audit.view`. Sem a permissão, o RLS devolve lista vazia —
 * e a tela diz isso, em vez de fingir que não houve movimento.
 *
 * Cada registro aparece como frase ("Pedido #123 cancelado"), com quem fez,
 * a mudança de status e o motivo, e não como código técnico
 * (D-2026-09-29-94). A hora sai no fuso da loja: no servidor da Vercel o
 * relógio é UTC, e sem o fuso a auditoria mostraria 3 h a mais.
 */
export async function SecaoAuditoria({ podeVer }: { podeVer: boolean }) {
  if (!podeVer) {
    return (
      <Cartao titulo="Auditoria" largura="cheio">
        <p className="m-0 text-[13.5px] text-ink-2">
          Você não tem permissão para ver a auditoria. Isso não significa que não há registros.
        </p>
      </Cartao>
    );
  }

  const [registros, loja] = await Promise.all([listarAuditoria(), obterLojaPublica()]);
  const quando = new Intl.DateTimeFormat("pt-BR", {
    timeZone: loja?.fuso ?? "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Cartao
      titulo="Auditoria"
      descricao="Registro de ações sensíveis. Logs não podem ser editados nem excluídos pela operação."
      largura="cheio"
    >
      {registros.length === 0 ? (
        <EmptyState
          titulo="Nenhum registro ainda"
          descricao="Alterações de configuração crítica e de permissões aparecem aqui."
        />
      ) : (
        registros.map((r) => {
          const { titulo, detalhe } = descreverAuditoria(r);
          return (
            <div key={r.id} className="border-b border-border-shalon py-[11px] last:border-b-0">
              <div className="flex flex-wrap justify-between gap-[10px]">
                <span className="text-[14px] font-semibold text-ink">{titulo}</span>
                <time dateTime={r.created_at} className="text-[12.5px] text-muted">
                  {quando.format(new Date(r.created_at))}
                </time>
              </div>
              <p className="mt-[3px] text-[13px] text-ink-2">{detalhe}</p>
            </div>
          );
        })
      )}
    </Cartao>
  );
}
