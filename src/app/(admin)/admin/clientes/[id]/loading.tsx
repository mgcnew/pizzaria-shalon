import { Skeleton } from "@/ui/patterns";
import { CartaoCarregando, LinhasCarregando, TelaCarregando } from "../../_ui/Esqueletos";

/** Skeleton da ficha do cliente: padrão de compra e histórico lado a lado. */
export default function Loading() {
  return (
    <TelaCarregando nome="o cliente">
      <header>
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="mt-2.5 h-7 w-[min(260px,70%)]" delay={0.04} />
        <Skeleton className="mt-2.5 h-[14px] w-[min(220px,60%)]" delay={0.08} />
      </header>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CartaoCarregando>
          <LinhasCarregando quantidade={7} />
        </CartaoCarregando>
        <CartaoCarregando>
          <LinhasCarregando quantidade={5} />
        </CartaoCarregando>
      </div>
    </TelaCarregando>
  );
}
