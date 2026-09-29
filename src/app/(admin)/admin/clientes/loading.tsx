import { Skeleton } from "@/ui/patterns";
import {
  CabecalhoCarregando,
  IndicadoresCarregando,
  TabelaCarregando,
  TelaCarregando,
} from "../_ui/Esqueletos";

/** Skeleton de Clientes: os seis contadores e a tabela com o filtro. */
export default function Loading() {
  return (
    <TelaCarregando nome="os clientes">
      <CabecalhoCarregando titulo="Clientes" />
      <IndicadoresCarregando
        quantidade={6}
        compacto
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
      />
      <section className="rounded-16 border border-border-shalon bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-[10px]">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-[104px] rounded-11" delay={0.04} />
        </div>
        <div className="overflow-x-hidden">
          <TabelaCarregando linhas={8} colunas={6} moldura={false} className="min-w-[640px]" />
        </div>
      </section>
    </TelaCarregando>
  );
}
