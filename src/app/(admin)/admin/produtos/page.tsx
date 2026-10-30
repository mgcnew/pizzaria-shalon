import type { Metadata } from "next";
import Link from "next/link";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { listarCategorias } from "@/application/catalogo/consultas";
import { PainelProdutos } from "./_ui/PainelProdutos";
import { PainelCategorias } from "./_ui/PainelCategorias";
import { PainelTamanhos } from "./_ui/PainelTamanhos";
import { PainelBordasAdicionais } from "./_ui/PainelBordasAdicionais";
import { PainelCombos } from "./_ui/PainelCombos";
import { PainelPromocoes } from "./_ui/PainelPromocoes";
import { PainelBanners } from "./_ui/PainelBanners";
import { ModalFerramentaCatalogo } from "./_ui/ModalFerramentaCatalogo";
import { FormularioProduto } from "./_ui/FormularioProduto";
import { EdicaoProduto } from "./_ui/EdicaoProduto";
import { AbasComIcones } from "@/ui/patterns";
import { IndicadorDeNavegacao } from "@/ui/components/IndicadorDeNavegacao";

export const metadata: Metadata = { title: "Produtos" };

/**
 * Cardápio administrativo — a tela "Produtos" do design aprovado.
 *
 * ABAS. O design tinha: Produtos, Categorias, Tamanhos, **Sabores**, Bordas,
 * Adicionais, Combos, Promoções.
 *
 * "Sabores" NÃO existe mais, e isso não é simplificação: D-2026-09-17-04 e
 * 79.3 decidiram que cada sabor comercial de pizza É UM PRODUTO. Uma aba
 * separada de sabores reintroduziria a entidade que o modelo aprovado
 * eliminou. Os sabores estão em Produtos, nas categorias de pizza.
 *
 * "Banners" foi acrescentada: é escopo da Fase 3 (§7.2, item 11) e o
 * protótipo não tinha a tela de administração correspondente.
 *
 * "GERENCIAR CARDÁPIO" (D-2026-10-02-113). As sete ferramentas ficam num
 * modal só, com abas; a página tem um botão para abri-lo, na primeira aba.
 *
 * A ferramenta selecionada viaja na URL. No desktop ela abre em modal e no
 * mobile ocupa a página, sempre com navegação SPA e URL compartilhável.
 */

function Icone({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" className="h-5 w-5" fill="none">
      <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FERRAMENTAS = [
  { nome: "Categorias", valor: "categorias", icone: <Icone d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" /> },
  { nome: "Tamanhos", valor: "tamanhos", icone: <Icone d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /> },
  { nome: "Bordas", valor: "bordas", icone: <Icone d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 6.5v.01M17.5 12v.01M12 17.5v.01M6.5 12v.01" /> },
  { nome: "Adicionais", valor: "adicionais", icone: <Icone d="M12 5v14M5 12h14" /> },
  { nome: "Combos", valor: "combos", icone: <Icone d="M12 3 4 7l8 4 8-4-8-4ZM4 12l8 4 8-4M4 17l8 4 8-4" /> },
  { nome: "Promoções", valor: "promocoes", icone: <Icone d="M12 3H5a2 2 0 0 0-2 2v7l9 9 9-9-9-9ZM8 8v.01" /> },
  { nome: "Banners", valor: "banners", icone: <Icone d="M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5" /> },
] as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const um = (chave: string) => {
    const v = params[chave];
    return typeof v === "string" ? v : "";
  };

  const aba = FERRAMENTAS.some((a) => a.valor === um("aba")) ? um("aba") : "produtos";

  // A interface esconde o que não se aplica. Quem autoriza de verdade é o
  // RLS: mesmo que alguém chame a Server Action direto, a escrita é recusada
  // (CLAUDE.md §12).
  const solicitouNovoProduto = um("novo") === "1" && aba === "produtos";
  const [sessao, categoriasSolicitadas] = await Promise.all([
    obterSessaoInterna(),
    solicitouNovoProduto ? listarCategorias() : Promise.resolve([]),
  ]);
  const podeGerenciar = podeNaUI(sessao, "catalog.manage");
  const novoProduto = solicitouNovoProduto && podeGerenciar;
  const produtoEmEdicao = !novoProduto && aba === "produtos" ? um("editar") : "";
  const categoriasDoNovoProduto = novoProduto ? categoriasSolicitadas : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="m-0 font-display text-[22px] font-extrabold text-ink">Produtos</h2>
          <p className="mb-0 mt-1 text-[13.5px] text-muted">
            Gerencie os itens e a estrutura do cardápio.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
          {podeGerenciar ? (
            <Link
              href="/admin/produtos/novo"
              className="inline-flex min-h-touch flex-1 items-center justify-center whitespace-nowrap rounded-11 bg-cta px-4 sm:flex-none text-[14px] font-bold text-cta-fg shadow-[0_5px_16px_rgb(30_24_20/0.08)]"
            >
              + Novo produto
            </Link>
          ) : null}
          {/* Um botão só: dentro do modal, as seções viram abas. */}
          <Link
            href="/admin/produtos?aba=categorias"
            className="motion-interactive relative inline-flex min-h-touch flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-11 border-[1.5px] border-border-shalon bg-surface px-[14px] sm:flex-none text-[14px] font-semibold text-ink transition-colors hover:border-brand-orange"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" className="h-[18px] w-[18px]" fill="none">
              <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Gerenciar cardápio
            <IndicadorDeNavegacao forma="traco" tom="marca" />
          </Link>
        </div>
      </div>

      {!podeGerenciar ? (
        <p className="m-0 rounded-12 border border-tib bg-ti px-3 py-[10px] text-[13.5px] font-semibold text-tif">
          Você pode consultar o cardápio, mas não alterá-lo. Alterações exigem a permissão de
          gerenciar catálogo.
        </p>
      ) : null}

      {aba === "produtos" ? (
        <PainelProdutos
          busca={um("busca")}
          categoria={um("categoria")}
          situacao={um("situacao")}
          podeGerenciar={podeGerenciar}
        />
      ) : null}
      {aba !== "produtos" ? (
        <ModalFerramentaCatalogo
          titulo="Gerenciar cardápio"
          // Largura única: o modal não muda de tamanho a cada troca de aba.
          tamanho="medio"
          abas={<AbasComIcones abas={FERRAMENTAS} atual={aba} parametro="aba" base="/admin/produtos" />}
        >
          {aba === "categorias" ? <PainelCategorias podeGerenciar={podeGerenciar} /> : null}
          {aba === "tamanhos" ? <PainelTamanhos podeGerenciar={podeGerenciar} /> : null}
          {aba === "bordas" ? (
            <PainelBordasAdicionais tipo="borda" podeGerenciar={podeGerenciar} />
          ) : null}
          {aba === "adicionais" ? (
            <PainelBordasAdicionais tipo="adicional" podeGerenciar={podeGerenciar} />
          ) : null}
          {aba === "combos" ? <PainelCombos podeGerenciar={podeGerenciar} /> : null}
          {aba === "promocoes" ? <PainelPromocoes podeGerenciar={podeGerenciar} /> : null}
          {aba === "banners" ? <PainelBanners podeGerenciar={podeGerenciar} /> : null}
        </ModalFerramentaCatalogo>
      ) : null}

      {novoProduto ? (
        <ModalFerramentaCatalogo titulo="Novo produto" variante="formulario">
          <FormularioProduto categorias={categoriasDoNovoProduto} integrado />
        </ModalFerramentaCatalogo>
      ) : null}

      {produtoEmEdicao ? <EdicaoProduto id={produtoEmEdicao} emModal /> : null}
    </div>
  );
}
