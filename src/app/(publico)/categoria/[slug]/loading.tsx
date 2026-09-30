import { Skeleton } from "@/ui/patterns";
import {
  GradeCarregando,
  TelaPublicaCarregando,
  VoltarCarregando,
} from "../../_ui/Esqueletos";

/** Skeleton da categoria: voltar, nome, chips e a grade de produtos. */
export default function Loading() {
  return (
    <TelaPublicaCarregando nome="a categoria">
      <div className="px-4 pt-4">
        <VoltarCarregando />
        <Skeleton className="mt-3 h-8 w-[min(240px,65%)]" delay={0.04} />
      </div>
      <div className="flex gap-4 overflow-hidden px-4 pb-2 pt-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[74px] w-[74px] shrink-0 rounded-full" delay={0.06 + i * 0.04} />
        ))}
      </div>
      <section className="px-4 pt-5">
        <GradeCarregando quantidade={9} />
      </section>
    </TelaPublicaCarregando>
  );
}
