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
 * A MINIATURA é de 56px e não cresce. Aqui a pessoa está administrando, não
 * escolhendo o jantar: o que ela precisa varrer é preço, disponibilidade e
 * ação, e foto grande empurraria isso para fora da tela. O card vertical com
 * foto grande existe no cardápio público, nas vitrines (D-2026-09-21-56).
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
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          {filtrados.map((p) => {
            const motivo = p.disponivel ? null : motivoIndisponivel(p);
            const imagem = p.imagem_path ? (imagens.get(p.imagem_path) ?? null) : null;
            return (
              <article
                key={p.id}
                className="rounded-14 border border-border-shalon bg-surface p-[13px]"
              >
                <div className="flex gap-3">
                  <div className="relative h-[56px] w-[56px] shrink-0 overflow-hidden rounded-10 bg-elev">
                    {imagem ? (
                      <Image
                        src={imagem}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-full w-full items-center justify-center bg-tn text-[20px] opacity-70"
                      >
                        🍕
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-[7px]">
                      <h3 className="m-0 text-[15.5px] font-bold text-ink">{p.nome}</h3>
                      {p.destaque ? <Badge tom="destaque">Destaque</Badge> : null}
                      {p.em_promocao ? <Badge tom="promocao">Promoção</Badge> : null}
                    </div>

                    <p className="mt-[3px] text-[13px] text-ink-2">
                      {p.categoria_nome} · {rotuloTipo(p.tipo)} · {precoExibido(p)}
                    </p>
                    <p className="mt-[2px] text-[12.5px] text-muted">
                      {p.tamanhos > 0
                        ? `${p.tamanhos} ${p.tamanhos === 1 ? "tamanho" : "tamanhos"} cadastrado${p.tamanhos === 1 ? "" : "s"}`
                        : p.preco_base !== null
                          ? "Preço próprio, sem tamanhos"
                          : "Ainda sem preço — habilite um tamanho ou defina o preço próprio"}
                      {imagem === null ? " · sem foto" : ""}
                    </p>
                  </div>
                </div>

                <div className="mt-[10px] flex flex-wrap items-center gap-2">
                  {p.disponivel ? (
                    <StatusBadge tom="sucesso">Disponível</StatusBadge>
                  ) : (
                    <StatusBadge tom={p.ativo ? "atencao" : "neutro"}>
                      {motivo ?? "Indisponível"}
                    </StatusBadge>
                  )}

                  {/* RN-DISP-002: alternar a disponibilidade de HOJE. Não
                      confundir com inativar o cadastro, que fica na edição. */}
                  {podeGerenciar ? (
                    <BotaoAcao
                      acao={alternarDisponibilidadeProduto}
                      campos={{ id: p.id, disponivel: String(!p.disponivel_hoje) }}
                    >
                      {p.disponivel_hoje ? "Marcar indisponível hoje" : "Voltar a vender"}
                    </BotaoAcao>
                  ) : null}

                  <Link
                    href={`/admin/produtos/editar/${p.id}`}
                    className="inline-flex min-h-[42px] items-center px-[13px] text-[13px] font-semibold text-ink-2 hover:text-ink"
                  >
                    {podeGerenciar ? "Editar" : "Ver detalhes"}
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
