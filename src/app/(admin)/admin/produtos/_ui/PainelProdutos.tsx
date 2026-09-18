import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { Badge, StatusBadge } from "@/ui/components";
import { EmptyState } from "@/ui/patterns";
import { listarProdutos, listarCategorias } from "@/application/catalogo/consultas";
import { alternarDisponibilidadeProduto } from "@/application/catalogo/acoes";
import { TIPOS_PRODUTO, type ProdutoAdmin } from "@/application/catalogo/tipos";
import { BotaoAcao } from "./BotaoAcao";

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
    if (situacao === "hoje" && p.disponivel_hoje) return false;
    if (situacao === "inativo" && p.ativo) return false;
    if (situacao === "promo" && !p.em_promocao) return false;
    return true;
  });

  return (
    <div>
      {/* GET simples: o filtro vira parâmetro na URL e a página continua
          Server Component — nada de estado de cliente para isto (PI-004). */}
      <form className="mb-[14px] flex flex-wrap items-end gap-[10px]">
        <input type="hidden" name="aba" value="produtos" />
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Buscar produto ou categoria"
          aria-label="Buscar produto ou categoria"
          className="min-h-[46px] flex-[1_1_220px] rounded-11 border-[1.5px] border-border-shalon bg-surface px-[14px] py-[10px] text-[15px] text-ink placeholder:text-muted focus:border-brand-orange focus:outline-none"
        />
        <select
          name="categoria"
          defaultValue={categoria}
          aria-label="Filtrar por categoria"
          className="min-h-[46px] rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 py-[10px] text-[14px] font-medium text-ink focus:border-brand-orange focus:outline-none"
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="situacao"
          defaultValue={situacao}
          aria-label="Filtrar por situação"
          className="min-h-[46px] rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 py-[10px] text-[14px] font-medium text-ink focus:border-brand-orange focus:outline-none"
        >
          <option value="">Qualquer status</option>
          <option value="disponivel">Disponíveis</option>
          <option value="hoje">Indisponíveis hoje</option>
          <option value="inativo">Inativos</option>
          <option value="promo">Em promoção</option>
        </select>
        <button
          type="submit"
          className="min-h-[46px] cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-transparent px-4 text-[14px] font-semibold text-ink hover:border-brand-orange"
        >
          Filtrar
        </button>
        {podeGerenciar ? (
          <Link
            href="/admin/produtos/novo"
            className="inline-flex min-h-[46px] items-center rounded-11 bg-cta px-4 text-[14px] font-bold text-cta-fg"
          >
            + Novo produto
          </Link>
        ) : null}
      </form>

      {filtrados.length === 0 ? (
        <EmptyState
          titulo="Nenhum produto neste filtro"
          descricao="Ajuste a busca ou cadastre um novo item do cardápio."
        />
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          {filtrados.map((p) => {
            const motivo = p.disponivel ? null : motivoIndisponivel(p);
            return (
              <article
                key={p.id}
                className="rounded-14 border border-border-shalon bg-surface p-[13px]"
              >
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
                </p>

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
                    href={`/admin/produtos/${p.id}`}
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
