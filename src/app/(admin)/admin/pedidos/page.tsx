import type { Metadata } from "next";
import Link from "next/link";
import { Abas, type Aba } from "@/ui/patterns";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { obterLojaPublica } from "@/application/publico/consultas";
import { formasDePagamento } from "@/application/checkout/consultas";
import { esperaDaFila, listarEncerrados, listarFila, obterPedido } from "@/application/pedidos/consultas";
import {
  descreverJanela,
  diasDaUrl,
  horarioDosEncerrados,
} from "@/application/pedidos/janelaDeEncerrados";
import type { JanelaDeEncerrados, PedidoNaFila } from "@/application/pedidos/tipos";
import { IndicadorDeNavegacao } from "@/ui/components/IndicadorDeNavegacao";
import { listarPedidosAReceber } from "@/application/pdv/consultas";
import { formasParaRecebimento } from "@/application/configuracoes/consultas";
import { obterCaixa } from "@/application/caixa/consultas";
import { CentralDePedidos } from "./_ui/CentralDePedidos";
import { CartaoPedido } from "./_ui/CartaoPedido";
import { TabelaPedidos } from "./_ui/TabelaPedidos";
import { ModalNovoPedido } from "./_ui/ModalNovoPedido";
import { ModalPedido } from "./_ui/ModalPedido";

export const metadata: Metadata = { title: "Pedidos" };

/** Quantos dias cada "Carregar dias anteriores" acrescenta (D-2026-09-29-93). */
const PASSO_DE_DIAS = 7;

const ABAS: readonly Aba[] = [
  { nome: "Em aberto", valor: "abertos" },
  { nome: "Encerrados", valor: "encerrados" },
];

