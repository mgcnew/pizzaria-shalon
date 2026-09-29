import { Skeleton } from "@/ui/patterns";
import {
  BlocosCarregando,
  CabecalhoCarregando,
  CartaoCarregando,
  IndicadoresCarregando,
  LinhasCarregando,
  PilulasCarregando,
  TelaCarregando,
} from "./_ui/Esqueletos";

/**
 * Skeleton do Dashboard.
 *
 * Por estar na pasta `admin/`, este arquivo é também o limite de carregamento
 * de todas as seções. Na prática, só aparece para o Dashboard: cada seção tem
 * o seu `loading.tsx`, e o Next pré-carrega a rota até ele. Medido em produção
 * com a mesma estrutura de rotas (slot `@modal`, interceptação, layout com
 * `cookies()`): a troca de seção mostra direto o skeleton da seção, sem passar
 * por este, e ele não vaza para dentro do slot do modal. Ver D-2026-09-29-87.
 */
export default function Loading() {
  return (
    <TelaCarregando nome="o painel">
      <CabecalhoCarregando
        titulo="Dashboard"
        acoes={<PilulasCarregando quantidade={5} forma="chip" className="flex flex-wrap gap-2" />}
      />

      <CartaoCarregando descricao>
        <BlocosCarregando quantidade={3} />
      </CartaoCarregando>

      <IndicadoresCarregando
        quantidade={4}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      />

      <CartaoCarregando>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-3 w-[70%]" delay={i * 0.04} />
              <Skeleton className="mt-2 h-5 w-[40%]" delay={i * 0.04 + 0.04} />
            </div>
          ))}
        </div>
      </CartaoCarregando>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CartaoCarregando>
          <LinhasCarregando quantidade={4} />
        </CartaoCarregando>
        <CartaoCarregando descricao>
          <LinhasCarregando quantidade={4} />
        </CartaoCarregando>
      </div>
    </TelaCarregando>
  );
}
