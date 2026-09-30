import { BlocosPublicosCarregando, TelaPublicaCarregando } from "../../_ui/Esqueletos";

/** Skeleton do acompanhamento do pedido: status, itens e entrega. */
export default function Loading() {
  return (
    <TelaPublicaCarregando nome="o pedido" className="mx-auto max-w-[680px] px-4 py-4">
      <BlocosPublicosCarregando quantidade={3} className="h-[110px]" />
    </TelaPublicaCarregando>
  );
}
