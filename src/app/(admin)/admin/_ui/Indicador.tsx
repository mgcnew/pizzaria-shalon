import type { Variacao } from "@/application/analitico/tipos";

/**
 * Um indicador com comparação honesta.
 *
 * REGRAS QUE ESTE COMPONENTE CARREGA:
 *
 *  · a comparação é sempre com o período ANTERIOR DE MESMA DURAÇÃO, e o
 *    rótulo diz isso — "vs. 30 dias anteriores", não um "+12%" solto;
 *  · base zero não vira percentual. Quando `comparavel` é falso, aparece
 *    "sem base de comparação", porque sair de R$ 0,00 não é "subir 100%";
 *  · nada aqui é chamado de lucro ou margem. Não há custo no sistema, logo
 *    esses números não existem (CLAUDE.md §28).
 */
export function Indicador({
  rotulo,
  valor,
  variacao,
  comparacao,
  explicacao,
}: {
  rotulo: string;
  valor: string;
  variacao?: Variacao | null;
  comparacao?: string;
  explicacao?: string;
}) {
  const sobe = variacao?.comparavel && (variacao.percentual ?? 0) > 0;
  const desce = variacao?.comparavel && (variacao.percentual ?? 0) < 0;

  return (
    <div className="rounded-16 border border-border-shalon bg-surface p-4">
      <p className="m-0 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-muted">
        {rotulo}
      </p>
      <p className="m-0 mt-[6px] font-display text-[22px] font-bold text-ink">{valor}</p>

      {variacao ? (
        <p
          className={[
            "m-0 mt-[6px] text-[12.5px] font-semibold",
            sobe ? "text-tgf" : desce ? "text-tdf" : "text-muted",
          ].join(" ")}
        >
          {variacao.comparavel
            ? `${(variacao.percentual ?? 0) > 0 ? "+" : ""}${variacao.percentual}% ${comparacao ?? ""}`
            : "sem base de comparação"}
        </p>
      ) : null}

      {explicacao ? (
        <p className="m-0 mt-[6px] text-[12px] text-muted">{explicacao}</p>
      ) : null}
    </div>
  );
}
