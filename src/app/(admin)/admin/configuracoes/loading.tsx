import {
  CamposCarregando,
  CartaoCarregando,
  LinhasCarregando,
  PilulasCarregando,
  TelaCarregando,
} from "../_ui/Esqueletos";

/**
 * Skeleton de Configurações: as seis seções em pílula e a grade de duas
 * colunas das seções. Trocar de seção muda só a query e não mostra este
 * skeleton: o retorno é o indicador da pílula clicada.
 */
export default function Loading() {
  return (
    <TelaCarregando
      nome="as configurações"
      className="mx-auto flex w-full max-w-[1440px] flex-col gap-4"
    >
      <PilulasCarregando quantidade={6} />
      <div className="grid items-start gap-4 md:grid-cols-[minmax(260px,0.8fr)_minmax(400px,1.2fr)] xl:grid-cols-[minmax(340px,0.75fr)_minmax(560px,1.25fr)]">
        <CartaoCarregando>
          <LinhasCarregando quantidade={5} />
        </CartaoCarregando>
        <CartaoCarregando descricao>
          <CamposCarregando quantidade={4} />
        </CartaoCarregando>
      </div>
    </TelaCarregando>
  );
}
