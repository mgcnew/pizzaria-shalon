import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/ui/patterns";
import {
  buscar,
  listarCardapio,
  listarCategoriasPublicas,
  listarMaisPedidos,
  obterLojaPublica,
} from "@/application/publico/consultas";
import { AvisoLojaFechada } from "./_ui/AvisoLojaFechada";
import { Banners } from "./_ui/Banners";
import { Busca } from "./_ui/Busca";
import { CardProduto } from "./_ui/CardProduto";
import { ChipsCategorias } from "./_ui/ChipsCategorias";
import { Secao } from "./_ui/Secao";

export const metadata: Metadata = {
  title: "Cardápio",
  description:
    "Massa fresca todos os dias, assada na hora e entregue quentinha na sua casa.",
};

/**
 * Cardápio público — a home do design aprovado.
 *
 * Ordem preservada do protótipo: aviso de loja fechada, busca, hero,
 * categorias horizontais, seções e cardápio agrupado por categoria.
 *
 * O QUE MUDOU, e por quê:
 *
 *  · "Mais pedidos" agora é renderizado — e SÓ quando há base. O ranking
 *    vem de `mais_pedidos` (RN-POP-001 a 004): 30 dias móveis, pedidos
 *    concluídos, por quantidade, meio a meio contando a fração de cada
 *    sabor. Sem pedidos concluídos, a lista volta vazia e a seção não
 *    aparece — em vez de inventar ranking a partir do destaque manual, que
 *    é outra coisa (RN-DEST-001);
 *
 *  · a faixa fixa de promoção do protótipo ("Quatro Queijos com 15% off")
 *    virou uma seção alimentada pelas promoções vigentes de verdade. Se não
 *    houver nenhuma, a seção some — em vez de anunciar uma oferta que não
 *    existe;
 *
 *  · a busca é do servidor e o termo viaja na URL, então o resultado é
 *    compartilhável e o cardápio inteiro não vai para o navegador.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const termo = typeof params["q"] === "string" ? params["q"] : "";

  const [loja, categorias, cardapio] = await Promise.all([
    obterLojaPublica(),
    listarCategoriasPublicas(),
    listarCardapio(),
  ]);

  // Catálogo ainda vazio: estado próprio, não uma tela quebrada.
  if (cardapio.length === 0 && termo === "") {
    return (
      <>
        <AvisoLojaFechada loja={loja} />
        <div className="px-4 pt-6">
          <EmptyState
            titulo="Cardápio em preparo"
            descricao="A Shalon ainda está montando o cardápio por aqui. Volte em instantes."
          />
        </div>
      </>
    );
  }

  if (termo !== "") {
    const resultados = await buscar(termo);
    return (
      <>
        <AvisoLojaFechada loja={loja} />
        <Busca termo={termo} />
        <section className="px-4 pt-5">
          {/* Com zero resultados o título sai de cena: quem dá a notícia é o
              estado vazio do design, e repetir a frase duas vezes seria ruído. */}
          {resultados.length > 0 ? (
            <h1 className="m-0 pb-3 font-display text-[19px] font-bold text-ink">
              {resultados.length} {resultados.length === 1 ? "resultado" : "resultados"} para
              {" "}“{termo}”
            </h1>
          ) : null}

          {resultados.length === 0 ? (
            <EmptyState
              titulo={`Não encontramos “${termo}”`}
              descricao="Tente outro sabor, combo ou categoria."
              acao={
                <Link
                  href="/"
                  className="inline-flex min-h-touch-cta items-center rounded-12 border-[1.5px] border-border-shalon px-[18px] text-[15px] font-semibold text-ink"
                >
                  Ver cardápio completo
                </Link>
              }
            />
          ) : (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
              {resultados.map((p) => (
                <CardProduto key={p.id} produto={p} />
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  // RN-POP: o ranking é do servidor. Lista vazia é resposta legítima e
  // significa "ainda não há base", não "falhou".
  const maisPedidos = await listarMaisPedidos();

  const destaques = cardapio.filter((p) => p.destaque && p.disponivel);
  const emPromocao = cardapio.filter((p) => p.em_promocao && p.disponivel);
  const combos = cardapio.filter((p) => p.tipo === "combo");

  const porCategoria = categorias
    .map((c) => ({ categoria: c, itens: cardapio.filter((p) => p.categoria_id === c.id) }))
    .filter((g) => g.itens.length > 0);

  return (
    <>
      <AvisoLojaFechada loja={loja} />
      <Busca termo="" />

      {/* Hero do design: fundo #2A201A, selo "Tradição desde 1995",
          título em Bricolage Grotesque e CTA no par CTA. */}
      <section className="mx-4 mt-4 flex flex-wrap items-center gap-[18px] rounded-20 bg-sidebar p-5">
        <div className="min-w-[200px] flex-[1_1_220px]">
          <span className="inline-block rounded-pill bg-brand-yellow/15 px-[10px] py-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-brand-yellow">
            Tradição desde 1995
          </span>
          <h1 className="mb-[6px] mt-[10px] text-balance font-display text-[30px] font-extrabold leading-[1.08] text-[#FFF7E8]">
            {loja?.nome_exibicao ?? loja?.nome ?? "Pizzaria Shalon"}
          </h1>
          <p className="m-0 mb-4 max-w-[34ch] text-[15px] text-[#D9C9B2]">
            Massa fresca todos os dias, assada na hora e entregue quentinha na sua casa.
          </p>
          {combos.length > 0 ? (
            <Link
              href="#combos"
              className="inline-flex min-h-touch-cta items-center rounded-12 bg-cta px-5 text-[16px] font-semibold text-cta-fg"
            >
              Ver combos
            </Link>
          ) : null}
        </div>
      </section>

      <Banners />

      <div className="pt-4">
        <ChipsCategorias categorias={categorias} />
      </div>

      {destaques.length > 0 ? (
        <Secao titulo="Recomendados pela Shalon" legenda="Escolha da casa">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
            {destaques.map((p) => (
              <CardProduto key={p.id} produto={p} />
            ))}
          </div>
        </Secao>
      ) : null}

      {maisPedidos.length > 0 ? (
        <Secao titulo="Mais pedidos" legenda="Últimos 30 dias">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
            {maisPedidos.map((p) => (
              <CardProduto key={p.id} produto={p} />
            ))}
          </div>
        </Secao>
      ) : null}

      {emPromocao.length > 0 ? (
        <Secao titulo="Promoções" legenda="Enquanto durar">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
            {emPromocao.map((p) => (
              <CardProduto key={p.id} produto={p} />
            ))}
          </div>
        </Secao>
      ) : null}

      {combos.length > 0 ? (
        <div id="combos">
          <Secao titulo="Combos para compartilhar">
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
              {combos.map((p) => (
                <CardProduto key={p.id} produto={p} />
              ))}
            </div>
          </Secao>
        </div>
      ) : null}

      <Secao titulo="Cardápio" legenda={`${cardapio.length} ${cardapio.length === 1 ? "item" : "itens"}`}>
        {porCategoria.map(({ categoria, itens }) => (
          <div key={categoria.id} className="mb-[22px]">
            <h3 className="m-0 mb-[10px] text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
              {categoria.nome}
              {categoria.pausada ? " · pausada hoje" : ""}
            </h3>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
              {itens.map((p) => (
                <CardProduto key={p.id} produto={p} />
              ))}
            </div>
          </div>
        ))}
      </Secao>
    </>
  );
}
