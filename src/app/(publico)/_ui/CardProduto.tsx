import Image from "next/image";
import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { Badge } from "@/ui/components";
import { urlDaImagem } from "@/application/publico/consultas";
import type { ProdutoPublico, ResultadoBusca } from "@/application/publico/tipos";
import { BotaoFavorito } from "./BotaoFavorito";

/**
 * Card de produto — o do design aprovado: foto 84px à esquerda com raio 12,
 * nome, selos, descrição, preço tabular e CTA de 44px à direita. Item
 * indisponível fica com opacidade reduzida e botão desabilitado.
 *
 * DIFERENÇAS, e o motivo:
 *  · o selo "Popular" do protótipo virou "Destaque". São conceitos
 *    diferentes: RN-DEST-001 é escolha manual da Shalon, e "Mais pedidos"
 *    (RN-POP-001) depende de pedidos concluídos, que ainda não existem
 *    (A-16). Exibir "Popular" com base em destaque manual seria dizer ao
 *    cliente algo que não é verdade;
 *  · o CTA abre uma ROTA, não um sheet: RN-LINK-001 exige link
 *    compartilhável para produto e combo;
 *  · há botão de favorito, que o protótipo não tinha (A-06).
 */

type Item = ProdutoPublico | ResultadoBusca;

function precoFaixa(p: Item): string {
  if (p.preco === null) return "Sob consulta";
  const max = "preco_max" in p ? p.preco_max : null;
  if (max !== null && max !== p.preco) return `a partir de ${formatBRL(p.preco)}`;
  return formatBRL(p.preco);
}

export async function CardProduto({ produto }: { produto: Item }) {
  const destaque = "destaque" in produto ? produto.destaque : false;
  const imagem = produto.imagem_path ? await urlDaImagem(produto.imagem_path) : null;

  return (
    <article
      className={[
        "flex gap-3 rounded-16 border border-border-shalon bg-surface p-3",
        produto.disponivel ? "" : "opacity-60",
      ].join(" ")}
    >
      <div className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-12 bg-elev">
        {imagem ? (
          <Image
            src={imagem}
            alt={produto.nome}
            fill
            sizes="84px"
            className="object-cover"
          />
        ) : (
          // RN-PROD-003: sem imagem, placeholder da identidade Shalon.
          <span
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center text-[24px]"
          >
            🍕
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-[16px] font-semibold text-ink">{produto.nome}</h3>
          {destaque ? <Badge tom="destaque">Destaque</Badge> : null}
          {produto.em_promocao ? <Badge tom="promocao">Promoção</Badge> : null}
          {!produto.disponivel ? <Badge tom="indisponivel">Indisponível hoje</Badge> : null}
        </div>

        {produto.descricao ? (
          <p className="m-0 line-clamp-2 text-[13px] leading-[1.4] text-ink-2">
            {produto.descricao}
          </p>
        ) : null}

        <div className="mt-[6px] flex flex-wrap items-center justify-between gap-[10px]">
          <div className="flex items-baseline gap-2">
            {produto.em_promocao && produto.preco_de !== null ? (
              <span className="text-[13px] text-muted line-through">
                {formatBRL(produto.preco_de)}
              </span>
            ) : null}
            <span className="text-[17px] font-bold tabular-nums text-ink">
              {precoFaixa(produto)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <BotaoFavorito produtoId={produto.id} nome={produto.nome} compacto />
            {produto.disponivel ? (
              <Link
                href={`/produto/${produto.slug}`}
                className="inline-flex min-h-touch items-center rounded-11 bg-cta px-[14px] text-[14px] font-semibold text-cta-fg"
              >
                Escolher
              </Link>
            ) : (
              // RN-BUSCA-002: continua visível, sem possibilidade de adição.
              <span
                aria-disabled="true"
                className="inline-flex min-h-touch cursor-not-allowed items-center rounded-11 border-[1.5px] border-border-shalon bg-elev px-[14px] text-[14px] font-semibold text-muted"
              >
                Indisponível
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
