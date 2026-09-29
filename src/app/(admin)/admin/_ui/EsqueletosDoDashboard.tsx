import { Skeleton } from "@/ui/patterns";
import { CartaoCarregando, IndicadoresCarregando, LinhasCarregando } from "./Esqueletos";

/**
 * Skeletons dos blocos do Dashboard que chegam por streaming (D-2026-09-29-90).
 *
 * Os mesmos componentes servem ao `loading.tsx` da rota e ao `<Suspense>` de
 * cada bloco da página: a tela passa do skeleton de rota para o dos blocos
 * sem mudar de forma.
 */

/** Indicadores, "Entre o que foi vendido e o que entrou" e os dois quadros. */
export function ResumoCarregando() {
  return (
    <>
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
      <DoisQuadros />
    </>
  );
}

/** Mais vendidos e menor movimentação. */
export function RankingCarregando() {
  return <DoisQuadros descricao />;
}

/** Dias de maior movimento e horários de pico. */
export function MovimentoCarregando() {
  return <DoisQuadros descricao />;
}

function DoisQuadros({ descricao = false }: { descricao?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <CartaoCarregando>
        <LinhasCarregando quantidade={4} />
      </CartaoCarregando>
      <CartaoCarregando descricao={descricao}>
        <LinhasCarregando quantidade={4} />
      </CartaoCarregando>
    </div>
  );
}
