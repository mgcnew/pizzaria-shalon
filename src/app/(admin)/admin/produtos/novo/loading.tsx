import { Skeleton } from "@/ui/patterns";
import { CamposCarregando, CartaoCarregando, TelaCarregando } from "../../_ui/Esqueletos";

/**
 * Skeleton do novo produto em acesso direto. Vindo da listagem, a rota é
 * interceptada e quem carrega é o modal (`@modal/(.)produtos/novo`).
 */
export default function Loading() {
  return (
    <TelaCarregando nome="o novo produto" className="flex max-w-[720px] flex-col gap-4">
      <Skeleton className="h-4 w-24" />
      <h1 className="m-0 font-display text-[22px] font-extrabold text-ink">Novo produto</h1>
      <CartaoCarregando>
        <CamposCarregando quantidade={4} />
      </CartaoCarregando>
      <CartaoCarregando>
        <CamposCarregando quantidade={2} />
      </CartaoCarregando>
    </TelaCarregando>
  );
}
