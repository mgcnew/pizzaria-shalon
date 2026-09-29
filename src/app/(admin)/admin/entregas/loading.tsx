import {
  BlocosCarregando,
  CabecalhoCarregando,
  CartaoCarregando,
  TelaCarregando,
} from "../_ui/Esqueletos";

/** Skeleton de Entregas: montagem da saída e a lista de corridas. */
export default function Loading() {
  return (
    <TelaCarregando nome="as entregas">
      <CabecalhoCarregando titulo="Entregas" />
      <CartaoCarregando descricao>
        <BlocosCarregando quantidade={2} className="h-[72px] rounded-12" />
      </CartaoCarregando>
      <CartaoCarregando descricao>
        <BlocosCarregando quantidade={3} />
      </CartaoCarregando>
    </TelaCarregando>
  );
}
