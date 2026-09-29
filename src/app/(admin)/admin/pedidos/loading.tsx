import { Skeleton } from "@/ui/patterns";
import {
  BotaoCarregando,
  CabecalhoCarregando,
  PilulasCarregando,
  TabelaCarregando,
  TelaCarregando,
} from "../_ui/Esqueletos";

/**
 * Skeleton da fila de pedidos: tabela no desktop, cartões abaixo de `lg`,
 * como a página. A troca entre as duas é CSS, não medição em JavaScript
 * (CLAUDE.md §8).
 *
 * Aparece ao entrar em Pedidos. Trocar de aba (Abertos/Encerrados) ou abrir o
 * modal de detalhes ou comanda muda só a query: o Next mantém a fila na tela e
 * o retorno visual é o indicador do link clicado.
 */
export default function Loading() {
  return (
    <TelaCarregando nome="os pedidos" className="flex flex-col gap-4">
      <CabecalhoCarregando
        titulo="Pedidos"
        classeTitulo="text-[24px] font-extrabold"
        className="flex flex-wrap items-end justify-between gap-2"
        acoes={
          <div className="flex flex-wrap gap-2">
            <BotaoCarregando className="w-[118px]" />
            <BotaoCarregando className="w-[92px]" />
          </div>
        }
      />

      <PilulasCarregando quantidade={2} />

      <TabelaCarregando linhas={6} colunas={7} className="hidden lg:block" />

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] lg:hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-16 border border-border-shalon bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-24" delay={i * 0.04} />
              <Skeleton className="h-6 w-24 rounded-pill" delay={i * 0.04 + 0.02} />
            </div>
            <Skeleton className="mt-3 h-[13px] w-[70%]" delay={i * 0.04 + 0.04} />
            <Skeleton className="mt-2 h-[13px] w-[52%]" delay={i * 0.04 + 0.06} />
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-11 flex-1 rounded-11" delay={i * 0.04 + 0.08} />
              <Skeleton className="h-11 w-11 rounded-11" delay={i * 0.04 + 0.1} />
            </div>
          </div>
        ))}
      </div>
    </TelaCarregando>
  );
}