/**
 * Central operacional de pedidos.
 *
 * Duas listas, e não uma com filtro escondido: o que está em aberto é a
 * operação de agora; o que encerrou é consulta. Misturar as duas faria o
 * balcão rolar a tela para achar o pedido que acabou de chegar.
 *
 * A aba viaja na URL, e não em estado de cliente — recarregar a página não
 * perde o lugar, e o link pode ser passado adiante.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    dias?: string;
    novo?: string;
    modal?: string;
    pedido?: string;
  }>;
}) {
  const { aba, dias, novo, modal, pedido: pedidoId } = await searchParams;
  const encerrados = aba === "encerrados";
  const diasAnteriores = encerrados ? diasDaUrl(dias) : 0;
  // O começo da query da aba, repetido nos links de modal e no fechamento:
  // abrir um pedido não pode descartar os dias já carregados.
  const consultaDaAba = encerrados
    ? `aba=encerrados&${diasAnteriores > 0 ? `dias=${diasAnteriores}&` : ""}`
    : "";

  // Encerrados vêm por janela (desde a abertura do caixa, ou o dia), e não
  // mais a história inteira; em aberto, a fila de sempre.
  const consultaDaFila: Promise<{ janela: JanelaDeEncerrados | null; pedidos: PedidoNaFila[] }> =
    encerrados
      ? listarEncerrados(diasAnteriores).then((janela) => ({ janela, pedidos: janela.pedidos }))
      : listarFila(false).then((pedidos) => ({ janela: null, pedidos }));
  const tipoModal = modal === "detalhes" || modal === "comanda" ? modal : null;

  const [sessao, { janela, pedidos }, loja, aReceber, formasDeRecebimento, caixa, pedidoModal] = await Promise.all([
    obterSessaoInterna(),
    consultaDaFila,
    obterLojaPublica(),
    // A MESMA autoridade que monta a fila do PDV decide quem está devendo
    // aqui. Nada de um segundo critério de "quem é cobrável".
    listarPedidosAReceber(),
    formasParaRecebimento(),
    obterCaixa(),
    tipoModal && pedidoId ? obterPedido(pedidoId) : Promise.resolve(null),
  ]);

  const cobraveis = Object.fromEntries(aReceber.pedidos.map((p) => [p.id, p]));
  const podeCriarPedido = podeNaUI(sessao, "orders.create_manual");
  const abrirNovoPedido = novo === "1" && podeCriarPedido;
  const [formasEntrega, formasRetirada] = abrirNovoPedido
    ? await Promise.all([formasDePagamento("delivery"), formasDePagamento("pickup")])
    : [[], []];

  // O horário é formatado AQUI, no fuso configurado da loja. Deixar para o
  // navegador faria o balcão e a cozinha verem horas diferentes se algum
  // aparelho estivesse com o fuso trocado.
  const fuso = loja?.fuso ?? "America/Sao_Paulo";
  const formatador = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  });
  const hora = encerrados
    ? horarioDosEncerrados(pedidos, fuso)
    : Object.fromEntries(pedidos.map((p) => [p.id, formatador.format(new Date(p.criado_em))]));

  // A espera nasce no relógio do SERVIDOR, na camada de aplicação. Este é o
  // valor do primeiro render; a tabela reancora nele e depois avança sozinha.
  const espera = esperaDaFila(pedidos);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="m-0 font-display text-[24px] font-extrabold text-ink">Pedidos</h1>
          <p className="m-0 text-[13.5px] text-ink-2">
            {sessao === null
              ? "Sessão não identificada."
              : `Operando como ${sessao.papeis.join(", ") || "usuário interno"}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* RN-MAN-001: o balcão lança pedidos de WhatsApp, telefone,
              balcão, iFood ou outro canal. A permissão real é conferida no
              servidor; aqui o botão só não aparece para quem não a tem. */}
          {podeCriarPedido ? (
            <Link
              href="/admin/pedidos/novo"
              className="min-h-touch inline-flex items-center rounded-11 border-0 bg-cta px-[14px] text-[13.5px] font-semibold text-cta-fg no-underline"
            >
              Novo pedido
            </Link>
          ) : null}
          <Link
            href="/admin/pedidos?aba=abertos"
            className="min-h-touch inline-flex items-center rounded-11 border-[1.5px] border-border-shalon px-[14px] text-[13.5px] font-semibold text-ink no-underline"
          >
            Atualizar
          </Link>
        </div>
      </header>

      <Abas abas={ABAS} atual={encerrados ? "encerrados" : "abertos"} parametro="aba" base="/admin/pedidos" />

      {encerrados && janela && janela.desde === null ? (
        // Falha na consulta não vira "nenhum pedido": diz que não carregou.
        <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
          <p className="m-0 font-display text-[19px] font-bold text-ink">
            {descreverJanela(janela, fuso)}
          </p>
          <Link
            href={`/admin/pedidos?${consultaDaAba.slice(0, -1)}`}
            className="relative mt-3 inline-flex min-h-touch items-center rounded-11 border-[1.5px] border-border-shalon bg-surface px-[14px] text-[13.5px] font-semibold text-ink no-underline hover:border-brand-orange"
          >
            Tentar de novo
            <IndicadorDeNavegacao forma="traco" />
          </Link>
        </div>
      ) : encerrados && janela ? (
        <>
          <p className="m-0 text-[13px] text-muted">{descreverJanela(janela, fuso)}</p>

          {pedidos.length === 0 ? (
            <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
              <p className="m-0 font-display text-[19px] font-bold text-ink">
                {janela.origem === "caixa" && janela.diasAnteriores === 0
                  ? "Nenhum pedido encerrado desde a abertura do caixa"
                  : janela.diasAnteriores === 0
                    ? "Nenhum pedido encerrado hoje"
                    : "Nenhum pedido encerrado nesse período"}
              </p>
            </div>
          ) : (
            <>
              {/* ENCERRADOS MANTÉM O MAIS NOVO EM CIMA. Esta lista é consulta,
                  não operação: quem abre aqui procura o que acabou de acontecer.
                  É a ordem que a RPC já devolve, e por isso não se mexe nela. */}
              <TabelaPedidos
                pedidos={pedidos}
                hora={hora}
                espera={espera}
                modo="encerrado"
                rotulo="Pedidos encerrados, do mais recente para o mais antigo"
                consultaDaAba={consultaDaAba}
              />
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] lg:hidden">
                {pedidos.map((p) => (
                  <CartaoPedido
                    key={p.id}
                    pedido={p}
                    hora={hora[p.id] ?? ""}
                    consultaDaAba={consultaDaAba}
                  />
                ))}
              </div>
            </>
          )}

          {janela.haMais ? (
            <div className="flex justify-center">
              {/* `scroll={false}`: os dias novos entram embaixo, e a tela fica
                  onde a pessoa estava, em vez de voltar ao topo. */}
              <Link
                href={`/admin/pedidos?aba=encerrados&dias=${janela.diasAnteriores + PASSO_DE_DIAS}`}
                scroll={false}
                className="motion-interactive relative inline-flex min-h-touch items-center rounded-11 border-[1.5px] border-border-shalon bg-surface px-[14px] text-[13.5px] font-semibold text-ink no-underline transition-colors hover:border-brand-orange"
              >
                Carregar dias anteriores
                <IndicadorDeNavegacao forma="traco" />
              </Link>
            </div>
          ) : pedidos.length > 0 ? (
            <p className="m-0 text-center text-[12.5px] text-muted">
              Não há pedidos encerrados mais antigos.
            </p>
          ) : null}
        </>
      ) : (
        <CentralDePedidos
          pedidos={pedidos}
          hora={hora}
          espera={espera}
          cobraveis={cobraveis}
          formasDeRecebimento={formasDeRecebimento}
          caixaAberto={caixa.aberto}
          podeReceber={podeNaUI(sessao, "payments.register")}
          podeFiado={podeNaUI(sessao, "orders.defer_payment")}
        />
      )}

      {abrirNovoPedido ? (
        <ModalNovoPedido
          formasPorModalidade={{ delivery: formasEntrega, pickup: formasRetirada }}
        />
      ) : null}

      {tipoModal && pedidoModal ? (
        <ModalPedido
          pedido={pedidoModal}
          tipo={tipoModal}
          fuso={fuso}
          fecharEm={`/admin/pedidos${consultaDaAba ? `?${consultaDaAba.slice(0, -1)}` : ""}`}
        />
      ) : null}
    </div>
  );
}
