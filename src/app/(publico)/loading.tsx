import { Skeleton } from "@/ui/patterns";
import { GradeCarregando, TelaPublicaCarregando } from "./_ui/Esqueletos";

/**
 * Skeleton do cardápio: busca, banner, chips de categoria e a primeira grade.
 *
 * Por estar na pasta do grupo, este arquivo também é o limite das páginas
 * filhas; cada uma tem o seu `loading.tsx`, que é o que aparece ao navegar
 * (D-2026-09-29-87, medido no painel com a mesma estrutura).
 */
export default function LoadingPublico() {
  return (
    <TelaPublicaCarregando nome="o cardápio">
      <div className="px-4 pt-4">
        <Skeleton className="h-[50px] w-full rounded-10" />
      </div>
      <Skeleton className="mx-4 mt-4 aspect-[2/1] rounded-20 lg:mx-auto lg:w-[min(calc(100%-32px),calc(60svh*2))]" delay={0.04} />
      <div className="flex gap-4 overflow-hidden px-4 pb-2 pt-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex w-[74px] shrink-0 flex-col items-center gap-2">
            <Skeleton className="h-[74px] w-[74px] rounded-full" delay={0.06 + i * 0.04} />
            <Skeleton className="h-3 w-12" delay={0.08 + i * 0.04} />
          </div>
        ))}
      </div>
      <section className="px-4 pt-6">
        <Skeleton className="mb-3 h-6 w-52" delay={0.1} />
        <GradeCarregando quantidade={6} />
      </section>
    </TelaPublicaCarregando>
  );
}
