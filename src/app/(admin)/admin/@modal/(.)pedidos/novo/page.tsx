import { redirect } from "next/navigation";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { formasDePagamento } from "@/application/checkout/consultas";
import { ModalNovoPedido } from "@/app/(admin)/admin/pedidos/_ui/ModalNovoPedido";

export default async function ModalNovoPedidoInterceptado() {
  const [sessao, entrega, retirada] = await Promise.all([
    obterSessaoInterna(),
    formasDePagamento("delivery"),
    formasDePagamento("pickup"),
  ]);

  if (!podeNaUI(sessao, "orders.create_manual")) redirect("/admin/pedidos");

  return (
    <ModalNovoPedido
      formasPorModalidade={{ delivery: entrega, pickup: retirada }}
      fecharComVoltar
    />
  );
}
