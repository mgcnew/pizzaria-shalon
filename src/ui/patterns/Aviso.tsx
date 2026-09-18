/**
 * Aviso de resultado de formulário.
 *
 * Reutiliza as famílias tonais do design: perigo para erro, sucesso para
 * confirmação. O texto nunca depende só da cor (CLAUDE.md §38).
 */
export function Aviso({ erro, ok }: { erro?: string; ok?: string }) {
  if (!erro && !ok) return null;
  const perigo = Boolean(erro);
  return (
    <p
      role={perigo ? "alert" : "status"}
      className={[
        "m-0 rounded-12 border px-3 py-[10px] text-[13.5px] font-semibold",
        perigo ? "border-tdb bg-td text-tdf" : "border-tgb bg-tg text-tgf",
      ].join(" ")}
    >
      {erro ?? ok}
    </p>
  );
}
