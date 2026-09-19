"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { useLoja } from "@/ui/publico/useLoja";

/**
 * Barra de carrinho do rodapé — exatamente como no design: aparece SOMENTE
 * quando há itens, ocupa a largura, 56px de altura, fundo em degradê para o
 * conteúdo não colar, e mostra "Ver carrinho • N itens • subtotal".
 *
 * NÃO é navegação inferior persistente (79.8 proíbe): some quando o carrinho
 * está vazio e some dentro do próprio carrinho.
 *
 * O subtotal exibido é o que foi VISTO ao montar cada item. O valor que vale
 * é recalculado pelo servidor na revalidação (CLAUDE.md §16).
 */
export function BarraCarrinho() {
  const { quantidadeTotal, subtotal } = useLoja();
  const rota = usePathname();

  if (quantidadeTotal === 0) return null;
  if (rota === "/carrinho" || rota === "/checkout") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-bg via-bg/95 to-transparent px-4 pb-4 pt-3">
      <div className="mx-auto max-w-shalon">
        <Link
          href="/carrinho"
          className="flex min-h-[56px] w-full items-center justify-center gap-[10px] rounded-14 bg-cta px-4 text-[17px] font-bold text-cta-fg shadow-cta"
        >
          Ver carrinho • {quantidadeTotal} {quantidadeTotal === 1 ? "item" : "itens"} •{" "}
          {formatBRL(subtotal)}
        </Link>
      </div>
    </div>
  );
}
