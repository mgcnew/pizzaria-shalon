import { Cartao, EmptyState } from "@/ui/patterns";
import { listarAuditoria } from "@/application/configuracoes/consultas";

/**
 * "Auditoria" — seção do design aprovado, com o mesmo aviso: registro de
 * ações sensíveis, e logs que não podem ser editados nem excluídos pela
 * operação (RN-AUD-004).
 *
 * A leitura exige `audit.view`. Sem a permissão, o RLS devolve lista vazia —
 * e a tela diz isso, em vez de fingir que não houve movimento.
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

  const registros = await listarAuditoria();

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
        registros.map((r) => (
          <div key={r.id} className="border-b border-border-shalon py-[11px] last:border-b-0">
            <div className="flex flex-wrap justify-between gap-[10px]">
              <span className="text-[14px] font-semibold text-ink">
                {r.action} · {r.entity_type}
              </span>
              <span className="text-[12.5px] text-muted">
                {new Date(r.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="mt-[3px] text-[13px] text-ink-2">
              {r.reason ?? (r.actor_type === "system" ? "Registro do sistema" : "Ação de usuário")}
            </p>
          </div>
        ))
      )}
    </Cartao>
  );
}
