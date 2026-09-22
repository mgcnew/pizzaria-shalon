import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/ui/components";
import { Cartao } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { rotuloInterno } from "@/domain/pedidos/estados";
import { obterPedido } from "@/application/pedidos/consultas";
import { obterLojaPublica } from "@/application/publico/consultas";
import { obterCaixa, obterPagamentoDoPedido } from "@/application/caixa/consultas";
import { listarBandeiras, listarFormasPagamento } from "@/application/configuracoes/consultas";
import { AcoesDoPedido } from "../_ui/AcoesDoPedido";
import { Comanda } from "../_ui/Comanda";
import { PainelAlteracao } from "../_ui/PainelAlteracao";
import { Recebimento } from "../_ui/Recebimento";

export const metadata: Metadata = { title: "Pedido" };

/**
 * Detalhe operacional do pedido.
 *
 * Tudo que decide alguma coisa — quais ações existem, se dá para alterar,
 * se a comanda pode sair — vem decidido do servidor. A tela desenha.
 *
 * O WhatsApp do cliente aparece como link `wa.me` porque é assim que a
 * Shalon fala com quem pediu (RN-ALT-002). Não existe chat interno: conversa
 * acontece no WhatsApp, e o aceite da alteração acontece no acompanhamento —
 * mensagem respondida não é aceite (RN-ALT-004).
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pedido, loja, pagamento, formas, bandeiras, caixa] = await Promise.all([
    obterPedido(id),
    obterLojaPublica(),
    obterPagamentoDoPedido(id),
    listarFormasPagamento(),
    listarBandeiras(),
    obterCaixa(),
  ]);

  if (pedido === null) notFound();

  // Só formas ATIVAS entram na lista. A disponibilidade por modalidade é
  // regra do checkout público; no balcão o que vale é o que a pizzaria
  // aceita hoje (RN-PGTO-001/006).
  const formasParaRecebimento = formas
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

  const estado = rotuloInterno(pedido.status);
  const fuso = loja?.fuso ?? "America/Sao_Paulo";
  const quando = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  const revisaoAberta = pedido.revisoes.find((r) => r.status === "pending_customer");
  const temAlteracaoAplicada = pedido.revisoes.some((r) => r.status === "applied");

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/pedidos"
        className="inline-flex min-h-touch items-center text-[14px] text-ink-2 no-underline"
      >
        ← Voltar para a fila
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-[26px] font-extrabold text-ink">
            Pedido #{pedido.numero}
          </h1>
          <p className="m-0 text-[13.5px] text-ink-2">
            {quando(pedido.criado_em)} ·{" "}
            {pedido.modalidade === "delivery" ? "Entrega" : "Retirada"}
            {pedido.origem !== "shalon_link" ? ` · ${pedido.origem}` : ""}
          </p>
        </div>
        <StatusBadge tom={estado.tom}>{estado.rotulo}</StatusBadge>
      </header>

      {pedido.motivo_rejeicao !== null ? (
        <p className="m-0 rounded-12 bg-td px-4 py-3 text-[14px] font-semibold text-tdf">
          Rejeitado: {pedido.motivo_rejeicao}
        </p>
      ) : null}
      {pedido.motivo_cancelamento !== null ? (
        <p className="m-0 rounded-12 bg-td px-4 py-3 text-[14px] font-semibold text-tdf">
          Cancelado: {pedido.motivo_cancelamento}
        </p>
      ) : null}

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        <div className="flex flex-col gap-4">
          <Cartao titulo="Ações" largura="cheio">
            <AcoesDoPedido pedidoId={pedido.id} acoes={pedido.acoes} />
            {pedido.acoes.length === 0 ? (
              <p className="m-0 text-[13.5px] text-ink-2">
                Nada a fazer aqui agora — ou por causa do estado do pedido, ou porque o seu
                acesso não inclui estas ações.
              </p>
            ) : null}
          </Cartao>

          <Cartao titulo="Itens" largura="cheio">
            <ul className="m-0 list-none p-0">
              {pedido.itens.map((item) => (
                <li
                  key={item.linha}
                  className="border-b border-border-shalon py-2 last:border-0"
                >
                  <div className="flex justify-between gap-3">
                    <span className="text-[15px] font-semibold text-ink">
                      {item.quantidade}× {item.sabores?.map((s) => s.nome).join(" / ") ?? item.nome}
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-[15px] text-ink">
                      {formatBRL(item.total)}
                    </span>
                  </div>
                  {item.tamanho !== null ? (
                    <p className="m-0 text-[13px] text-ink-2">{item.tamanho}</p>
                  ) : null}
                  {item.sabores !== null && item.sabores.length > 1 ? (
                    <p className="m-0 text-[13px] font-semibold text-twf">Meio a meio</p>
                  ) : null}
                  {item.borda !== null ? (
                    <p className="m-0 text-[13px] text-ink-2">Borda: {item.borda}</p>
                  ) : null}
                  {item.adicionais !== null && item.adicionais.length > 0 ? (
                    <p className="m-0 text-[13px] text-ink-2">
                      Adicionais: {item.adicionais.join(", ")}
                    </p>
                  ) : null}
                  {item.combo?.map((c) => (
                    <p key={c.nome} className="m-0 text-[13px] text-ink-2">
                      – {c.quantidade}× {c.nome}
                      {c.tamanho !== null ? ` (${c.tamanho})` : ""}
                    </p>
                  ))}
                  {item.observacao !== null ? (
                    <p className="m-0 text-[13px] italic text-twf">“{item.observacao}”</p>
                  ) : null}
                </li>
              ))}
            </ul>

            <div className="mt-3 flex justify-between text-[14px] text-ink-2">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatBRL(pedido.subtotal)}</span>
            </div>
            <div className="flex justify-between text-[14px] text-ink-2">
              <span>Taxa de entrega</span>
              <span className="tabular-nums">
                {pedido.modalidade === "pickup" ? "—" : formatBRL(pedido.taxa_entrega)}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between border-t border-border-shalon pt-2">
              <span className="font-semibold text-ink">Total</span>
              <span className="font-display text-[20px] font-extrabold tabular-nums text-ink">
                {formatBRL(pedido.total)}
              </span>
            </div>

            {pedido.observacao !== null ? (
              <p className="m-0 mt-3 rounded-10 bg-elev px-3 py-2 text-[13.5px] italic text-ink-2">
                “{pedido.observacao}”
              </p>
            ) : null}
          </Cartao>

          <Cartao titulo="Alteração" largura="cheio">
            <PainelAlteracao
              pedidoId={pedido.id}
              versao={pedido.versao}
              itens={pedido.itens}
              podeAlterar={pedido.pode_alterar}
              podeRetirar={pedido.pode_retirar_alteracao}
              revisaoAberta={revisaoAberta}
            />
          </Cartao>
        </div>

        <div className="flex flex-col gap-4">
          <Cartao titulo="Cliente" largura="cheio">
            <p className="m-0 text-[15px] font-semibold text-ink">{pedido.cliente.nome}</p>
            <a
              href={`https://wa.me/${pedido.cliente.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-touch items-center text-[14px] font-semibold text-ink-2"
            >
              Falar no WhatsApp
            </a>

            {pedido.modalidade === "delivery" && pedido.endereco !== null ? (
              <div className="mt-2 text-[13.5px] text-ink-2">
                <p className="m-0">
                  {pedido.endereco["logradouro"]}, {pedido.endereco["numero"]}
                  {pedido.endereco["complemento"] !== null
                    ? ` — ${pedido.endereco["complemento"]}`
                    : ""}
                </p>
                <p className="m-0">
                  {pedido.endereco["bairro"]}, {pedido.endereco["cidade"]}/
                  {pedido.endereco["uf"]}
                </p>
                {pedido.endereco["referencia"] !== null ? (
                  <p className="m-0">Ref.: {pedido.endereco["referencia"]}</p>
                ) : null}
                {pedido.distancia_km !== null ? (
                  <p className="m-0 text-muted">{pedido.distancia_km} km de rota</p>
                ) : null}
              </div>
            ) : null}
          </Cartao>

          <Cartao titulo="Pagamento" largura="cheio">
            {pedido.pagamento?.pix_status === "pending" ? (
              <p className="m-0 mb-3 rounded-10 bg-tw px-3 py-2 text-[13px] font-semibold text-twf">
                Pix ainda não confirmado. Nada vai à produção antes disso — e confirmar o Pix
                não é o mesmo que registrar o recebimento.
              </p>
            ) : null}
            {pedido.pagamento?.pix_status === "confirmed" ? (
              <p className="m-0 mb-3 text-[13px] text-tgf">
                Pix confirmado em {quando(pedido.pagamento.pix_confirmado_em as string)}.
              </p>
            ) : null}

            <Recebimento
              pedidoId={pedido.id}
              total={pedido.total}
              pagamento={pagamento}
              formas={formasParaRecebimento}
              caixaAberto={caixa.aberto}
              tentativa={randomUUID()}
            />
          </Cartao>

          <Cartao titulo="Comanda 58 mm" largura="cheio">
            <Comanda
              pedidoId={pedido.id}
              impressoes={pedido.impressoes}
              podeEmitirAlteracao={temAlteracaoAplicada}
            />
            <p className="m-0 mt-3 text-[12px] text-muted">
              O envio direto para a impressora Bluetooth ainda não foi validado no
              equipamento (A-08). Por isso o documento é conferido aqui e o resultado é
              registrado por quem olhou a impressora.
            </p>
          </Cartao>

          <Cartao titulo="Histórico" largura="cheio">
            <ul className="m-0 list-none p-0">
              {pedido.historico.map((h, i) => (
                <li key={i} className="border-b border-border-shalon py-[6px] text-[13px] last:border-0">
                  <span className="text-ink">{rotuloInterno(h.para).rotulo}</span>
                  <span className="text-muted"> · {quando(h.em)}</span>
                  {h.motivo !== null ? (
                    <p className="m-0 text-[12.5px] italic text-ink-2">{h.motivo}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Cartao>
        </div>
      </div>
    </div>
  );
}
