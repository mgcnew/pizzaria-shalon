"use client";

import { useLoja } from "@/ui/publico/useLoja";

/**
 * RN-CART-001: o carrinho vale 24 horas desde a última alteração relevante.
 *
 * Quando o prazo passa, o carrinho é descartado — e o cliente precisa saber
 * disso. Sumir em silêncio faria parecer defeito, e a regra fala em descarte
 * previsível, não invisível.
 *
 * Usa a família tonal de atenção do design, a mesma do aviso de loja fechada.
 */
export function AvisoCarrinhoExpirado() {
  const { expirou, reconhecerExpiracao } = useLoja();
  if (!expirou) return null;

  return (
    <div
      role="status"
      className="mx-4 mt-[14px] flex items-start gap-3 rounded-14 border border-twb bg-tw p-[14px]"
    >
      <span aria-hidden="true" className="text-[18px] leading-tight">
        🕒
      </span>
      <div className="flex-1">
        <p className="m-0 text-[15px] font-semibold text-ink">
          Seu carrinho anterior expirou
        </p>
        <p className="mt-1 text-[14px] text-ink-2">
          Carrinhos valem 24 horas. Preços e promoções mudam, então preferimos recomeçar a cobrar
          um valor que não vale mais.
        </p>
      </div>
      <button
        type="button"
        onClick={reconhecerExpiracao}
        aria-label="Dispensar aviso"
        className="min-h-touch min-w-touch cursor-pointer rounded-10 border-0 bg-transparent text-[18px] text-ink-2"
      >
        ×
      </button>
    </div>
  );
}
