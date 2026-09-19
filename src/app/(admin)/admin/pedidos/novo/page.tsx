import type { Metadata } from "next";
import Link from "next/link";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { formasDePagamento } from "@/application/checkout/consultas";
import { NovoPedido } from "../_ui/NovoPedido";

export const metadata: Metadata = { title: "Novo pedido" };

/**
 * Lançamento manual de pedido (RN-MAN-001).
 *
 * A checagem de permissão aqui é de INTERFACE: ela evita abrir uma tela que
 * não levaria a nada. A proteção real está em `criar_pedido`, que exige
 * `orders.create_manual` e recusa a chamada direta de quem não a tem —
 * esconder o botão nunca foi segurança (CLAUDE.md §12).
 */
export default async function Page() {
  const sessao = await obterSessaoInterna();
  const autorizado = podeNaUI(sessao, "orders.create_manual");

  const [entrega, retirada] = await Promise.all([
    formasDePagamento("delivery"),
    formasDePagamento("pickup"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/pedidos"
        className="inline-flex min-h-touch items-center text-[14px] text-ink-2 no-underline"
      >
        ← Voltar para a fila
      </Link>

      <header>
        <h1 className="m-0 font-display text-[24px] font-extrabold text-ink">Novo pedido</h1>
        <p className="m-0 text-[13.5px] text-ink-2">
          Para pedidos recebidos por WhatsApp, telefone, balcão, iFood ou outro canal.
        </p>
      </header>

      {autorizado ? (
        <NovoPedido formasPorModalidade={{ delivery: entrega, pickup: retirada }} />
      ) : (
        <div className="rounded-16 border border-tdb bg-td p-4">
          <p className="m-0 text-[15px] font-bold text-tdf">
            Seu acesso não inclui lançar pedidos
          </p>
          <p className="m-0 mt-1 text-[14px] text-ink-2">
            Fale com a Owner se precisar dessa permissão.
          </p>
        </div>
      )}
    </div>
  );
}
