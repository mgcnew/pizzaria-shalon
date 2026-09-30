import {
  BlocosPublicosCarregando,
  TelaPublicaCarregando,
  TituloPublicoCarregando,
  VoltarCarregando,
} from "../_ui/Esqueletos";

/** Skeleton de Seu carrinho. */
export default function Loading() {
  return (
    <TelaPublicaCarregando nome="o carrinho" className="px-4 py-4">
      <VoltarCarregando />
      <TituloPublicoCarregando titulo="Seu carrinho" />
      <BlocosPublicosCarregando quantidade={3} className="h-[88px]" />
    </TelaPublicaCarregando>
  );
}
