import {
  CabecalhoCarregando,
  CamposCarregando,
  CartaoCarregando,
  LinhasCarregando,
  PilulasCarregando,
  TelaCarregando,
} from "../_ui/Esqueletos";

/** Skeleton de Entradas / Despesas: abas, novo lançamento e histórico. */
export default function Loading() {
  return (
    <TelaCarregando nome="o financeiro">
      <CabecalhoCarregando titulo="Entradas / Despesas" subtitulo={2} />
      <div className="flex flex-col gap-4">
        <PilulasCarregando quantidade={2} forma="chip" className="flex flex-wrap gap-2" />
        <CartaoCarregando descricao className="max-w-[620px]">
          <CamposCarregando quantidade={3} />
        </CartaoCarregando>
        <CartaoCarregando>
          <LinhasCarregando quantidade={5} />
        </CartaoCarregando>
      </div>
    </TelaCarregando>
  );
}
