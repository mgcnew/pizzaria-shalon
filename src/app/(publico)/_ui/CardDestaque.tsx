import Image from "next/image";
import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { Badge } from "@/ui/components";
import { urlDaImagem } from "@/application/publico/consultas";
import type { ProdutoPublico, ResultadoBusca } from "@/application/publico/tipos";
import { BotaoFavorito } from "./BotaoFavorito";

/**
 * Card vertical de destaque — foto grande em cima, texto embaixo.
 *
 * POR QUE ELE EXISTE, e onde NÃO é usado.
 *
 * Foto vende comida; miniatura de 84px apenas identifica. Nas seções de
 * vitrine — Recomendados, Mais pedidos, Promoções e Combos — o que a pessoa
 * está fazendo é ESCOLHER, e aí a imagem grande trabalha a favor.
 *
 * No cardápio completo, não. Lá a pessoa está PROCURANDO, e o que diferencia
 * mussarela de calabresa é o texto, não a foto. O card horizontal
 * (`CardProduto`) mostra 6 a 8 itens por tela no celular; este mostra 2 a 4.
 * Trocar a lista inteira por cards grandes cobraria muito rolar para entregar
 * pouca informação nova (D-2026-09-21-56).
 *
 * O CTA CONTINUA SENDO "Escolher", e não um "+" como em aplicativos de
 * marketplace. Aqui o botão não adiciona ao carrinho: ele abre a
 * configuração, porque pizza tem tamanho, sabores e borda. Um "+" prometeria
 * uma adição direta que não acontece.
 */

type Item = ProdutoPublico | ResultadoBusca;

function precoFaixa(p: Item): string {
  if (p.preco === null) return "Sob consulta";
  const max = "preco_max" in p ? p.preco_max : null;
  if (max !== null && max !== p.preco) return `a partir de ${formatBRL(p.preco)}`;
  return formatBRL(p.preco);
}

export async function CardDestaque({ produto }: { produto: Item }) {
  const destaque = "destaque" in produto ? produto.destaque : false;
  const imagem = produto.imagem_path ? await urlDaImagem(produto.imagem_path) : null;

  return (
    <article
      className={[
        "flex flex-col overflow-hidden rounded-16 border border-border-shalon bg-surface",
        produto.disponivel ? "" : "opacity-60",
      ].join(" ")}
    >
      <div className="relative aspect-[4/3] w-full bg-elev">
        {imagem ? (
          <Image
            src={imagem}
            alt={produto.nome}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
        ) : (
          // SEM FOTO, o card grande é implacável: o vazio passa a ter o
          // tamanho da imagem. Então o espaço não fica vazio — fica com a
          // tinta da marca e o símbolo em escala, para ler como decisão e não
          // como imagem quebrada. É paliativo: a solução é a foto
          // (RN-PROD-003).
          <span
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center bg-gradient-to-br from-tn to-elev text-[52px] opacity-60"
          >
            🍕
          </span>
        )}

        {/* Selos sobre a foto, como no card horizontal — mesma linguagem. */}
        <div className="absolute left-2 top-2 flex flex-wrap gap-[6px]">
          {destaque ? <Badge tom="destaque">Destaque</Badge> : null}
          {produto.em_promocao ? <Badge tom="promocao">Promoção</Badge> : null}
          {!produto.disponivel ? <Badge tom="indisponivel">Indisponível hoje</Badge> : null}
        </div>

        <div className="absolute right-2 top-2">
          <BotaoFavorito produtoId={produto.id} nome={produto.nome} compacto />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <h3 className="m-0 text-[15px] font-semibold leading-[1.25] text-ink">
          {produto.nome}
        </h3>

        {produto.descricao ? (
          <p className="m-0 line-clamp-2 text-[12.5px] leading-[1.4] text-ink-2">
            {produto.descricao}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-baseline gap-2 pt-2">
          {produto.em_promocao && produto.preco_de !== null ? (
            <span className="text-[12.5px] text-muted line-through">
              {formatBRL(produto.preco_de)}
            </span>
          ) : null}
          <span className="text-[16px] font-bold tabular-nums text-ink">
            {precoFaixa(produto)}
          </span>
        </div>

        {produto.disponivel ? (
          <Link
            href={`/produto/${produto.slug}`}
            className="mt-2 inline-flex min-h-touch items-center justify-center rounded-11 bg-cta px-[14px] text-[14px] font-semibold text-cta-fg no-underline"
          >
            Escolher
          </Link>
        ) : (
          // RN-BUSCA-002: continua visível, sem possibilidade de adição.
          <span
            aria-disabled="true"
            className="mt-2 inline-flex min-h-touch cursor-not-allowed items-center justify-center rounded-11 border-[1.5px] border-border-shalon bg-elev px-[14px] text-[14px] font-semibold text-muted"
          >
            Indisponível
          </span>
        )}
      </div>
    </article>
  );
}
