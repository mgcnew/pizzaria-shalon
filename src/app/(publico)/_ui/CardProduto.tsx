import Image from "next/image";
import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { Badge } from "@/ui/components";
import { urlDaImagem } from "@/application/publico/consultas";
import type { ProdutoPublico, ResultadoBusca } from "@/application/publico/tipos";
import { BotaoFavorito } from "./BotaoFavorito";

/**
 * Card de produto — vertical, com foto grande no topo.
 *
 * É o ÚNICO card do cardápio público: vitrines, cardápio completo, categoria
 * e busca usam este mesmo componente. Duas versões do mesmo cartão
 * produziriam duas formas de mostrar a mesma pizza, e a primeira diferença
 * entre elas viraria bug de design.
 *
 * MUDOU EM 21/09/2026 (D-2026-09-21-56, revisada). O design aprovado trazia
 * um card horizontal — foto de 84px à esquerda, texto à direita. A Shalon
 * pediu o formato de vitrine, com foto grande, e depois de ver os dois lado a
 * lado manteve a decisão para o cardápio inteiro.
 *
 * SÃO TRÊS POR LINHA NO CELULAR, como na referência. Isso deixa o cartão com
 * cerca de 105px, e é daí que vêm as medidas menores em telas estreitas: o
 * texto encolhe, o preço se quebra em prefixo e valor, e os selos que não
 * caberiam saem. O que NÃO encolhe é o alvo de toque do CTA, que continua em
 * 44px (CLAUDE.md §38).
 *
 * O CTA CONTINUA SENDO "Escolher", e não um "+" como em aplicativos de
 * marketplace. Aqui o botão não adiciona ao carrinho: ele abre a
 * configuração, porque pizza tem tamanho, sabores e borda. Um "+" prometeria
 * uma adição direta que não acontece.
 *
 * DIFERENÇAS QUE VÊM DO PROTÓTIPO e continuam valendo:
 *  · o selo "Popular" virou "Destaque". São conceitos diferentes: RN-DEST-001
 *    é escolha manual da Shalon, e "Mais pedidos" (RN-POP-001) depende de
 *    pedidos concluídos;
 *  · o CTA abre uma ROTA, não um sheet: RN-LINK-001 exige link
 *    compartilhável para produto e combo;
 *  · há botão de favorito, que o protótipo não tinha (A-06).
 */

type Item = ProdutoPublico | ResultadoBusca;

/**
 * O preço em duas partes.
 *
 * Com três cards por linha o cartão tem cerca de 105px no celular, e
 * "a partir de R$ 31,00" numa linha só quebraria em lugar feio. O prefixo vira
 * uma linha pequena acima do valor — que continua sendo o que salta aos olhos.
 */
function preco(p: Item): { prefixo: string | null; valor: string } {
  if (p.preco === null) return { prefixo: null, valor: "Sob consulta" };
  const max = "preco_max" in p ? p.preco_max : null;
  if (max !== null && max !== p.preco) {
    return { prefixo: "a partir de", valor: formatBRL(p.preco) };
  }
  return { prefixo: null, valor: formatBRL(p.preco) };
}

export async function CardProduto({ produto }: { produto: Item }) {
  const destaque = "destaque" in produto ? produto.destaque : false;
  const imagem = produto.imagem_path ? await urlDaImagem(produto.imagem_path) : null;
  const { prefixo, valor } = preco(produto);

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
          // tamanho da imagem. Então o espaço fica com a tinta da marca e o
          // símbolo em escala, para ler como decisão e não como imagem
          // quebrada. É paliativo — a solução é a foto (RN-PROD-003).
          <span
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center bg-gradient-to-br from-tn to-elev text-[52px] opacity-60"
          >
            🍕
          </span>
        )}

        {/* Só os selos que cabem em 105px. "Indisponível" não entra aqui
            porque já é dito duas vezes: o cartão inteiro perde opacidade e o
            botão troca de texto (§38 — nunca só a cor). */}
        <div className="absolute left-[6px] top-[6px] flex flex-wrap gap-[4px]">
          {destaque ? <Badge tom="destaque">Destaque</Badge> : null}
          {produto.em_promocao ? <Badge tom="promocao">Promoção</Badge> : null}
        </div>

        <div className="absolute right-[6px] top-[6px]">
          <BotaoFavorito produtoId={produto.id} nome={produto.nome} compacto />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-[3px] p-2 sm:p-3">
        <h3 className="m-0 line-clamp-2 text-[13px] font-semibold leading-[1.25] text-ink sm:text-[15px]">
          {produto.nome}
        </h3>

        {produto.descricao ? (
          <p className="m-0 line-clamp-2 text-[11px] leading-[1.35] text-ink-2 sm:text-[12.5px]">
            {produto.descricao}
          </p>
        ) : null}

        <div className="mt-auto pt-[6px]">
          {produto.em_promocao && produto.preco_de !== null ? (
            <span className="block text-[11px] text-muted line-through sm:text-[12.5px]">
              {formatBRL(produto.preco_de)}
            </span>
          ) : prefixo !== null ? (
            <span className="block text-[10.5px] leading-none text-muted sm:text-[12px]">
              {prefixo}
            </span>
          ) : null}
          <span className="block text-[13.5px] font-bold tabular-nums text-ink sm:text-[16px]">
            {valor}
          </span>
        </div>

        {produto.disponivel ? (
          <Link
            href={`/produto/${produto.slug}`}
            className="mt-2 inline-flex min-h-touch items-center justify-center rounded-11 bg-cta px-2 text-[13px] font-semibold text-cta-fg no-underline sm:px-[14px] sm:text-[14px]"
          >
            Escolher
          </Link>
        ) : (
          // RN-BUSCA-002: continua visível, sem possibilidade de adição.
          <span
            aria-disabled="true"
            className="mt-2 inline-flex min-h-touch cursor-not-allowed items-center justify-center rounded-11 border-[1.5px] border-border-shalon bg-elev px-2 text-[13px] font-semibold text-muted sm:px-[14px] sm:text-[14px]"
          >
            Indisponível
          </span>
        )}
      </div>
    </article>
  );
}
