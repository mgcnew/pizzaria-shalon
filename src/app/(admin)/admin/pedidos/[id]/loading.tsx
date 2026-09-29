import { Skeleton } from "@/ui/patterns";
import {
  CabecalhoCarregando,
  CartaoCarregando,
  LinhasCarregando,
  TelaCarregando,
} from "../../_ui/Esqueletos";

/** Skeleton do detalhe do pedido: as duas colunas de cartões da página. */
export default function Loading() {
  return (
    <TelaCarregando nome="o pedido" className="flex flex-col gap-4">
      <div className="flex min-h-touch items-center">
        <Skeleton className="h-4 w-36" />
      </div>

      <CabecalhoCarregando
        className="flex flex-wrap items-start justify-between gap-3"
        acoes={<Skeleton className="h-7 w-28 rounded-pill" delay={0.06} />}
      />

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        <div className="flex flex-col gap-4">
          <CartaoCarregando>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-11 w-32 rounded-11" delay={0.04} />
              <Skeleton className="h-11 w-28 rounded-11" delay={0.08} />
            </div>
          </CartaoCarregando>
          <CartaoCarregando>
            <LinhasCarregando quantidade={3} />
          </CartaoCarregando>
        </div>
        <div className="flex flex-col gap-4">
          <CartaoCarregando>
            <LinhasCarregando quantidade={4} />
          </CartaoCarregando>
          <CartaoCarregando>
            <LinhasCarregando quantidade={3} />
          </CartaoCarregando>
        </div>
      </div>
    </TelaCarregando>
  );
}
