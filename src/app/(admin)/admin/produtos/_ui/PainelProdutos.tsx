import Image from "next/image";
import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { Badge, StatusBadge } from "@/ui/components";
import { EmptyState } from "@/ui/patterns";
import { listarProdutos, listarCategorias } from "@/application/catalogo/consultas";
import { urlDaImagem } from "@/application/publico/consultas";
import { alternarDisponibilidadeProduto } from "@/application/catalogo/acoes";
import { TIPOS_PRODUTO, type ProdutoAdmin } from "@/application/catalogo/tipos";
import { BotaoAcao } from "./BotaoAcao";
import { FiltrosProdutos } from "./FiltrosProdutos";

/**
 * Lista de produtos — a aba "Produtos" do design aprovado.
 *
 * Preserva do protótipo: busca, filtro de categoria, filtro de status, botão
 * "+ Novo produto" no par CTA, e o cartão com nome, selos de Destaque e
 * Promoção, linha "categoria · preço", pílula de status e os botões de
 * alternar e editar.
 *
 * DIFERENÇAS, e o porquê de cada uma:
 *  · o protótipo mostrava "X vendas no período" no cartão. Venda depende de
 *    pedido, que é da Fase 5 em diante. Em vez de inventar número, o cartão
 *    mostra quantos tamanhos a pizza oferece — informação que existe agora;
 *  · o preço vem do banco já com promoção aplicada (RN-PIZZA-005). Pizza com
 *    vários tamanhos mostra a faixa "de … a …", porque não existe um preço
 *    único para ela;
 *  · a edição abre uma rota própria em vez de modal (ver produtos/[id]).
 *
 * No desktop a leitura é tabular, com miniatura de 48px para comparar muitos
 * itens rapidamente. Abaixo de 1024px cada linha assume formato de card com
 * foto panorâmica, mais adequado a toque e a colunas estreitas.
 *
 * Quando não há foto, o cartão DIZ que não há. É no painel que essa falta é
 * acionável — e produto sem foto aparece pior no cardápio do que qualquer
 * outra coisa que se possa ajustar aqui.
 */

function rotuloTipo(tipo: string): string {
  return TIPOS_PRODUTO.find((t) => t.valor === tipo)?.rotulo ?? tipo;
}

function precoExibido(p: ProdutoAdmin): string {
  if (p.tamanhos > 0 && p.preco_min !== null && p.preco_max !== null) {
    return p.preco_min === p.preco_max
      ? formatBRL(p.preco_min)
      : `${formatBRL(p.preco_min)} a ${formatBRL(p.preco_max)}`;
  }
  if (p.preco_min !== null) return formatBRL(p.preco_min);
  return "Sem preço definido";
}

/** Por que o produto não está disponível — a Owner precisa saber a causa. */
function motivoIndisponivel(p: ProdutoAdmin): string | null {
  if (!p.ativo) return "Inativo no cadastro";
  if (p.categoria_pausada) return `Categoria "${p.categoria_nome}" pausada`;
  if (!p.disponivel_hoje) return "Indisponível hoje";
  if (p.tipo === "combo") return "Algum componente do combo está indisponível";
  if (p.tamanhos > 0) return "Todos os tamanhos estão indisponíveis";
  if (p.preco_base === null) return "Falta definir o preço";
  return null;
}

