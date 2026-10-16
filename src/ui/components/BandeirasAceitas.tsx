/**
 * Bandeiras aceitas, como LEGENDA (15/10/2026).
 *
 * A pessoa escolhe a FORMA (débito, crédito, voucher, Pix) e vê aqui quais
 * bandeiras a maquininha passa — para saber se o cartão dela serve, sem ter
 * que escolher nem informar nada. A bandeira não é registrada na venda.
 */
export function BandeirasAceitas({
  bandeiras,
  className = "",
}: {
  bandeiras: readonly { id: string; nome: string }[];
  className?: string;
}) {
  if (bandeiras.length === 0) return null;
  return (
    <div className={className}>
      <p className="m-0 mb-1.5 text-[12.5px] text-muted">Bandeiras aceitas</p>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {bandeiras.map((b) => (
          <li
            key={b.id}
            className="rounded-pill border border-border-shalon bg-elev px-2.5 py-1 text-[12.5px] font-semibold text-ink-2"
          >
            {b.nome}
          </li>
        ))}
      </ul>
    </div>
  );
}
