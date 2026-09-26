import type { Metadata } from "next";
import Link from "next/link";
import { obterCaixa } from "@/application/caixa/consultas";
import { listarPedidosAReceber } from "@/application/pdv/consultas";
import { formasDePagamento } from "@/application/checkout/consultas";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { formatBRL } from "@/lib/format";
import { NovaVenda } from "./_ui/NovaVenda";
import { PainelPedidosAReceber } from "./_ui/PainelPedidosAReceber";

export const metadata: Metadata = { title: "PDV" };

/**
 * /admin/pdv — Fase 12, Etapa 5: a primeira etapa com tela.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §4.1, §4.2, §4.4
 *
 * NOVA VENDA + PEDIDOS A RECEBER. O recebimento é a Etapa 7, a aba Caixa é a 8
 * e os atalhos completos são a 9 — e não há aqui esqueleto vazio de nenhuma
 * delas: meia tela que não funciona é pior do que tela que ainda não existe.
 *
 * As formas de pagamento vêm só de `pickup`: a venda de balcão é retirada por
 * definição (§0.3), e oferecer formas de entrega produziria uma intenção que
 * `criar_pedido` recusaria depois.
 *
 * A checagem de permissão aqui é de INTERFACE — evita oferecer um botão que
 * não levaria a nada. A proteção real é de `criar_pedido`, que exige
 * `orders.create_manual` e recusa a chamada direta (CLAUDE.md §12).
 *
 * O ESTADO DO CAIXA APARECE, MAS NÃO GATEIA NADA (§4.4). A fila é consultada
 * do mesmo jeito com o caixa fechado — `pedidos_a_receber()` não olha
 * `cash_sessions`, e a Etapa 5 da suíte prova isso fechando o caixa no meio do
 * bloco F. Fechar o caixa não deixa de haver pedido para cobrar; esconder a
 * fila só faria a casa descobrir a dívida no fechamento seguinte.
 *
 * As duas consultas vão em paralelo porque nenhuma depende da outra — e a do
 * caixa falhando devolve "fechado" em vez de derrubar a página.
 */
export default async function Page() {
  const [caixa, fila, formas, sessao] = await Promise.all([
    obterCaixa(),
    listarPedidosAReceber(),
    formasDePagamento("pickup"),
    obterSessaoInterna(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-[24px] font-bold text-ink">PDV</h1>
          <p className="m-0 mt-1 text-[13.5px] text-muted">
            Venda de balcão e cobrança. A venda nasce devendo e vai para a lista
            de recebimento — o estado financeiro é que decide quem aparece lá, não
            o estado da produção.
          </p>
        </div>

        {/* O cabeçalho do design mantém o caixa permanentemente visível (§4.1). */}
        {caixa.aberto ? (
          <p className="m-0 rounded-pill border-[1.5px] border-tgb bg-tg px-3 py-[6px] text-[13px] font-semibold text-tgf">
            Caixa aberto · esperado em dinheiro {formatBRL(caixa.esperado_em_dinheiro)}
          </p>
        ) : (
          <p className="m-0 flex flex-wrap items-center gap-2 rounded-pill border-[1.5px] border-twb bg-tw px-3 py-[6px] text-[13px] font-semibold text-twf">
            Caixa fechado
            <Link href="/admin/caixa" className="underline">
              abrir caixa
            </Link>
          </p>
        )}
      </header>

      <NovaVenda formas={formas} autorizado={podeNaUI(sessao, "orders.create_manual")} />

      <PainelPedidosAReceber pedidos={fila.pedidos} falhou={fila.falhou} />
    </div>
  );
}
