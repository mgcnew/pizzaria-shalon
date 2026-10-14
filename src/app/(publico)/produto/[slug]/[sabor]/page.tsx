import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { Badge } from "@/ui/components";
import {
  montarDadosDaFogazza,
  obterLojaPublica,
  urlDaImagem,
} from "@/application/publico/consultas";
import { AvisoLojaFechada } from "../../../_ui/AvisoLojaFechada";
import { Compartilhar } from "../../../_ui/Compartilhar";
import { Configurador } from "../../../_ui/Configurador";

/**
 * Fogazza de um sabor — RN-FOG-002 a RN-FOG-005.
 *
 * O cliente chegou pelo card ("Fogazza salgada") e escolheu o sabor. Esta é
 * a página do produto de sempre, com o configurador de sempre, mas o produto
 * é o SABOR vendido no tamanho de fogazza: tamanho fixo, sem borda, sem meio
 * a meio, com os adicionais pelo preço do tamanho de fogazza. O preço vem do
 * banco a cada visita, como em qualquer produto (RN-LINK-002).
 *
 * O link é compartilhável e é para cá que o "Editar" do carrinho volta.
 *
 * Não há botão de favorito: o favorito guarda um PRODUTO, e o produto aqui é
 * o sabor de pizza — favoritar abriria a pizza, não a fogazza. O card de
 * entrada é que pode ser favoritado.
 */

type Parametros = { params: Promise<{ slug: string; sabor: string }> };

export async function generateMetadata({ params }: Parametros): Promise<Metadata> {
  const { slug, sabor } = await params;
  const dados = await montarDadosDaFogazza(slug, sabor);
  if (!dados) return { title: "Fogazza" };
  return {
    title: `${dados.card.nome} · ${dados.sabor.nome}`,
    description: dados.sabor.descricao ?? undefined,
  };
}

export default async function Page({ params }: Parametros) {
  const { slug, sabor } = await params;

  const [dados, loja] = await Promise.all([montarDadosDaFogazza(slug, sabor), obterLojaPublica()]);
  if (!dados) notFound();

  const { card, produto } = dados;
  // A foto é a do CARD. A do sabor é a foto da pizza, e mostrar uma pizza
  // na página da fogazza venderia uma coisa e entregaria outra.
  const imagem = card.imagem_path ? await urlDaImagem(card.imagem_path) : null;

  return (
    <>
      <AvisoLojaFechada loja={loja} />

      {/* Notebook e computador: a coluna de 560 px do design (a "folha" do
          produto). Esticado nos 1120 px, a foto virava uma faixa cortada e
          o botão atravessava a tela. No celular, nada muda. */}
      <div className="lg:mx-auto lg:max-w-[560px]">

      <div className="px-4 pt-4">
        <Link
          href={`/produto/${card.slug}`}
          className="inline-flex min-h-touch items-center text-[15px] text-ink-2"
        >
          ← {card.nome}
        </Link>
      </div>

      <article className="px-4">
        {imagem ? (
          <div className="relative mt-2 h-[170px] w-full overflow-hidden rounded-18 bg-elev">
            <Image
              src={imagem}
              alt={card.nome}
              fill
              sizes="(max-width: 1023px) 100vw, 560px"
              priority
              className="object-cover"
            />
          </div>
        ) : null}

        <p className="m-0 mt-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          {card.nome}
        </p>
        <div className="mt-[2px] flex flex-wrap items-center gap-2">
          <h1 className="m-0 flex-1 font-display text-[24px] font-extrabold text-ink">
            {produto.nome}
          </h1>
          {produto.em_promocao ? <Badge tom="promocao">Promoção</Badge> : null}
          {!produto.disponivel ? <Badge tom="indisponivel">Indisponível hoje</Badge> : null}
        </div>

        {produto.descricao ? (
          <p className="mt-[6px] text-[14px] text-ink-2">{produto.descricao}</p>
        ) : null}

        <p className="mt-2 flex items-baseline gap-2">
          {produto.em_promocao && produto.preco_de !== null ? (
            <span className="text-[14px] text-muted line-through">
              {formatBRL(produto.preco_de)}
            </span>
          ) : null}
          {produto.preco !== null ? (
            <span className="font-display text-[22px] font-extrabold tabular-nums text-ink">
              {formatBRL(produto.preco)}
            </span>
          ) : null}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Compartilhar
            titulo={`${card.nome} · ${produto.nome}`}
            caminho={`/produto/${card.slug}/${dados.sabor.slug}`}
          />
        </div>

        {produto.disponivel ? (
          <Configurador dados={dados} lojaAberta={loja?.aberta ?? false} />
        ) : (
          <div className="mt-5 rounded-14 border border-dashed border-border-shalon bg-elev px-5 py-8 text-center">
            <p className="m-0 font-semibold text-ink">Indisponível hoje</p>
            <p className="mt-[6px] text-[14px] text-ink-2">
              Esta fogazza está fora do cardápio no momento. Veja os outros sabores.
            </p>
            <div className="mt-3 flex justify-center">
              <Link
                href={`/produto/${card.slug}`}
                className="inline-flex min-h-touch items-center rounded-11 border-[1.5px] border-border-shalon bg-surface px-[14px] text-[14px] font-semibold text-ink"
              >
                Ver sabores
              </Link>
            </div>
          </div>
        )}
      </article>
      </div>
    </>
  );
}
