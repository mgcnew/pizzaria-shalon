import {
  BlocosPublicosCarregando,
  TelaPublicaCarregando,
  TituloPublicoCarregando,
  VoltarCarregando,
} from "../_ui/Esqueletos";

/** Skeleton de Finalizar pedido. */
export default function Loading() {
  return (
    <TelaPublicaCarregando nome="a finalização do pedido" className="px-4 py-4">
      <VoltarCarregando />
      <TituloPublicoCarregando titulo="Finalizar pedido" />
      <BlocosPublicosCarregando quantidade={4} className="h-[120px]" />
    </TelaPublicaCarregando>
  );
}
