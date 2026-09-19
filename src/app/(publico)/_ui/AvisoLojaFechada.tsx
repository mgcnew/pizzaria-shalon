import type { LojaPublica } from "@/application/publico/tipos";

/**
 * RN-LOJA-002 e RN-LOJA-003: loja fechada NÃO esconde o cardápio. O cliente
 * navega normalmente; o que fica bloqueado é enviar o pedido.
 *
 * O texto é o do design aprovado, acrescido do motivo quando o fechamento é
 * manual — informação que o protótipo não tinha porque ali não havia
 * fechamento temporário de verdade.
 */
export function AvisoLojaFechada({ loja }: { loja: LojaPublica | null }) {
  if (loja?.aberta) return null;

  // Loja ainda não configurada também não recebe pedido. Dizer isso é mais
  // honesto que não dizer nada e deixar o cliente descobrir no checkout.
  if (!loja) {
    return (
      <div className="mx-4 mt-[14px] flex items-start gap-3 rounded-14 border border-twb bg-tw p-[14px]">
        <span aria-hidden="true" className="text-[18px] leading-tight">
          🕒
        </span>
        <div>
          <p className="m-0 text-[15px] font-semibold text-ink">
            Ainda não estamos recebendo pedidos por aqui.
          </p>
          <p className="mt-1 text-[14px] text-ink-2">
            O cardápio já pode ser consultado. O envio de pedidos será liberado em breve.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-[14px] flex items-start gap-3 rounded-14 border border-twb bg-tw p-[14px]">
      <span aria-hidden="true" className="text-[18px] leading-tight">
        🕒
      </span>
      <div>
        <p className="m-0 text-[15px] font-semibold text-ink">
          Estamos fechados no momento.
        </p>
        <p className="mt-1 text-[14px] text-ink-2">
          Você pode ver todo o cardápio e montar seu carrinho, mas o envio do pedido está
          indisponível até reabrirmos.
        </p>
        {loja.fechada_temporariamente && loja.motivo_fechamento ? (
          <p className="mt-1 text-[13.5px] font-semibold text-twf">
            {loja.motivo_fechamento}
          </p>
        ) : null}
      </div>
    </div>
  );
}
