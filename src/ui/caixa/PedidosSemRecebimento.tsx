import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { rotuloInterno } from "@/domain/pedidos/estados";
import type { PedidoSemRecebimento } from "@/domain/caixa/relatorioDeFechamento";

/**
 * Pedidos do turno sem recebimento no caixa (D-2026-10-27-169).
 *
 * Eles já contam no "Vendido na sessão", mas o dinheiro deles não está em
 * nenhum fechamento. O caso típico é a entrega concluída fora de uma saída do
 * motoboy, ou o dinheiro registrado com "entrou na gaveta" desmarcado.
 * Cada linha leva ao pedido, onde se registra o recebimento.
 */
export function PedidosSemRecebimento({
  pedidos,
  antesDeFechar = false,
}: {
  pedidos: PedidoSemRecebimento[];
  /** Na prévia do fechamento: o texto pede para receber antes de contar. */
  antesDeFechar?: boolean;
}) {
  if (pedidos.length === 0) return null;
  const um = pedidos.length === 1;

  return (
    <div className="rounded-12 border-[1.5px] border-twb bg-tw p-3 text-twf print:rounded-none print:border-x-0 print:bg-white print:text-black">
      <p className="m-0 text-[13px] font-bold">
        {um ? "1 pedido do turno sem recebimento no caixa" : `${pedidos.length} pedidos do turno sem recebimento no caixa`}
      </p>
      <p className="m-0 mt-1 text-[12.5px] leading-snug">
        {antesDeFechar
          ? "Eles contam nas pizzas vendidas, mas o valor não entra no caixa. Registre o recebimento antes de fechar."
          : "Eles contam nas pizzas vendidas, mas o valor não entrou neste caixa."}
      </p>
      <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
        {pedidos.map((p) => {
          const situacao = p.fiado
            ? "fiado"
            : p.pago_fora_do_caixa
              ? "pago fora do caixa"
              : rotuloInterno(p.status).rotulo.toLowerCase();
          return (
            <li key={p.pedido_id}>
              <Link
                href={`/admin/pedidos/${p.pedido_id}`}
                className="flex min-h-[36px] items-center justify-between gap-3 rounded-10 px-1 text-[13px] text-twf underline-offset-2 hover:underline print:text-black"
              >
                <span className="min-w-0">
                  <strong>#{p.numero}</strong>
                  {p.cliente ? ` · ${p.cliente}` : ""}
                  {` · ${p.modalidade === "delivery" ? "entrega" : "retirada"} · ${situacao}`}
                </span>
                <span className="shrink-0 tabular-nums">{formatBRL(p.total)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
