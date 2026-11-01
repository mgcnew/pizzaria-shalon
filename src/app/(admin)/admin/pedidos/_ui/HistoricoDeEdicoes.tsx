import { formatBRL } from "@/lib/format";
import type { RevisaoDoPedido } from "@/application/pedidos/tipos";

const CANAL: Record<string, string> = { whatsapp: "WhatsApp", phone: "telefone", counter: "balcão" };

/** Quem mudou o quê, quando e por quê (RN-ALT-003, RN-ALT-009). Só leitura. */
export function HistoricoDeEdicoes({ revisoes, fuso }: { revisoes: RevisaoDoPedido[]; fuso: string }) {
  const aplicadas = revisoes.filter((r) => r.status === "applied");
  if (aplicadas.length === 0) return null;

  const quando = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="rounded-16 border border-border-shalon bg-surface p-4">
      <h3 className="m-0 mb-1 text-[14px] font-bold text-ink">
        Pedido editado <span className="font-normal text-muted">({aplicadas.length})</span>
      </h3>
      <ul className="m-0 list-none p-0">
        {aplicadas.map((r) => {
          const m = r.mudancas;
          const origem =
            r.motivo_tipo === "mistake"
              ? "Lançado errado"
              : r.motivo_tipo === "customer"
                ? `Cliente pediu${r.canal ? ` (${CANAL[r.canal] ?? r.canal})` : ""}`
                : null;
          return (
            <li key={r.id} className="border-t border-border-shalon py-2 text-[13px] first:border-0">
              <p className="m-0 text-muted">
                {quando.format(new Date(r.proposta_em))}
                {r.por ? ` · ${r.por}` : ""}
                {origem ? ` · ${origem}` : ""}
              </p>
              <p className="m-0 font-semibold text-ink">{r.motivo}</p>
              {m?.saiu.map((i, n) => <p key={`s${n}`} className="m-0 text-ink-2">− {i.quantidade}× {i.nome}</p>)}
              {m?.entrou.map((i, n) => <p key={`e${n}`} className="m-0 text-ink-2">+ {i.quantidade}× {i.nome}</p>)}
              {m?.modalidade ? (
                <p className="m-0 text-ink-2">
                  {m.modalidade.para === "delivery" ? "Retirada → Entrega" : "Entrega → Retirada"}
                </p>
              ) : null}
              {m?.endereco_mudou ? <p className="m-0 text-ink-2">Endereço alterado</p> : null}
              {m?.taxa ? <p className="m-0 text-ink-2">Taxa: {formatBRL(m.taxa.de)} → {formatBRL(m.taxa.para)}</p> : null}
              {m && m.dados.length > 0 ? <p className="m-0 text-ink-2">Alterado: {m.dados.join(", ")}</p> : null}
              {r.total_antes !== r.total_depois ? (
                <p className="m-0 text-ink-2">Total: {formatBRL(r.total_antes)} → {formatBRL(r.total_depois)}</p>
              ) : null}
              {m && m.devolvido > 0 ? <p className="m-0 font-semibold text-twf">Devolvido: {formatBRL(m.devolvido)}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
