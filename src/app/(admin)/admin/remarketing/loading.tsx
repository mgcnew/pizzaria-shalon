import { Skeleton } from "@/ui/patterns";
import {
  BlocosCarregando,
  CabecalhoCarregando,
  CartaoCarregando,
  IndicadoresCarregando,
  PilulasCarregando,
  TelaCarregando,
} from "../_ui/Esqueletos";

/** Skeleton do Remarketing: faixa de ausência, contadores e candidatos. */
export default function Loading() {
  return (
    <TelaCarregando nome="o remarketing">
      <CabecalhoCarregando titulo="Remarketing" />
      <CartaoCarregando titulo={false}>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <PilulasCarregando quantidade={4} forma="chip" className="flex flex-wrap gap-2" />
        </div>
      </CartaoCarregando>
      <IndicadoresCarregando quantidade={4} compacto className="grid grid-cols-2 gap-3 sm:grid-cols-4" />
      <CartaoCarregando descricao>
        <BlocosCarregando quantidade={4} className="h-[68px] rounded-12" />
      </CartaoCarregando>
    </TelaCarregando>
  );
}
