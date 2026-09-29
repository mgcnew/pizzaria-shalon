"use client";

import { useLinkStatus } from "next/link";

/**
 * Indicador de navegação pendente. Vai DENTRO de um `<Link>`.
 *
 * Existe para o intervalo em que o clique já aconteceu e a tela ainda não
 * mudou. Troca de seção quase nunca chega a mostrá-lo: o `loading.tsx` de
 * cada rota entra em poucas dezenas de ms. Onde ele aparece de fato:
 *
 * - aba, filtro e período, que mudam só a query da URL. Nesse caso o Next
 *   mantém a tela anterior até o servidor responder, sem skeleton;
 * - modais abertos por query, como detalhes e comanda do pedido;
 * - rede lenta, quando o pré-carregamento ainda não terminou.
 *
 * Três formas, todas sem deslocar o layout:
 * - `ponto`: bolinha em linha, para itens de menu com espaço à direita;
 * - `traco`: traço na base de pílulas e chips (o Link precisa de `relative`);
 * - `moldura`: contorno sobre botões de ícone (o Link precisa de `relative`).
 */
export function IndicadorDeNavegacao(props: PropsDaMarca) {
  const { pending } = useLinkStatus();
  return <MarcaDeEspera {...props} pendente={pending} />;
}

const FORMAS = {
  ponto: "size-1.5 shrink-0 rounded-full",
  traco: "absolute inset-x-3 bottom-[5px] h-[2px] rounded-pill",
  moldura: "absolute -inset-px rounded-[inherit] border-2",
} as const;

type Forma = keyof typeof FORMAS;

/**
 * Laranja da marca sobre superfície. Sobre o CTA vermelho do administrativo o
 * laranja some, e a marca usa a cor do próprio texto do elemento.
 */
const TONS: Record<"marca" | "texto", Record<Forma, string>> = {
  marca: { ponto: "bg-brand-orange", traco: "bg-brand-orange", moldura: "border-brand-orange" },
  texto: { ponto: "bg-current", traco: "bg-current", moldura: "border-current" },
};

type PropsDaMarca = {
  forma?: Forma;
  /** `texto` quando o elemento está sobre fundo CTA (aba ou chip ativo). */
  tom?: "marca" | "texto";
  /** Ajuste de posição para o contexto; não muda a forma. */
  className?: string;
};

/**
 * A mesma marca, para esperas que não vêm de um `<Link>`: por exemplo o envio
 * de um `next/form`, que navega com `router.push` e fica fora do alcance de
 * `useLinkStatus` e de `useFormStatus`.
 */
export function MarcaDeEspera({
  pendente,
  forma = "ponto",
  tom = "marca",
  className = "",
}: PropsDaMarca & { pendente: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-pendente={pendente ? "" : undefined}
      className={`indicador-navegacao ${FORMAS[forma]} ${TONS[tom][forma]} ${className}`}
    />
  );
}
