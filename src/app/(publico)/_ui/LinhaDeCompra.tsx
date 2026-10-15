"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { adicionarRapido } from "@/application/publico/acoes";
import { anunciarAdicionado } from "@/ui/publico/avisoAdicionado";
import { useLoja } from "@/ui/publico/useLoja";

/**
 * Linha de preço + "+" do card — D-2026-09-28-85.
 *
 * O "+" fica NA MESMA LINHA do valor, alinhado pela base. Em cards estreitos
 * (três por linha no celular), se valor e botão não couberem lado a lado, o
 * botão desce para a direita em vez de espremer o preço.
 *
 * Dois modos:
 *  · `configurar` — pizza, combo e tudo que tem tamanho: o "+" é um link para
 *    a página do produto, como antes (RN-LINK-001);
 *  · `rapido` — produto sem escolhas (um refrigerante): o "+" pede o preço ao
 *    servidor e põe o item direto no carrinho. Se o servidor disser que agora
 *    há escolhas, abre a página do produto.
 *
 * O círculo visível tem 28px no celular (40px a partir de `sm`) para caber ao
 * lado do preço, mas o alvo de toque continua com 44px (CLAUDE.md §38): a
 * margem negativa devolve a diferença.
 */
export function LinhaDeCompra({
  slug,
  nome,
  modo,
  children,
}: {
  slug: string;
  nome: string;
  modo: "configurar" | "rapido";
  /** O preço, já formatado pelo card. */
  children: ReactNode;
}) {
  const router = useRouter();
  const { adicionar, itens } = useLoja();
  const [adicionando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const rotulo = modo === "rapido" ? `Adicionar ${nome} ao carrinho` : `Escolher ${nome}`;
  const alvo =
    "motion-interactive -m-2 inline-flex sm:-m-[2px] min-h-touch min-w-touch shrink-0 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 no-underline";
  const circulo = (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 items-center justify-center rounded-pill bg-cta text-[20px] font-semibold leading-none text-cta-fg shadow-cta sm:h-10 sm:w-10 sm:text-[25px]"
    >
      {adicionando ? (
        <span className="h-4 w-4 animate-shalon-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        "+"
      )}
    </span>
  );

  function adicionarAgora() {
    setErro(null);
    iniciar(async () => {
      const r = await adicionarRapido(slug);

      if (r.tipo === "configurar") {
        router.push(`/produto/${r.slug}`);
        return;
      }
      if (r.tipo === "erro") {
        setErro(r.erro);
        return;
      }

      // Mesma linha que o domínio agruparia: produto sem nenhuma escolha. Se
      // ela já está no limite por pedido, somar calaria o excesso — então se
      // avisa em vez de dizer "adicionado".
      const existente = itens.find(
        (i) =>
          i.produtoId === r.produtoId &&
          i.variacaoId === null &&
          i.sabores.length === 0 &&
          i.bordaId === null &&
          i.adicionais.length === 0 &&
          i.observacao === "",
      );
      if (r.item.limite !== null && (existente?.quantidade ?? 0) >= r.item.limite) {
        setErro(`Limite de ${r.item.limite} por pedido.`);
        return;
      }

      adicionar({
        produtoId: r.produtoId,
        produtoSlug: r.slug,
        nome: r.item.nome,
        variacaoId: null,
        sabores: [],
        bordaId: null,
        adicionais: [],
        observacao: "",
        quantidade: 1,
        // O preço é o que o SERVIDOR calculou.
        precoUnitario: r.item.preco_unitario,
        rotulos: r.item.rotulos,
        limite: r.item.limite,
      });
      anunciarAdicionado(r.item.nome, "cardapio", "rapido");
    });
  }

  return (
    <div className="@container mt-auto pt-[6px]">
      <div className="flex flex-wrap items-end justify-between gap-x-[2px] gap-y-2">
        <div className="min-w-0">{children}</div>
        {/* O invólucro recebe o `ml-auto` (para o botão quebrado continuar à
            direita); o botão fica com a margem negativa que devolve o alvo. */}
        <div className="ml-auto flex">
          {modo === "rapido" ? (
            <button
              type="button"
              onClick={adicionarAgora}
              disabled={adicionando}
              aria-label={rotulo}
              title={rotulo}
              aria-busy={adicionando}
              className={`${alvo} disabled:cursor-wait`}
            >
              {circulo}
            </button>
          ) : (
            <Link href={`/produto/${slug}`} aria-label={rotulo} title={rotulo} className={alvo}>
              {circulo}
            </Link>
          )}
        </div>
      </div>
      {erro ? (
        <p
          role="alert"
          className="m-0 mt-1 text-[11px] font-semibold leading-[1.3] text-tdf sm:text-[12px]"
        >
          {erro}
        </p>
      ) : null}
    </div>
  );
}