export async function PainelProdutos({
  busca,
  categoria,
  situacao,
  podeGerenciar,
}: {
  busca: string;
  categoria: string;
  situacao: string;
  podeGerenciar: boolean;
}) {
  const [produtos, categorias] = await Promise.all([listarProdutos(), listarCategorias()]);

  const termo = busca.trim().toLowerCase();
  const filtrados = produtos.filter((p) => {
    if (termo && !`${p.nome} ${p.categoria_nome}`.toLowerCase().includes(termo)) return false;
    if (categoria && p.categoria_id !== categoria) return false;
    if (situacao === "disponivel" && !p.disponivel) return false;
    if (situacao === "indisponivel" && p.disponivel) return false;
    if (situacao === "hoje" && (!p.ativo || p.disponivel_hoje)) return false;
    if (situacao === "inativo" && p.ativo) return false;
    if (situacao === "promo" && !p.em_promocao) return false;
    return true;
  });

  // A URL do catálogo é pública e determinística; resolver antes do map evita
  // um await por cartão dentro da renderização.
  const caminhos = [...new Set(filtrados.map((p) => p.imagem_path).filter((c) => c !== null))];
  const imagens = new Map(
    await Promise.all(caminhos.map(async (c) => [c, await urlDaImagem(c)] as const)),
  );

  return (
    <div>
      <FiltrosProdutos
        busca={busca}
        categoria={categoria}
        situacao={situacao}
        categorias={categorias.map((item) => ({ id: item.id, nome: item.name }))}
      />

      {filtrados.length === 0 ? (
        <EmptyState
          titulo="Nenhum produto neste filtro"
          descricao="Ajuste a busca ou cadastre um novo item do cardápio."
        />
      ) : (
        <div
          role="table"
          aria-label="Produtos do cardápio"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:block lg:overflow-hidden lg:rounded-16 lg:border lg:border-border-shalon lg:bg-surface"
        >
          <div
            role="row"
            className="sr-only grid-cols-[minmax(220px,1.5fr)_minmax(90px,0.65fr)_minmax(105px,0.75fr)_minmax(130px,0.85fr)_minmax(175px,auto)] border-b border-border-shalon bg-bg/60 text-[11px] font-bold uppercase tracking-[0.05em] text-muted lg:not-sr-only lg:grid"
          >
            <span role="columnheader" className="px-3 py-2.5">Produto</span>
            <span role="columnheader" className="px-3 py-2.5">Preço</span>
            <span role="columnheader" className="px-3 py-2.5">Configuração</span>
            <span role="columnheader" className="px-3 py-2.5">Situação</span>
            <span role="columnheader" className="px-3 py-2.5 text-right">Ações</span>
          </div>

          {filtrados.map((p) => {
            const motivo = p.disponivel ? null : motivoIndisponivel(p);
            const imagem = p.imagem_path ? (imagens.get(p.imagem_path) ?? null) : null;
            const configuracao =
              p.tamanhos > 0
                ? `${p.tamanhos} ${p.tamanhos === 1 ? "tamanho" : "tamanhos"}`
                : p.preco_base !== null
                  ? "Preço próprio"
                  : "Sem preço configurado";

            return (
              <article
                key={p.id}
                role="row"
                className="group flex min-w-0 flex-col overflow-hidden rounded-16 border border-border-shalon bg-surface shadow-[0_4px_16px_rgb(41_37_36/0.035)] lg:grid lg:grid-cols-[minmax(220px,1.5fr)_minmax(90px,0.65fr)_minmax(105px,0.75fr)_minmax(130px,0.85fr)_minmax(175px,auto)] lg:items-center lg:rounded-none lg:border-0 lg:border-b lg:shadow-none lg:transition-colors lg:last:border-b-0 lg:hover:bg-elev"
              >
                <div role="cell" className="min-w-0 lg:flex lg:items-center lg:gap-3 lg:px-3 lg:py-2.5">
                  <div className="relative aspect-[5/2] w-full shrink-0 overflow-hidden bg-elev lg:h-12 lg:w-12 lg:rounded-10 lg:aspect-square">
                    {imagem ? (
                      <Image
                        src={imagem}
                        alt={p.nome}
                        fill
                        sizes="(min-width: 1024px) 48px, (max-width: 640px) 100vw, 33vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-full w-full items-center justify-center bg-gradient-to-br from-tn to-elev text-[40px] opacity-60 lg:text-[20px]"
                      >
                        🍕
                      </span>
                    )}

                    <div className="absolute left-2 top-2 flex flex-wrap gap-1.5 lg:hidden">
                      {p.destaque ? <Badge tom="destaque">Destaque</Badge> : null}
                      {p.em_promocao ? <Badge tom="promocao">Promoção</Badge> : null}
                    </div>

                    {!p.disponivel ? (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-3 pb-2 pt-8 lg:hidden">
                        <span className="text-[12px] font-semibold text-white">
                          {motivo ?? "Indisponível"}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="min-w-0 p-3 pb-0 lg:p-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <h3 className="m-0 min-w-0 truncate font-display text-[15.5px] font-bold leading-tight text-ink">
                        {p.nome}
                      </h3>
                      <div className="hidden flex-wrap gap-1 lg:flex">
                        {p.destaque ? <Badge tom="destaque">Destaque</Badge> : null}
                        {p.em_promocao ? <Badge tom="promocao">Promoção</Badge> : null}
                      </div>
                    </div>
                    <p className="mb-0 mt-1 truncate text-[12px] font-medium text-muted">
                      {p.categoria_nome} · {rotuloTipo(p.tipo)}
                    </p>
                    {p.descricao ? (
                      <p className="mb-0 mt-1.5 line-clamp-1 text-[12px] leading-relaxed text-ink-2 lg:hidden">
                        {p.descricao}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div role="cell" className="px-3 pt-2.5 lg:py-2.5">
                  <p className="m-0 tabular-nums text-[16px] font-extrabold text-ink lg:text-[13.5px]">
                    {precoExibido(p)}
                  </p>
                </div>

                <div role="cell" className="px-3 pt-1 lg:py-2.5">
                  <p className="m-0 text-[12px] font-medium text-ink-2">{configuracao}</p>
                  {imagem === null ? (
                    <p className="mb-0 mt-0.5 text-[11px] text-muted">Sem foto</p>
                  ) : null}
                </div>

                <div role="cell" className="px-3 py-3 lg:py-2.5">
                  {p.disponivel ? (
                    <StatusBadge tom="sucesso">Disponível</StatusBadge>
                  ) : (
                    <>
                      <StatusBadge tom={p.ativo ? "atencao" : "neutro"}>
                        {p.ativo ? "Indisponível" : "Inativo"}
                      </StatusBadge>
                      <p className="mb-0 mt-1 line-clamp-2 text-[11px] leading-snug text-muted">
                        {motivo ?? "Indisponível"}
                      </p>
                    </>
                  )}
                </div>

                <div
                  role="cell"
                  className="flex flex-wrap items-center gap-1.5 border-t border-border-shalon bg-bg/45 px-3 py-2.5 lg:flex-nowrap lg:justify-end lg:border-0 lg:bg-transparent"
                >
                  {/* RN-DISP-002: alternar a disponibilidade de HOJE. Não
                      confundir com inativar o cadastro, que fica na edição. */}
                  {podeGerenciar ? (
                    <BotaoAcao
                      acao={alternarDisponibilidadeProduto}
                      campos={{ id: p.id, disponivel: String(!p.disponivel_hoje) }}
                    >
                      {p.disponivel_hoje ? "Pausar hoje" : "Voltar a vender"}
                    </BotaoAcao>
                  ) : null}

                  <Link
                    href={`/admin/produtos/editar/${p.id}`}
                    aria-label={`${podeGerenciar ? "Editar" : "Ver detalhes de"} ${p.nome}`}
                    title={podeGerenciar ? "Editar produto" : "Ver detalhes"}
                    className="motion-interactive ml-auto inline-flex min-h-[42px] min-w-[42px] items-center justify-center gap-1.5 rounded-10 px-2 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-surface hover:text-ink lg:ml-0"
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                      <path d="m13.7 3.3 3 3M4 16l3.2-.7 8.5-8.5a2.12 2.12 0 0 0-3-3l-8.5 8.5L4 16Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="lg:sr-only">
                      {podeGerenciar ? "Editar" : "Ver detalhes"}
                    </span>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
