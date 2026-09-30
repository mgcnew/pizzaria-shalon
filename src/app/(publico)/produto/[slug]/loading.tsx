import { Skeleton } from "@/ui/patterns";
import {
  BlocosPublicosCarregando,
  TelaPublicaCarregando,
  VoltarCarregando,
} from "../../_ui/Esqueletos";

/**
 * Skeleton do produto: foto, nome, preço, favoritar/compartilhar e as seções
 * do configurador. É a tela que o cliente mais abre a partir do cardápio.
 */
export default function Loading() {
  return (
    <TelaPublicaCarregando nome="o produto">
      <div className="px-4 pt-4">
        <VoltarCarregando />
      </div>
      <div className="px-4">
        <Skeleton className="mt-2 h-[170px] w-full rounded-18" delay={0.04} />
        <Skeleton className="mt-4 h-7 w-[min(280px,70%)]" delay={0.06} />
        <Skeleton className="mt-3 h-[14px] w-[90%]" delay={0.08} />
        <Skeleton className="mt-2 h-[14px] w-[65%]" delay={0.1} />
        <Skeleton className="mt-3 h-7 w-32" delay={0.12} />
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-11 w-28 rounded-11" delay={0.14} />
          <Skeleton className="h-11 w-32 rounded-11" delay={0.16} />
        </div>
        <div className="mt-5">
          <BlocosPublicosCarregando quantidade={3} className="h-[112px]" />
        </div>
      </div>
    </TelaPublicaCarregando>
  );
}
