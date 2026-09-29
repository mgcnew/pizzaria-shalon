import {
  CabecalhoCarregando,
  CartaoCarregando,
  LinhasCarregando,
  PilulasCarregando,
  TelaCarregando,
} from "../_ui/Esqueletos";

/** Skeleton de Funcionários / Equipe: abas e os cartões da aba ativa. */
export default function Loading() {
  return (
    <TelaCarregando nome="a equipe">
      <CabecalhoCarregando titulo="Funcionários / Equipe" />
      <div className="flex flex-col gap-4">
        <PilulasCarregando quantidade={3} />
        <CartaoCarregando descricao>
          <LinhasCarregando quantidade={3} />
        </CartaoCarregando>
        <CartaoCarregando>
          <LinhasCarregando quantidade={5} />
        </CartaoCarregando>
      </div>
    </TelaCarregando>
  );
}
