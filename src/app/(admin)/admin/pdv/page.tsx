import type { Metadata } from "next";
import { obterCaixa, obterResumoDeFechamento } from "@/application/caixa/consultas";
import { listarPedidosAReceber } from "@/application/pdv/consultas";
import { formasDePagamento } from "@/application/checkout/consultas";
import { listarBandeiras, listarFormasPagamento } from "@/application/configuracoes/consultas";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { formatBRL } from "@/lib/format";
import { randomUUID } from "node:crypto";
import { NovaVenda } from "./_ui/NovaVenda";
import { AreasDoPdv } from "./_ui/AreasDoPdv";

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
  const [caixa, fila, formas, sessao, todasAsFormas, bandeiras] = await Promise.all([
    obterCaixa(),
    listarPedidosAReceber(),
    formasDePagamento("pickup"),
    obterSessaoInterna(),
    listarFormasPagamento(),
    listarBandeiras(),
  ]);

  // O resumo só existe com caixa aberto, e é ele que o painel de fechamento
  // usa para mostrar DE ONDE vem o esperado antes de alguém contar a gaveta.
  const resumo = caixa.aberto ? await obterResumoDeFechamento(caixa.sessao_id) : null;

  // As formas do RECEBIMENTO são outra lista, e é de propósito: a intenção é
  // filtrada por modalidade (regra do checkout), enquanto o recebido é o que a
  // pizzaria aceita hoje, com as bandeiras cadastradas (RN-PGTO-001/006). É a
  // mesma projeção da tela de pedido — não uma segunda leitura de formas.
  const formasDeRecebimento = todasAsFormas
    .filter((f) => f.is_active)
    .map((f) => ({
      id: f.id,
      nome: f.name,
      familia: f.payment_family,
      exige_bandeira: f.requires_brand,
      bandeiras: bandeiras
        .filter((b) => b.payment_method_id === f.id && b.is_active)
        .map((b) => ({ id: b.id, nome: b.name })),
    }));

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

        {/* O caixa fica PERMANENTEMENTE visível (§4.1), porque quase toda
            operação do balcão depende dele. Fechado, o aviso não manda mais
            para outra tela: abrir o caixa agora acontece aqui, na aba Caixa. */}
        {caixa.aberto ? (
          <div className="rounded-12 border-[1.5px] border-tgb bg-tg px-3 py-2 text-[13px] text-tgf">
            <p className="m-0 font-semibold">
              Caixa aberto · esperado em dinheiro {formatBRL(caixa.esperado_em_dinheiro)}
            </p>
            <p className="m-0 mt-[2px] text-[12px] opacity-90">
              Sessão de {new Date(`${caixa.data_operacional}T12:00:00`).toLocaleDateString("pt-BR")}
              {" · "}fundo {formatBRL(caixa.fundo)}
              {caixa.dinheiro_fora_da_gaveta > 0
                ? ` · ${formatBRL(caixa.dinheiro_fora_da_gaveta)} ainda fora da gaveta`
                : ""}
            </p>
          </div>
        ) : (
          <p className="m-0 rounded-12 border-[1.5px] border-twb bg-tw px-3 py-2 text-[13px] font-semibold text-twf">
            Caixa fechado · abra na aba <span className="underline">Caixa</span> para
            poder receber
          </p>
        )}
      </header>

      <NovaVenda
        formas={formas}
        formasDeRecebimento={formasDeRecebimento}
        caixaAberto={caixa.aberto}
        autorizado={podeNaUI(sessao, "orders.create_manual")}
      />

      <AreasDoPdv
        pedidos={fila.pedidos}
        falhouAFila={fila.falhou}
        formas={formasDeRecebimento}
        caixa={caixa}
        resumo={resumo}
        tentativa={randomUUID()}
        podeMovimentar={podeNaUI(sessao, "cash.adjust")}
      />
    </div>
  );
}
