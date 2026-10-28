import type { Metadata } from "next";
import Link from "next/link";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { listarSaidasDoDia, obterCentral, obterCorrida } from "@/application/entregas/consultas";
import type { SaidaDoDia } from "@/application/entregas/tipos";
import { Cartao, EmptyState } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { PainelDeEntregas } from "./_ui/PainelDeEntregas";

export const metadata: Metadata = { title: "Entregas" };

const SITUACAO: Record<SaidaDoDia["entregas"][number]["situacao"], string> = {
  pending: "na rua",
  delivered: "entregue",
  failed: "não entregue",
  reassigned: "trocada antes de sair",
  transferred: "passou para outro motoboy",
};

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—";

/**
 * /admin/entregas
 *
 * Quem está livre, quem está na rua e o histórico das saídas do dia
 * (D-2026-10-27-174). A saída e a volta do motoboy acontecem na tela Pedidos;
 * daqui também se abre o "Fulano voltou". Quem decide é sempre a RPC
 * (CLAUDE.md §12).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ corrida?: string; dia?: string }>;
}) {
  const { corrida: corridaId, dia: diaDaUrl } = await searchParams;
  const dia = diaDaUrl && /^\d{4}-\d{2}-\d{2}$/.test(diaDaUrl) ? diaDaUrl : undefined;

  const [sessao, central, corrida, saidas] = await Promise.all([
    obterSessaoInterna(),
    obterCentral(),
    corridaId ? obterCorrida(corridaId) : Promise.resolve(null),
    listarSaidasDoDia(dia),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="m-0 font-display text-[24px] font-bold text-ink">Entregas</h1>
        <p className="m-0 mt-1 text-[13.5px] text-muted">
          Quem está livre, quem está na rua e o que cada motoboy levou. Dinheiro com quem entrega não é dinheiro
          no caixa.
        </p>
      </header>

      <PainelDeEntregas
        central={central}
        corrida={corrida}
        podeAcertar={podeNaUI(sessao, "deliveries.manage")}
        podeMarcarPresenca={podeNaUI(sessao, "employees.attendance")}
      />

      <Cartao
        titulo="Saídas do dia"
        descricao={
          dia
            ? `Dia de trabalho de ${new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR")} (vira às 5h).`
            : "Hoje (o dia de trabalho vira às 5h)."
        }
        largura="cheio"
      >
        <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink">
            Outro dia
            <input
              type="date"
              name="dia"
              defaultValue={dia ?? ""}
              className="min-h-touch rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[14px] text-ink"
            />
          </label>
          <button
            type="submit"
            className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink"
          >
            Ver
          </button>
          {dia ? (
            <Link
              href="/admin/entregas"
              className="inline-flex min-h-touch items-center px-2 text-[13.5px] font-semibold text-link no-underline"
            >
              Voltar para hoje
            </Link>
          ) : null}
        </form>

        {saidas.length === 0 ? (
          <EmptyState titulo="Nenhuma saída" descricao="Nenhum motoboy saiu com entregas neste dia." />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {saidas.map((s) => {
              const entregues = s.entregas.filter((e) => e.situacao === "delivered").length;
              return (
                <li key={s.corrida_id} className="rounded-12 border border-border-shalon p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="m-0 text-[14.5px] font-semibold text-ink">{s.motoboy}</p>
                    <p className="m-0 text-[12.5px] text-muted">
                      saiu {hora(s.saiu_em)} · voltou {hora(s.acertada_em ?? s.voltou_em)}
                    </p>
                  </div>
                  <p className="m-0 mt-0.5 text-[12.5px] text-muted">
                    {entregues} de {s.entregas.length} {s.entregas.length === 1 ? "entrega" : "entregas"} feitas
                    {s.troco > 0 ? ` · levou ${formatBRL(s.troco)} de troco` : ""}
                  </p>
                  <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[13px]">
                    {s.entregas.map((e) => (
                      <li key={e.numero} className="flex flex-wrap justify-between gap-2">
                        <span className="text-ink">
                          <strong>#{e.numero}</strong>
                          {e.cliente ? ` · ${e.cliente}` : ""}
                          {e.bairro ? <span className="text-muted"> · {e.bairro}</span> : null}
                        </span>
                        <span className={e.situacao === "failed" ? "text-tdf" : "text-muted"}>
                          {formatBRL(e.total)} · {SITUACAO[e.situacao]}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {s.devolvido !== null ? (
                    <p
                      className={`m-0 mt-2 border-t border-border-shalon pt-2 text-[13px] ${
                        s.diferenca ? "font-semibold text-tdf" : "text-ink-2"
                      }`}
                    >
                      Entregou {formatBRL(s.devolvido)}
                      {s.diferenca
                        ? ` · ${s.diferenca < 0 ? "faltaram" : "sobraram"} ${formatBRL(Math.abs(s.diferenca))}${s.motivo ? ` (${s.motivo})` : ""}`
                        : " · conferido"}
                    </p>
                  ) : (
                    <p className="m-0 mt-2 border-t border-border-shalon pt-2 text-[13px] text-muted">
                      Ainda na rua.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
