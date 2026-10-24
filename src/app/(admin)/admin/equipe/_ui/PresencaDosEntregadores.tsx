import Link from "next/link";
import { Cartao, EmptyState, LinhaLista } from "@/ui/patterns";
import type { PresencaDoMes } from "@/application/entregas/tipos";

/**
 * Presença dos entregadores, mês a mês (D-2026-10-24-165).
 *
 * Só leitura do que a equipe marcou em Entregas (Veio ou Faltou, por dia de
 * trabalho). Dia SEM marcação não conta nem como presença nem como falta: ele
 * só quer dizer que ninguém marcou, e a tela diz isso, em vez de fingir que
 * sabe.
 *
 * Isto NÃO é folha de pagamento (CLAUDE.md §46): não calcula desconto nem
 * pagamento nenhum, e falta aqui não vira desconto de ninguém.
 */

const MES = /^(\d{4})-(\d{2})$/;

function deslocarMes(mes: string, delta: number): string {
  const m = MES.exec(mes);
  if (!m) return mes;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function nomeDoMes(mes: string): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${mes}-01T12:00:00Z`),
  );
}

/** `2026-10-17` → `17/10`. Sem passar por Date: não há fuso para errar. */
function diaEMes(data: string): string {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

export function PresencaDosEntregadores({
  presenca,
  mes,
  mesAtual,
}: {
  presenca: PresencaDoMes | null;
  /** `YYYY-MM` do mês em tela. */
  mes: string;
  /** `YYYY-MM` de hoje: o mês seguinte a ele não é oferecido. */
  mesAtual: string;
}) {
  const anterior = deslocarMes(mes, -1);
  const seguinte = deslocarMes(mes, 1);
  const podeAvancar = seguinte <= mesAtual;
  const link = "min-h-touch inline-flex items-center rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[13.5px] font-semibold text-ink no-underline hover:border-brand-orange";

  return (
    <Cartao
      titulo="Presença dos entregadores"
      descricao="O que a equipe marcou em Entregas: Veio ou Faltou. Dia sem marcação não conta como falta nem como presença."
      largura="cheio"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/admin/equipe?aba=presenca&mes=${anterior}`} className={link}>
          ← {nomeDoMes(anterior)}
        </Link>
        <p className="m-0 font-display text-[17px] font-bold text-ink first-letter:uppercase">{nomeDoMes(mes)}</p>
        {podeAvancar ? (
          <Link href={`/admin/equipe?aba=presenca&mes=${seguinte}`} className={link}>
            {nomeDoMes(seguinte)} →
          </Link>
        ) : (
          <span aria-hidden="true" className="min-w-[1px]" />
        )}
      </div>

      {presenca === null || presenca.funcionarios.length === 0 ? (
        <EmptyState
          titulo="Nenhum entregador para mostrar"
          descricao="Quem está cadastrado como entregador aparece aqui, com as marcações do mês."
        />
      ) : (
        presenca.funcionarios.map((f) => {
          const faltas = f.dias.filter((d) => d.status === "absent");
          return (
            <LinhaLista key={f.funcionario_id}>
              <div className="min-w-[180px] flex-1">
                <p className="m-0 text-[14px] font-semibold text-ink">
                  {f.nome}
                  {f.ativo ? "" : " · desligado"}
                </p>
                <p className="m-0 text-[12.5px] text-muted">
                  Veio {f.veio} {f.veio === 1 ? "dia" : "dias"} · Faltou {f.faltou} {f.faltou === 1 ? "dia" : "dias"}
                </p>
                {faltas.length > 0 ? (
                  <p className="m-0 mt-1 text-[12.5px] text-tdf">
                    Faltas: {faltas.map((d) => diaEMes(d.data)).join(", ")}
                  </p>
                ) : null}
              </div>
            </LinhaLista>
          );
        })
      )}
    </Cartao>
  );
}
