import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { Badge } from "@/ui/components";
import {
  listarComponentesDoCombo,
  listarSaboresDaFogazza,
  montarDadosDoConfigurador,
  obterLojaPublica,
  obterProdutoPublico,
  urlDaImagem,
} from "@/application/publico/consultas";
import { AvisoLojaFechada } from "../../_ui/AvisoLojaFechada";
import { BotaoFavorito } from "../../_ui/BotaoFavorito";
import { Compartilhar } from "../../_ui/Compartilhar";
import { Configurador } from "../../_ui/Configurador";
import { EscolherSabor } from "../../_ui/EscolherSabor";

/**
 * Página de produto — RN-LINK-001 e RN-LINK-002.
 *
 * "Link de produto promocional expirado continua abrindo o produto, porém
 * sempre com preço/regra atual." É o que acontece aqui por construção: a
 * página não guarda preço; ela pergunta ao banco a cada visita, e o banco
 * devolve o preço efetivo de agora.
 *
 * Produto estruturalmente INATIVO não abre — o RLS não o entrega e a rota
 * devolve 404. Produto temporariamente indisponível abre, marcado, sem
 * permitir adição (RN-BUSCA-002).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const produto = await obterProdutoPublico(slug);
  if (!produto) return { title: "Produto" };
  return {
    title: produto.nome,
    description: produto.descricao ?? undefined,
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [produto, loja] = await Promise.all([obterProdutoPublico(slug), obterLojaPublica()]);
  if (!produto) notFound();

  // Card de entrada de fogazza (RN-FOG-003): em vez do configurador, a lista
  // de sabores. A fogazza de preço próprio devolve lista vazia e segue como
  // produto simples.
  const pedindoSabores =
    produto.tipo === "fogazza" ? listarSaboresDaFogazza(produto.id) : Promise.resolve([]);

  // Tamanhos, sabores, bordas, adicionais e o primeiro preço vêm prontos da
  // MESMA função que o balcão usa para montar item (complemento da Fase 6).
  // Duplicar esse carregamento criaria duas verdades sobre quais sabores e
  // bordas existem. Só a fogazza espera a lista de sabores para decidir; o
  // resto vai ao banco em paralelo.
  const [saboresDaFogazza, dadosDoConfigurador, componentes] = await Promise.all([
    pedindoSabores,
    produto.tipo === "fogazza"
      ? pedindoSabores.then((s) => (s.length > 0 ? null : montarDadosDoConfigurador(slug)))
      : montarDadosDoConfigurador(slug),
    produto.tipo === "combo" ? listarComponentesDoCombo(produto.id) : Promise.resolve([]),
  ]);
  const ehCardDeFogazza = saboresDaFogazza.length > 0;

  const imagem = produto.imagem_path ? await urlDaImagem(produto.imagem_path) : null;

  return (
    <>
      <AvisoLojaFechada loja={loja} />

      {/* Notebook e computador: a coluna de 560 px do design (a "folha" do
          produto). Esticado nos 1120 px, a foto virava uma faixa cortada e
          o botão atravessava a tela. No celular, nada muda. */}
      <div className="lg:mx-auto lg:max-w-[560px]">

      <div className="px-4 pt-4">
        <Link
          href={`/categoria/${produto.categoria_slug}`}
          className="inline-flex min-h-touch items-center text-[15px] text-ink-2"
        >
          ← {produto.categoria_nome}
        </Link>
      </div>

      <article className="px-4">
        {imagem ? (
          <div className="relative mt-2 h-[170px] w-full overflow-hidden rounded-18 bg-elev">
            <Image
              src={imagem}
              alt={produto.nome}
              fill
              sizes="(max-width: 1023px) 100vw, 560px"
              priority
              className="object-cover"
            />
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="m-0 flex-1 font-display text-[24px] font-extrabold text-ink">
            {produto.nome}
          </h1>
          {produto.destaque ? <Badge tom="destaque">Destaque</Badge> : null}
          {produto.em_promocao ? <Badge tom="promocao">Promoção</Badge> : null}
          {!produto.disponivel ? <Badge tom="indisponivel">Indisponível hoje</Badge> : null}
        </div>

        {produto.descricao ? (
          <p className="mt-[6px] text-[14px] text-ink-2">{produto.descricao}</p>
        ) : null}

        {/* RN-LINK-002: o preço mostrado é sempre o vigente agora. */}
        {produto.preco !== null ? (
          <p className="mt-2 flex items-baseline gap-2">
            {produto.em_promocao && produto.preco_de !== null ? (
              <span className="text-[14px] text-muted line-through">
                {formatBRL(produto.preco_de)}
              </span>
            ) : null}
            <span className="font-display text-[22px] font-extrabold tabular-nums text-ink">
              {produto.preco_max !== null && produto.preco_max !== produto.preco
                ? `a partir de ${formatBRL(produto.preco)}`
                : formatBRL(produto.preco)}
            </span>
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BotaoFavorito produtoId={produto.id} nome={produto.nome} />
          <Compartilhar titulo={produto.nome} caminho={`/produto/${produto.slug}`} />
        </div>

        {/* RN-COMBO-001/002: composição EXATA, só para leitura. O combo da V1
            não é configurador — o cliente não substitui nem escolhe. */}
        {produto.tipo === "combo" && componentes.length > 0 ? (
          <section className="mt-5 rounded-14 border border-border-shalon bg-surface p-4">
            <h2 className="m-0 mb-2 text-[16px] font-bold text-ink">O que vem no combo</h2>
            <ul className="m-0 list-none p-0">
              {componentes.map((c, i) => (
                <li
                  key={`${c.nome}-${i}`}
                  className="border-b border-border-shalon py-2 text-[14px] text-ink last:border-b-0"
                >
                  {c.quantidade}× {c.nome}
                  {c.tamanho ? <span className="text-ink-2"> · {c.tamanho}</span> : null}
                </li>
              ))}
            </ul>
            <p className="m-0 mt-2 text-[12.5px] text-muted">
              Composição fixa: os itens do combo não podem ser trocados nesta versão.
            </p>
          </section>
        ) : null}

        {produto.disponivel && ehCardDeFogazza ? (
          <EscolherSabor cardSlug={produto.slug} sabores={saboresDaFogazza} />
        ) : produto.disponivel && dadosDoConfigurador !== null ? (
          <Configurador dados={dadosDoConfigurador} lojaAberta={loja?.aberta ?? false} />
        ) : (
          <div className="mt-5 rounded-14 border border-dashed border-border-shalon bg-elev px-5 py-8 text-center">
            <p className="m-0 font-semibold text-ink">Indisponível hoje</p>
            <p className="mt-[6px] text-[14px] text-ink-2">
              Este item está fora do cardápio no momento. Você pode salvá-lo nos favoritos e
              voltar depois.
            </p>
            <div className="mt-3 flex justify-center">
              <BotaoFavorito produtoId={produto.id} nome={produto.nome} />
            </div>
          </div>
        )}
      </article>
      </div>
    </>
  );
}
