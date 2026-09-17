/**
 * PlaceholderFase — marcador honesto de rota ainda não implementada.
 *
 * Reaproveita o padrão visual de estado vazio do design (borda tracejada,
 * fundo --elev, texto centralizado) para deixar explícito o que existe e o
 * que ainda não existe, sem simular funcionalidade.
 *
 * Some conforme cada fase implementa a rota correspondente.
 */
export function PlaceholderFase({
  titulo,
  fase,
  descricao,
}: {
  titulo: string;
  fase: string;
  descricao: string;
}) {
  return (
    <section className="px-4 py-6">
      <div className="mx-auto max-w-[560px] rounded-16 border border-dashed border-border-shalon bg-elev px-6 py-10 text-center">
        <p className="m-0 font-display text-[20px] font-bold text-ink">{titulo}</p>
        <p className="mt-2 text-[14px] text-ink-2">{descricao}</p>
        <p className="mt-4 inline-block rounded-pill bg-tn px-[11px] py-[5px] text-[12px] font-semibold text-tnf">
          Prevista para a {fase}
        </p>
      </div>
    </section>
  );
}
