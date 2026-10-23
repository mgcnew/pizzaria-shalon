import { formatBRL } from "@/lib/format";
import type { ItemDoRascunho } from "@/application/pedidos/tipos";

/**
 * Resumo do pedido que está sendo montado, sempre à vista no modal do desktop.
 *
 * Existe para a pessoa que atende ao telefone: com o cliente na linha ela
 * precisa dizer "ficou R$ 62 com a entrega" sem terminar o formulário, e
 * conferir o que já anotou sem voltar de etapa.
 *
 * É só LEITURA do que o formulário já sabe. Nada aqui consulta o servidor nem
 * decide preço: o subtotal é a soma dos totais que o servidor devolveu item a
 * item, a taxa é a cotada (ou a informada), e o total é só a soma dos dois,
 * rotulada como estimativa. Quem vale é o recálculo de `criar_pedido`, ao
 * lançar (CLAUDE.md §16).
 */
export function ResumoDoPedido({
  canal,
  modalidade,
  nome,
  whatsapp,
  clienteCadastrado,
  endereco,
  itens,
  subtotal,
  taxa,
  forma,
  trocoPara,
  pendencias,
}: {
  canal: string;
  modalidade: "delivery" | "pickup";
  nome: string;
  whatsapp: string;
  clienteCadastrado: boolean;
  /** Linha pronta do endereço, ou `null` se ainda não há. */
  endereco: string | null;
  itens: ItemDoRascunho[];
  subtotal: number;
  /** `valor` é `null` quando a taxa ainda não é conhecida. */
  taxa: { texto: string; valor: number | null };
  forma: string | null;
  trocoPara: string | null;
  pendencias: string[];
}) {
  const total = taxa.valor !== null ? subtotal + taxa.valor : null;
  const rotuloDt = "m-0 text-[11.5px] font-bold uppercase tracking-wide text-muted";

  return (
    <aside
      aria-label="Resumo do pedido"
      className="sticky top-0 hidden flex-col gap-3 rounded-16 border border-border-shalon bg-surface p-4 lg:flex"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 font-display text-[16px] font-extrabold text-ink">Resumo</h2>
        <span className="text-[12px] font-semibold text-ink-2">
          {canal} · {modalidade === "delivery" ? "Entrega" : "Retirada"}
        </span>
      </div>

      <div>
        <p className={rotuloDt}>Cliente</p>
        {nome.trim() !== "" ? (
          <p className="m-0 mt-0.5 text-[14px] font-semibold text-ink">
            {nome.trim()}
            {clienteCadastrado ? (
              <span className="ml-1.5 rounded-pill bg-tg px-2 py-[1px] text-[11px] font-semibold text-tgf">
                cadastrado
              </span>
            ) : null}
          </p>
        ) : (
          <p className="m-0 mt-0.5 text-[13.5px] text-muted">Ainda sem nome</p>
        )}
        {whatsapp.trim() !== "" ? <p className="m-0 text-[12.5px] tabular-nums text-ink-2">{whatsapp}</p> : null}
      </div>

      <div>
        <p className={rotuloDt}>{modalidade === "delivery" ? "Entrega em" : "Retirada"}</p>
        <p className={`m-0 mt-0.5 text-[13.5px] ${endereco ? "text-ink" : "text-muted"}`}>
          {modalidade === "pickup" ? "O cliente busca na loja" : (endereco ?? "Endereço ainda não informado")}
        </p>
      </div>

      <div>
        <p className={rotuloDt}>Itens</p>
        {itens.length === 0 ? (
          <p className="m-0 mt-0.5 text-[13.5px] text-muted">Nenhum item ainda</p>
        ) : (
          <ul className="m-0 mt-1 list-none p-0">
            {itens.map((i) => (
              <li key={i.linha} className="flex justify-between gap-3 border-b border-border-shalon py-1.5 last:border-0">
                <span className="min-w-0 text-[13.5px] text-ink">
                  <span className="font-semibold">
                    {i.quantidade}× {i.nome}
                  </span>
                  {i.rotulos.length > 0 ? (
                    <span className="block text-[12px] text-ink-2">{i.rotulos.join(" · ")}</span>
                  ) : null}
                </span>
                <span className="whitespace-nowrap text-[13.5px] tabular-nums text-ink">{formatBRL(i.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border-shalon pt-3">
        <div className="flex justify-between text-[13.5px] text-ink-2">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatBRL(subtotal)}</span>
        </div>
        <div className="flex justify-between gap-3 text-[13.5px] text-ink-2">
          <span>Taxa de entrega</span>
          <span className="text-right text-[13px]">{taxa.texto}</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-[14px] font-bold text-ink">Total estimado</span>
          <span className="font-display text-[20px] font-extrabold tabular-nums text-ink">
            {total !== null ? formatBRL(total) : "—"}
          </span>
        </div>
        {total === null && modalidade === "delivery" ? (
          <p className="m-0 mt-0.5 text-[12px] text-muted">Falta a taxa: complete o endereço.</p>
        ) : null}
      </div>

      {forma !== null ? (
        <div>
          <p className={rotuloDt}>Pagamento</p>
          <p className="m-0 mt-0.5 text-[13.5px] text-ink">
            {forma}
            {trocoPara !== null ? ` · troco para ${trocoPara}` : ""}
          </p>
        </div>
      ) : null}

      {pendencias.length > 0 ? (
        <p className="m-0 rounded-10 bg-tw px-3 py-2 text-[12.5px] text-twf" role="status">
          Falta: {pendencias.join(", ")}.
        </p>
      ) : (
        <p className="m-0 rounded-10 bg-tg px-3 py-2 text-[12.5px] font-semibold text-tgf" role="status">
          Pronto para lançar.
        </p>
      )}

      <p className="m-0 text-[11.5px] leading-snug text-muted">
        Estimativa. Os valores são recalculados no servidor quando o pedido é lançado.
      </p>
    </aside>
  );
}
