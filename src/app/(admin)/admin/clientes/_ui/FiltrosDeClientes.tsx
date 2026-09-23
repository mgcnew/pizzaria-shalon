import Link from "next/link";

/**
 * Filtros como links de URL.
 *
 * A AUSÊNCIA É FILTRO OBJETIVO, e é independente da cadência: "há mais de 30
 * dias sem comprar" é um fato, e vale para quem comprou uma, duas ou vinte
 * vezes. Ele não some por o cliente ter pouco histórico — some apenas quem
 * nunca comprou, que não está ausente, está sem histórico (RN-CRM-004).
 */

const AUSENCIAS = [15, 30, 60, 90];

const CADENCIAS: { valor: string; rotulo: string }[] = [
  { valor: "recorrente", rotulo: "Recorrentes" },
  { valor: "atencao", rotulo: "Em atenção" },
  { valor: "afastado", rotulo: "Afastados" },
  { valor: "base_fraca", rotulo: "Base fraca" },
  { valor: "dados_insuficientes", rotulo: "Sem histórico" },
];

function Chip({
  ativo,
  href,
  children,
}: {
  ativo: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "true" : undefined}
      className={[
        "motion-interactive inline-flex min-h-touch items-center rounded-11 px-[13px] text-[13px] font-semibold transition-colors",
        ativo
          ? "bg-cta text-cta-fg"
          : "border-[1.5px] border-border-shalon text-ink hover:border-brand-orange",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

export function FiltrosDeClientes({
  ausencia,
  classificacao,
}: {
  ausencia?: string;
  classificacao?: string;
}) {
  const url = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/admin/clientes?${q}` : "/admin/clientes";
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-muted">Sem comprar há</span>
        {AUSENCIAS.map((dias) => (
          <Chip
            key={dias}
            ativo={ausencia === String(dias)}
            href={url({
              ausencia: ausencia === String(dias) ? undefined : String(dias),
              cadencia: classificacao,
            })}
          >
            {dias}+ dias
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-muted">Cadência</span>
        {CADENCIAS.map((c) => (
          <Chip
            key={c.valor}
            ativo={classificacao === c.valor}
            href={url({
              ausencia,
              cadencia: classificacao === c.valor ? undefined : c.valor,
            })}
          >
            {c.rotulo}
          </Chip>
        ))}
      </div>
    </div>
  );
}
