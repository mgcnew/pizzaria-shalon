import {
  GradeCarregando,
  TelaPublicaCarregando,
  TituloPublicoCarregando,
  VoltarCarregando,
} from "../_ui/Esqueletos";

/** Skeleton de Favoritos. */
export default function Loading() {
  return (
    <TelaPublicaCarregando nome="os favoritos" className="px-4 py-4">
      <VoltarCarregando />
      <TituloPublicoCarregando titulo="Favoritos" />
      <GradeCarregando quantidade={6} />
    </TelaPublicaCarregando>
  );
}
