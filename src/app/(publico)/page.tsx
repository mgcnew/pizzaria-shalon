import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/ui/patterns";
import {
  buscar,
  listarCardapio,
  listarCategoriasPublicas,
  listarCampanhasEmPromocao,
  listarMaisPedidos,
  obterLojaPublica,
} from "@/application/publico/consultas";
import { AvisoLojaFechada } from "./_ui/AvisoLojaFechada";
import { Banners } from "./_ui/Banners";
import { Busca } from "./_ui/Busca";
import { CardProduto } from "./_ui/CardProduto";
import { ChipsCategorias } from "./_ui/ChipsCategorias";
import { CarrosselDeCards } from "./_ui/CarrosselDeCards";
import { Secao } from "./_ui/Secao";
import { SecaoDeCampanha } from "./_ui/SecaoDeCampanha";

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

  // "Mais pedidos" começa junto com o resto (D-2026-09-29-96). Esperava as
  // outras três para só então ir ao banco, somando uma ida inteira a cada
  // abertura do cardápio. Na busca ele não é usado, e nem é pedido.
  const [loja, categorias, cardapio, maisPedidos, campanhas] = await Promise.all([
    obterLojaPublica(),
    listarCategoriasPublicas(),
    listarCardapio(),
    termo === "" ? listarMaisPedidos(5) : Promise.resolve([]),
    termo === "" ? listarCampanhasEmPromocao() : Promise.resolve([]),
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
            <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
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

  const destaques = cardapio.filter((p) => p.destaque && p.disponivel);
  const emPromocao = cardapio.filter((p) => p.em_promocao && p.disponivel);
  const combos = cardapio.filter((p) => p.tipo === "combo");

  // Cada campanha com os seus itens disponíveis, do que mais economiza ao que
  // menos. A diferença vem do servidor (`preco_de` e `preco` já calculados).
  const economia = (p: (typeof cardapio)[number]) => (p.preco_de ?? p.preco ?? 0) - (p.preco ?? 0);
  const campanhasComItens = campanhas
    .map((campanha) => {
      const ids = new Set(campanha.produtos);
      const itens = emPromocao
        .filter((p) => ids.has(p.id))
        .sort((a, b) => economia(b) - economia(a));
      return { campanha, itens };
    })
    .filter((c) => c.itens.length > 0);
  // Campanha oculta da vitrine continua valendo (preço e carrinho), só não ganha
  // faixa: os itens dela não caem na seção simples e o banner leva a ela.
  const jaNaCampanha = new Set(campanhasComItens.flatMap((c) => c.itens.map((p) => p.id)));
  const campanhasNaVitrine = campanhasComItens.filter((c) => c.campanha.na_vitrine);
  const promocoesSoltas = emPromocao.filter((p) => !jaNaCampanha.has(p.id));

  const porCategoria = categorias
    .map((c) => ({ categoria: c, itens: cardapio.filter((p) => p.categoria_id === c.id) }))
    .filter((g) => g.itens.length > 0);

  return (
    <>
      {/*
        O h1 da página não pode morar no carrossel.

        Antes da Fase 10 o único h1 do cardápio era o título do banner, que é
        opcional e gira com o slide: em 320, 768 e desktop a página abria com
        ZERO h1 e a hierarquia começava em h2. Quem navega por cabeçalhos
        perdia a âncora principal, e ela mudava sozinha a cada rotação.

        Visualmente oculto porque a identidade já está no logo do cabeçalho —
        acrescentar um título visível seria redesenhar, não corrigir.
      */}
      <h1 className="sr-only">
        Cardápio da {loja?.nome_exibicao ?? loja?.nome ?? "Pizzaria Shalon"}
      </h1>

      <AvisoLojaFechada loja={loja} />
      <Busca termo="" />

      <Banners
        nomeLoja={loja?.nome_exibicao ?? loja?.nome ?? "Pizzaria Shalon"}
        combos={combos}
      />

      <div className="pt-4">
        <ChipsCategorias categorias={categorias} />
      </div>

      {destaques.length > 0 ? (
        <Secao titulo="Recomendados pela Shalon" legenda="Escolha da casa">
          <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
            {destaques.map((p) => (
              <CardProduto key={p.id} produto={p} />
            ))}
          </div>
        </Secao>
      ) : null}

      {maisPedidos.length > 0 ? (
        <Secao titulo="Mais pedidos" legenda="Últimos 30 dias">
          {/* Sempre em fileira rolável, no máximo 5 itens (15/10/2026). */}
          <CarrosselDeCards rotulo="Mais pedidos">
            {maisPedidos.slice(0, 5).map((p) => (
              <CardProduto key={p.id} produto={p} />
            ))}
          </CarrosselDeCards>
        </Secao>
      ) : null}

      {/*
        Uma faixa por campanha vigente, com o nome, os dias, até quando e o
        preço comum (D-2026-10-15-133). Os itens são os da campanha que estão
        disponíveis, na ordem de quem mais economiza. O que está em promoção
        mas não pertence a nenhuma campanha conhecida cai na seção simples.
      */}
      {campanhasNaVitrine.map(({ campanha, itens }) => (
        <SecaoDeCampanha key={campanha.campanha_id} campanha={campanha} quantidade={itens.length}>
          {itens.length > 5 ? (
            <CarrosselDeCards rotulo={campanha.nome}>
              {itens.map((p) => (
                <CardProduto key={p.id} produto={p} semSeloDePromocao />
              ))}
            </CarrosselDeCards>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
              {itens.map((p) => (
                <CardProduto key={p.id} produto={p} semSeloDePromocao />
              ))}
            </div>
          )}
        </SecaoDeCampanha>
      ))}

      {promocoesSoltas.length > 0 ? (
        <Secao titulo="Promoções" legenda="Enquanto durar">
          {promocoesSoltas.length > 5 ? (
            <CarrosselDeCards rotulo="Promoções">
              {promocoesSoltas.map((p) => (
                <CardProduto key={p.id} produto={p} />
              ))}
            </CarrosselDeCards>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
              {promocoesSoltas.map((p) => (
                <CardProduto key={p.id} produto={p} />
              ))}
            </div>
          )}
        </Secao>
      ) : null}

      <Secao titulo="Cardápio" legenda={`${cardapio.length} ${cardapio.length === 1 ? "item" : "itens"}`}>
        {porCategoria.map(({ categoria, itens }) => (
          <div key={categoria.id} className="mb-[22px]">
            <h3 className="m-0 mb-[10px] text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
              {categoria.nome}
              {categoria.pausada ? " · pausada hoje" : ""}
            </h3>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
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
