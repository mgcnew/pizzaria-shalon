import { Skeleton } from "@/ui/patterns";
import { CamposCarregando, CartaoCarregando, TelaCarregando } from "../../_ui/Esqueletos";

/**
 * Skeleton da edição de produto como página (acesso direto e celular). Do
 * desktop, a edição abre em modal pela rota interceptada.
 */
export default function Loading() {
  return (
    <TelaCarregando nome="o produto" className="flex max-w-[720px] flex-col gap-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-[min(280px,70%)]" delay={0.04} />
      <CartaoCarregando>
        <CamposCarregando quantidade={4} />
      </CartaoCarregando>
      <CartaoCarregando>
        <CamposCarregando quantidade={2} />
      </CartaoCarregando>
    </TelaCarregando>
  );
}
