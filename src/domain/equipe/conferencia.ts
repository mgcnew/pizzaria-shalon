/** Prévia gerencial em centavos; não registra pagamento nem desconto. */
export function calcularPrevisaoDePagamento({
  valorReferencia,
  base,
  diarias,
  lancamentos,
  selecionados,
}: {
  valorReferencia: number;
  base: "daily" | "monthly";
  diarias: number;
  lancamentos: readonly { id: string; valor: number }[];
  selecionados: readonly string[];
}) {
  const baseCentavos = Math.round(valorReferencia * 100) * (base === "daily" ? diarias : 1);
  const escolhidos = new Set(selecionados);
  const abatimentosCentavos = lancamentos.reduce(
    (total, item) => total + (escolhidos.has(item.id) ? Math.round(item.valor * 100) : 0),
    0,
  );
  return {
    base: baseCentavos / 100,
    abatimentos: abatimentosCentavos / 100,
    previsao: (baseCentavos - abatimentosCentavos) / 100,
  };
}
