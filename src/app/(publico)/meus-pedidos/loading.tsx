import {
  BlocosPublicosCarregando,
  TelaPublicaCarregando,
  TituloPublicoCarregando,
  VoltarCarregando,
} from "../_ui/Esqueletos";

/** Skeleton de Meus pedidos. */
export default function Loading() {
  return (
    <TelaPublicaCarregando nome="os seus pedidos" className="px-4 py-4">
      <VoltarCarregando />
      <TituloPublicoCarregando titulo="Meus pedidos" />
      <BlocosPublicosCarregando quantidade={3} />
    </TelaPublicaCarregando>
  );
}
