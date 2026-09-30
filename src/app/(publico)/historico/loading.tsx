import {
  BlocosPublicosCarregando,
  TelaPublicaCarregando,
  TituloPublicoCarregando,
  VoltarCarregando,
} from "../_ui/Esqueletos";

/** Skeleton de Histórico. */
export default function Loading() {
  return (
    <TelaPublicaCarregando nome="o histórico" className="px-4 py-4">
      <VoltarCarregando />
      <TituloPublicoCarregando titulo="Histórico" />
      <BlocosPublicosCarregando quantidade={4} />
    </TelaPublicaCarregando>
  );
}
