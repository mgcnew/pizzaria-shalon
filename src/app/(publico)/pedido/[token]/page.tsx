import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { descreverEstado } from "@/domain/pedidos/estados";
import { alteracaoDoPedido, pedidoPorToken, pixDoPedido } from "@/application/checkout/consultas";
import { ChavePix } from "../../_ui/ChavePix";
import { DecidirAlteracao } from "../../_ui/DecidirAlteracao";
import { AcompanharAoVivo } from "../../_ui/AcompanharAoVivo";
import { assinaturaDoPedido } from "@/domain/pedidos/acompanhamento";
import { separarMassa } from "@/domain/pedidos/comanda";
import { tetoDaTaxaAConfirmar } from "@/domain/pedidos/taxaAConfirmar";

export const metadata: Metadata = {
  title: "Acompanhar pedido",
  // O link carrega o token. Ele não deve entrar em índice de busca.
  robots: { index: false, follow: false },
};

const TOM = {
  aguardando: "border-twb bg-tw text-twf",
  andamento: "border-border-shalon bg-elev text-ink",
  concluido: "border-tgb bg-tg text-tgf",
  problema: "border-tdb bg-td text-tdf",
} as const;

/**
 * Acompanhamento individual do pedido (03 §10).
 *
 * O token na URL é a única credencial, e dá acesso a UM pedido. Token
 * inválido e pedido inexistente levam à mesma página de "não encontrado" —
 * quem estiver tentando adivinhar não aprende nada com a diferença.
 *
 * Nada de telefone completo, id interno, auditoria, nota interna ou dado de
 * funcionário: a projeção do banco já não os devolve.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ novo?: string }>;
}) {
  const { token } = await params;
  const { novo } = await searchParams;

  const pedido = await pedidoPorToken(token);
  if (pedido === null) notFound();

  const estado = descreverEstado(pedido.status);
  // Taxa a confirmar pela loja (D-2026-10-17-149). Pedido encerrado sem
  // taxa definida (recusado) não mostra "a confirmar".
  const tetoAConfirmar = estado.emAberto ? tetoDaTaxaAConfirmar(pedido.endereco) : null;
  const pix =
    pedido.pagamento.pix_status === "pending" ? await pixDoPedido(token) : { ok: false as const };

  // RN-ALT-004: quando há proposta aguardando, ela vem ANTES de tudo — é o
  // que o cliente precisa resolver para o pedido andar.
  const alteracao =
    pedido.status === "change_requested_waiting_customer"
      ? await alteracaoDoPedido(token)
      : { ok: false as const };

  return (
    <section className="mx-auto max-w-[680px] px-4 py-4">
      {novo === "1" ? (
        <div className="mb-4 rounded-14 border border-tgb bg-tg p-4">
          <p className="m-0 font-display text-[20px] font-bold text-tgf">
            Pedido enviado, {pedido.cliente_nome.split(" ")[0]}!
          </p>
          <p className="m-0 mt-1 text-[14px] text-ink-2">
            Guarde este link: é por ele que você acompanha o pedido. Ele funciona neste e em
            qualquer outro aparelho, então não o compartilhe com quem não deve ver o pedido.
          </p>
        </div>
      ) : null}

      <AcompanharAoVivo
        token={token}
        numero={pedido.numero}
        assinatura={assinaturaDoPedido(pedido)}
        status={pedido.status}
      />

      {alteracao.ok ? <DecidirAlteracao token={token} proposta={alteracao} /> : null}

      <p className="m-0 text-[13px] text-muted">Pedido</p>
      <h1 className="m-0 font-display text-[28px] font-extrabold text-ink">
        #{pedido.numero}
      </h1>

      <div className={`mt-3 rounded-14 border p-4 ${TOM[estado.tom]}`}>
        <p className="m-0 text-[16px] font-bold">{estado.titulo}</p>
        <p className="m-0 mt-1 text-[14px] text-ink-2">{estado.detalhe}</p>

        {pedido.aguarda_aprovacao_entrega && estado.emAberto ? (
          <p className="m-0 mt-2 text-[13.5px] font-semibold">
            {tetoAConfirmar !== null
              ? `A pizzaria está conferindo o seu endereço para confirmar a taxa de entrega (até ${formatBRL(tetoAConfirmar)}).`
              : "A entrega para o seu endereço ainda depende da aprovação da pizzaria."}
          </p>
        ) : null}

        {pedido.motivo_rejeicao ? (
          <p className="m-0 mt-2 text-[13.5px]">Motivo: {pedido.motivo_rejeicao}</p>
        ) : null}
        {pedido.motivo_cancelamento ? (
          <p className="m-0 mt-2 text-[13.5px]">Motivo: {pedido.motivo_cancelamento}</p>
        ) : null}
      </div>

      {pix.ok ? (
        <div className="mt-3 rounded-14 border border-twb bg-tw p-4">
          <p className="m-0 text-[15px] font-bold text-twf">
            Pix de {formatBRL(pix.valor)} para {pix.titular}
          </p>
          <ChavePix chave={pix.chave} tipo={pix.tipo} />
          {pix.instrucoes ? (
            <p className="m-0 mt-2 text-[13.5px] text-ink-2">{pix.instrucoes}</p>
          ) : null}
          <p className="m-0 mt-2 text-[12.5px] text-muted">
            Depois de pagar, é só aguardar: a pizzaria confirma o recebimento e o preparo começa.
          </p>
        </div>
      ) : null}

      <div className="mt-3 rounded-16 border border-border-shalon bg-surface p-4">
        <h2 className="m-0 mb-2 text-[15px] font-bold text-ink">Seu pedido</h2>
        <ul className="m-0 list-none p-0">
          {pedido.itens.map((item, i) => (
            <li key={i} className="border-b border-border-shalon py-2 last:border-0">
              <div className="flex justify-between gap-3">
                <span className="min-w-0 text-[15px] text-ink">
                  {item.quantidade}× {item.sabores?.join(" / ") ?? item.nome}
                </span>
                <span className="whitespace-nowrap tabular-nums text-[15px] text-ink">
                  {formatBRL(item.total)}
                </span>
              </div>
              {item.tamanho ? (
                <p className="m-0 text-[13px] text-ink-2">{item.tamanho}</p>
              ) : null}
              {item.borda ? (
                <p className="m-0 text-[13px] text-ink-2">Borda: {item.borda}</p>
              ) : null}
              {(() => {
                const { massa, ingredientes } = separarMassa(item.adicionais);
                return (
                  <>
                    {massa ? <p className="m-0 text-[13px] font-semibold text-ink-2">{massa}</p> : null}
                    {ingredientes.length > 0 ? (
                      <p className="m-0 text-[13px] text-ink-2">Adicionais: {ingredientes.join(", ")}</p>
                    ) : null}
                  </>
                );
              })()}
              {item.observacao ? (
                <p className="m-0 text-[13px] italic text-muted">“{item.observacao}”</p>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="mt-3 flex justify-between text-[14.5px] text-ink-2">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatBRL(pedido.subtotal)}</span>
        </div>
        <div className="flex justify-between text-[14.5px] text-ink-2">
          <span>{pedido.modalidade === "pickup" ? "Retirada" : "Taxa de entrega"}</span>
          <span className="tabular-nums">
            {pedido.modalidade === "pickup"
              ? "—"
              : tetoAConfirmar !== null
                ? `a confirmar (até ${formatBRL(tetoAConfirmar)})`
                : formatBRL(pedido.taxa_entrega)}
          </span>
        </div>
        <div className="mt-2 flex items-baseline justify-between border-t border-border-shalon pt-2">
          <span className="font-semibold text-ink">Total</span>
          <span className="font-display text-[22px] font-extrabold tabular-nums text-ink">
            {tetoAConfirmar !== null ? `${formatBRL(pedido.subtotal)} + entrega` : formatBRL(pedido.total)}
          </span>
        </div>

        <p className="m-0 mt-3 text-[13.5px] text-ink-2">
          Pagamento: {pedido.pagamento.forma ?? "—"}
          {pedido.pagamento.bandeira ? ` · ${pedido.pagamento.bandeira}` : ""}
          {tetoAConfirmar !== null && pedido.pagamento.troco_para !== null
            ? ` · troco para ${formatBRL(pedido.pagamento.troco_para)}`
            : pedido.pagamento.troco_esperado !== null
              ? ` · troco de ${formatBRL(pedido.pagamento.troco_esperado)}`
              : ""}
        </p>

        {pedido.observacao ? (
          <p className="m-0 mt-2 text-[13.5px] italic text-ink-2">“{pedido.observacao}”</p>
        ) : null}
      </div>

      <div className="mt-3 rounded-16 border border-border-shalon bg-surface p-4">
        <h2 className="m-0 mb-1 text-[15px] font-bold text-ink">
          {pedido.modalidade === "pickup" ? "Retirada em" : "Entrega em"}
        </h2>
        {pedido.modalidade === "pickup" ? (
          <p className="m-0 text-[14px] text-ink-2">
            {pedido.loja["logradouro"]}, {pedido.loja["numero"]} — {pedido.loja["bairro"]},{" "}
            {pedido.loja["cidade"]}/{pedido.loja["uf"]}
          </p>
        ) : pedido.endereco ? (
          <p className="m-0 text-[14px] text-ink-2">
            {pedido.endereco["logradouro"]}, {pedido.endereco["numero"]}
            {pedido.endereco["complemento"] ? ` — ${pedido.endereco["complemento"]}` : ""}
            <br />
            {pedido.endereco["bairro"]}, {pedido.endereco["cidade"]}/{pedido.endereco["uf"]}
            {pedido.endereco["referencia"] ? (
              <>
                <br />
                Referência: {pedido.endereco["referencia"]}
              </>
            ) : null}
          </p>
        ) : null}

        {pedido.estimativa_min !== null && estado.emAberto ? (
          <p className="m-0 mt-2 text-[13.5px] text-muted">
            Previsão informada no envio: {pedido.estimativa_min}
            {pedido.estimativa_max !== null ? `–${pedido.estimativa_max}` : ""} min.
          </p>
        ) : null}
      </div>

      <Link
        href="/"
        className="mt-4 inline-flex min-h-touch items-center text-[15px] text-ink-2"
      >
        ← Voltar ao cardápio
      </Link>
    </section>
  );
}
