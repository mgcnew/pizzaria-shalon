import type { Metadata } from "next";
import { obterCaixa } from "@/application/caixa/consultas";
import { formasParaRecebimento } from "@/application/configuracoes/consultas";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { randomUUID } from "node:crypto";
import { PdvComTeclado } from "./_ui/PdvComTeclado";

export const metadata: Metadata = { title: "PDV" };

/**
 * /admin/pdv — Fase 12, Etapa 5: a primeira etapa com tela.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §4.1, §4.2, §4.4
 *
 * O PDV é a venda rápida de balcão para produtos que não exigem produção.
 * Cobranças de pedidos ficam na fila de Pedidos; aqui permanecem a montagem da
 * venda e as operações físicas da gaveta.
 *
 * As formas de pagamento vêm só de `pickup`: a venda de balcão é retirada por
 * definição (§0.3), e oferecer formas de entrega produziria uma intenção que
 * `criar_pedido` recusaria depois.
 *
 * A checagem de permissão aqui é de INTERFACE — evita oferecer um botão que
 * não levaria a nada. A proteção real é de `criar_pedido`, que exige
 * `orders.create_manual` e recusa a chamada direta (CLAUDE.md §12).
 *
 * O resumo de fechamento NÃO é carregado com a página. A conferência é cega:
 * ele só chega ao navegador depois que a pessoa informa a contagem.
 */
export default async function Page() {
  const [caixa, formas, sessao] = await Promise.all([
    obterCaixa(),
    formasParaRecebimento(),
    obterSessaoInterna(),
  ]);

  return (
    <div className="flex min-h-[calc(100dvh-111px)] flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-[24px] font-bold text-ink">PDV</h1>
          <p className="m-0 mt-1 text-[13.5px] text-muted">
            Venda rápida de balcão para bebidas e produtos prontos. Itens que
            exigem preparo continuam no fluxo de Pedidos.
          </p>
        </div>

        {caixa.aberto ? (
          <p className="m-0 rounded-pill border border-tgb bg-tg px-3 py-2 text-[13px] font-semibold text-tgf">
            <span className="mr-2 inline-block size-2 rounded-full bg-current" />
            Caixa aberto
          </p>
        ) : (
          <p className="m-0 rounded-12 border-[1.5px] border-twb bg-tw px-3 py-2 text-[13px] font-semibold text-twf">
            Caixa fechado · abra pela barra de operações abaixo
          </p>
        )}
      </header>

      <PdvComTeclado
        formas={formas}
        autorizado={
          podeNaUI(sessao, "orders.create_manual") &&
          podeNaUI(sessao, "payments.register") &&
          podeNaUI(sessao, "orders.accept")
        }
        caixa={caixa.aberto
          ? { aberto: true, aberta_por: caixa.aberta_por }
          : { aberto: false }}
        tentativa={randomUUID()}
        podeMovimentar={podeNaUI(sessao, "cash.adjust")}
      />
    </div>
  );
}
