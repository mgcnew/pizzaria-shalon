import { Skeleton } from "@/ui/patterns";
import {
  BlocosPublicosCarregando,
  TelaPublicaCarregando,
  VoltarCarregando,
} from "../../../_ui/Esqueletos";

/**
 * Skeleton da fogazza de um sabor: a mesma página de produto, sem o bloco
 * de tamanhos — o tamanho é fixo (RN-FOG-004).
 */
export default function Loading() {
  return (
    <TelaPublicaCarregando nome="a fogazza">
      <div className="px-4 pt-4">
        <VoltarCarregando />
      </div>
      <div className="px-4">
        <Skeleton className="mt-2 h-[170px] w-full rounded-18" delay={0.04} />
        <Skeleton className="mt-4 h-3 w-28" delay={0.05} />
        <Skeleton className="mt-2 h-7 w-[min(240px,60%)]" delay={0.06} />
        <Skeleton className="mt-3 h-[14px] w-[85%]" delay={0.08} />
        <Skeleton className="mt-3 h-7 w-28" delay={0.1} />
        <Skeleton className="mt-3 h-11 w-32 rounded-11" delay={0.12} />
        <div className="mt-5">
          <BlocosPublicosCarregando quantidade={2} className="h-[112px]" />
        </div>
      </div>
    </TelaPublicaCarregando>
  );
}
