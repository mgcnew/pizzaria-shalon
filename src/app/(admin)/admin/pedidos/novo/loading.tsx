import { Skeleton } from "@/ui/patterns";
import {
  CabecalhoCarregando,
  CamposCarregando,
  CartaoCarregando,
  TelaCarregando,
} from "../../_ui/Esqueletos";

/**
 * Skeleton da página de novo pedido, usada em acesso direto. Vindo da fila, a
 * rota é interceptada e quem carrega é o modal (`@modal/(.)pedidos/novo`).
 */
export default function Loading() {
  return (
    <TelaCarregando nome="o novo pedido" className="flex flex-col gap-4">
      <div className="flex min-h-touch items-center">
        <Skeleton className="h-4 w-36" />
      </div>
      <CabecalhoCarregando titulo="Novo pedido" classeTitulo="text-[24px] font-extrabold" />
      <CartaoCarregando>
        <CamposCarregando quantidade={3} />
      </CartaoCarregando>
      <CartaoCarregando>
        <CamposCarregando quantidade={2} />
      </CartaoCarregando>
    </TelaCarregando>
  );
}
