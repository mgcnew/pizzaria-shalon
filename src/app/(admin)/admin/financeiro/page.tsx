import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { listarCategorias, listarLancamentos, obterCaixa } from "@/application/caixa/consultas";
import { listarFormasPagamento } from "@/application/configuracoes/consultas";
import { PainelFinanceiro } from "./_ui/PainelFinanceiro";

export const metadata: Metadata = { title: "Entradas / Despesas" };

/**
 * /admin/financeiro
 *
 * Entradas e despesas operacionais. NÃO é o relatório de vendas: venda vive
 * em `payments`, ligada a um pedido, e é somada em outro lugar (03 §17.1).
 *
 * Esta tela também não fala em lucro, margem ou CMV — sem modelo de custos
 * completo, esses números seriam invenção (RN-FIN-005). O que a Fase 9 vai
 * construir em cima daqui é análise; aqui é registro.
 */
export default async function Page() {
  const [categorias, lancamentos, formas, caixa] = await Promise.all([
    listarCategorias(),
    listarLancamentos({ limite: 100 }),
    listarFormasPagamento(),
    obterCaixa(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="m-0 font-display text-[24px] font-bold text-ink">Entradas / Despesas</h1>
        <p className="m-0 mt-1 text-[13.5px] text-muted">
          Movimentação financeira operacional. Vendas de pedidos não aparecem aqui — elas
          têm registro próprio.
        </p>
      </header>

      <PainelFinanceiro
        categorias={categorias}
        lancamentos={lancamentos}
        formas={formas.filter((f) => f.is_active).map((f) => ({ id: f.id, nome: f.name }))}
        caixaAberto={caixa.aberto}
        tentativa={randomUUID()}
      />
    </div>
  );
}
