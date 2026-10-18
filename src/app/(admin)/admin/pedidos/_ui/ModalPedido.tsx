import { Badge, StatusBadge } from "@/ui/components";
import { formatBRL } from "@/lib/format";
import { ESTADOS_COM_ACRESCIMO, rotuloDeModalidade, rotuloDeOrigem, rotuloInterno } from "@/domain/pedidos/estados";
import type { PedidoAdministrativo } from "@/application/pedidos/tipos";
import { Comanda } from "./Comanda";
import { EstruturaModalPedido } from "./EstruturaModalPedido";
import { PainelAcrescimo } from "./PainelAcrescimo";


export function ModalPedido({
  pedido,
  tipo,
  fuso,
  fecharEm,
  podeAcrescentar = false,
  acrescentarAberto = false,
}: {
  pedido: PedidoAdministrativo;
  tipo: "detalhes" | "comanda";
  fuso: string;
  fecharEm: string;
  /** Tem `orders.request_change` (o estado do pedido é conferido aqui). */
  podeAcrescentar?: boolean;
  /** Veio do menu "Acrescentar itens": o painel já abre. */
  acrescentarAberto?: boolean;
}) {
  const mostraAcrescimo =
    podeAcrescentar && !pedido.aguarda_cliente && ESTADOS_COM_ACRESCIMO.includes(pedido.status);
  const ultimaAplicada = pedido.revisoes.find((revisao) => revisao.status === "applied");
  const estado = rotuloInterno(pedido.status);
  const quando = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(pedido.criado_em));
  const subtitulo = `${quando} · ${rotuloDeOrigem(pedido.origem)} · ${rotuloDeModalidade(pedido.modalidade)}`;

  if (tipo === "comanda") {
    return (
      <EstruturaModalPedido
        titulo={`Comanda do pedido #${pedido.numero}`}
        subtitulo={subtitulo}
        fecharEm={fecharEm}
        largura="regular"
      >
        <Comanda
          pedidoId={pedido.id}
          impressoes={pedido.impressoes}
          podeEmitirAlteracao={pedido.revisoes.some((revisao) => revisao.status === "applied")}
          documentoDeAcrescimo={ultimaAplicada?.tipo === "addition"}
        />
        <p className="mb-0 mt-4 text-[12px] text-muted">
          Confira a prévia e registre se o documento saiu ou não no equipamento.
        </p>
      </EstruturaModalPedido>
    );
  }

  return (
    <EstruturaModalPedido
      titulo={`Detalhes do pedido #${pedido.numero}`}
      subtitulo={subtitulo}
      fecharEm={fecharEm}
      largura="regular"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Situação atual</span>
          <StatusBadge tom={estado.tom}>{estado.rotulo}</StatusBadge>
        </div>

        <section className="rounded-16 border border-border-shalon bg-surface p-4">
          <h3 className="m-0 mb-2 text-[14px] font-bold text-ink">Itens do pedido</h3>
          <ul className="m-0 list-none p-0">
            {pedido.itens.map((item) => (
              <li key={item.linha} className="border-b border-border-shalon py-2.5 last:border-0">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold text-ink">
                    {item.quantidade}× {item.sabores?.map((sabor) => sabor.nome).join(" / ") ?? item.nome}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink">{formatBRL(item.total)}</span>
                </div>
                <div className="mt-0.5 text-[12.5px] text-ink-2">
                  {item.tamanho ? <span>{item.tamanho}</span> : null}
                  {item.borda ? <span> · Borda: {item.borda}</span> : null}
                  {item.adicionais?.length ? <span> · {item.adicionais.join(", ")}</span> : null}
                </div>
                {item.observacao ? <p className="mb-0 mt-1 text-[12.5px] italic text-twf">“{item.observacao}”</p> : null}
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-border-shalon pt-3 text-[13px]">
            <p className="m-0 flex justify-between text-ink-2"><span>Subtotal</span><span>{formatBRL(pedido.subtotal)}</span></p>
            <p className="m-0 flex justify-between text-ink-2"><span>Taxa de entrega</span><span>{pedido.modalidade === "pickup" ? "—" : formatBRL(pedido.taxa_entrega)}</span></p>
            <p className="m-0 flex items-baseline justify-between gap-3 border-t border-border-shalon pt-2 text-[16px] font-bold text-ink"><span>Total</span><span className="font-display text-[20px] tabular-nums">{formatBRL(pedido.total)}</span></p>
          </div>
          {pedido.observacao ? (
            <p className="mb-0 mt-3 rounded-10 bg-elev px-3 py-2 text-[13px] italic text-ink-2">“{pedido.observacao}”</p>
          ) : null}
          {mostraAcrescimo ? (
            <div className="mt-3 border-t border-border-shalon pt-3">
              <PainelAcrescimo
                pedidoId={pedido.id}
                versao={pedido.versao}
                origem={pedido.origem}
                abertoDeInicio={acrescentarAberto}
              />
            </div>
          ) : null}
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="min-w-0 rounded-16 border border-border-shalon bg-surface p-4">
            <h3 className="m-0 mb-2 text-[13px] font-bold uppercase tracking-wide text-muted">Cliente</h3>
            <p className="m-0 font-semibold text-ink">{pedido.cliente.nome}</p>
            <a href={`https://wa.me/${pedido.cliente.whatsapp}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex text-[13px] font-semibold text-brand-red">
              Abrir WhatsApp
            </a>
            {pedido.endereco ? (
              <div className="mt-2 text-[12.5px] text-ink-2">
                <p className="m-0">{pedido.endereco["logradouro"]}, {pedido.endereco["numero"]}</p>
                <p className="m-0">{pedido.endereco["bairro"]}, {pedido.endereco["cidade"]}/{pedido.endereco["uf"]}</p>
                {pedido.endereco["referencia"] ? <p className="m-0">Ref.: {pedido.endereco["referencia"]}</p> : null}
              </div>
            ) : null}
          </section>

          <section className="min-w-0 rounded-16 border border-border-shalon bg-surface p-4">
            <h3 className="m-0 mb-2 text-[13px] font-bold uppercase tracking-wide text-muted">Pagamento</h3>
            <p className="m-0 font-semibold text-ink">{pedido.pagamento?.forma ?? "Não informado"}</p>
            {pedido.pagamento?.bandeira ? <p className="m-0 text-[12.5px] text-muted">{pedido.pagamento.bandeira}</p> : null}
            {pedido.pagamento?.pix_status ? (
              <div className="mt-2"><Badge tom={pedido.pagamento.pix_status === "confirmed" ? "destaque" : "atencao"}>Pix {pedido.pagamento.pix_status === "confirmed" ? "confirmado" : "pendente"}</Badge></div>
            ) : null}
          </section>
        </div>

        {pedido.historico.length > 0 ? (
          <details className="group rounded-16 border border-border-shalon bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13px] font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
              <span>Histórico recente <span className="font-normal text-muted">({Math.min(pedido.historico.length, 5)})</span></span>
              <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <ul className="m-0 list-none p-0">
              {pedido.historico.slice(-5).reverse().map((item, indice) => (
                <li key={`${item.em}-${indice}`} className="mx-4 border-t border-border-shalon py-2 text-[12.5px]">
                  <span className="font-semibold text-ink">{rotuloInterno(item.para).rotulo}</span>
                  {item.motivo ? <span className="block italic text-muted">{item.motivo}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </EstruturaModalPedido>
  );
}
