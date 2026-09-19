import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { Badge } from "@/ui/components";
import {
  listarAdicionais,
  listarBordas,
  listarComponentesDoCombo,
  listarSabores,
  listarTamanhos,
  obterLojaPublica,
  obterProdutoPublico,
  urlDaImagem,
} from "@/application/publico/consultas";
import { AvisoLojaFechada } from "../../_ui/AvisoLojaFechada";
import { BotaoFavorito } from "../../_ui/BotaoFavorito";
import { Compartilhar } from "../../_ui/Compartilhar";
import { montarItem } from "@/application/publico/acoes";
import { Configurador, type DadosPorTamanho } from "../../_ui/Configurador";

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

  const tamanhos = produto.tem_tamanhos ? await listarTamanhos(produto.id) : [];

  // Bordas, adicionais e sabores dependem do TAMANHO. Carregados de uma vez
  // para os tamanhos existentes (tipicamente dois ou três), o configurador
  // troca entre eles sem ida e volta ao servidor.
  const porTamanho: DadosPorTamanho = {};
  await Promise.all(
    tamanhos.map(async (t) => {
      const [sabores, bordas, adicionais] = await Promise.all([
        t.max_sabores > 1 ? listarSabores(t.tamanho_id) : Promise.resolve([]),
        listarBordas(produto.id, t.tamanho_id),
        produto.adicionais_ligados
          ? listarAdicionais(produto.id, t.tamanho_id)
          : Promise.resolve([]),
      ]);
      porTamanho[t.tamanho_id] = { sabores, bordas, adicionais };
    }),
  );

  const componentes =
    produto.tipo === "combo" ? await listarComponentesDoCombo(produto.id) : [];

  const imagem = produto.imagem_path ? await urlDaImagem(produto.imagem_path) : null;

  // Primeiro preço calculado no servidor: a tela abre já com valor, e o
  // configurador não precisa de efeito de montagem para buscá-lo.
  const primeiroTamanho = tamanhos.find((t) => t.disponivel) ?? null;
  const montadoInicial = produto.disponivel
    ? await montarItem({
        produto_id: produto.id,
        variacao_id: primeiroTamanho?.variacao_id ?? null,
        sabores: primeiroTamanho ? [primeiroTamanho.variacao_id] : [],
        quantidade: 1,
      })
    : { ok: false as const, erro: "Indisponível no momento." };

  return (
    <>
      <AvisoLojaFechada loja={loja} />

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
              sizes="(max-width: 1120px) 100vw, 1120px"
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

        {produto.disponivel ? (
          <Configurador
            produto={produto}
            tamanhos={tamanhos}
            porTamanho={porTamanho}
            lojaAberta={loja?.aberta ?? false}
            montadoInicial={montadoInicial}
          />
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
    </>
  );
}
