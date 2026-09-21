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
import { MenuFerramentasCatalogo } from "./_ui/MenuFerramentasCatalogo";
import { ModalFerramentaCatalogo } from "./_ui/ModalFerramentaCatalogo";
import { FormularioProduto } from "./_ui/FormularioProduto";
import { EdicaoProduto } from "./_ui/EdicaoProduto";

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
 * A ferramenta selecionada viaja na URL. No desktop ela abre em modal e no
 * mobile ocupa a página, sempre com navegação SPA e URL compartilhável.
 */

const FERRAMENTAS = [
  { nome: "Categorias", valor: "categorias" },
  { nome: "Tamanhos", valor: "tamanhos" },
  { nome: "Bordas", valor: "bordas" },
  { nome: "Adicionais", valor: "adicionais" },
  { nome: "Combos", valor: "combos" },
  { nome: "Promoções", valor: "promocoes" },
  { nome: "Banners", valor: "banners" },
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
  const tamanhoDaFerramenta =
    aba === "tamanhos" ||
    aba === "adicionais" ||
    aba === "promocoes" ||
    aba === "banners"
      ? "compacto"
      : aba === "categorias" || aba === "bordas"
        ? "regular"
        : aba === "combos"
          ? "medio"
          : "amplo";

  // A interface esconde o que não se aplica. Quem autoriza de verdade é o
  // RLS: mesmo que alguém chame a Server Action direto, a escrita é recusada
  // (CLAUDE.md §12).
  const sessao = await obterSessaoInterna();
  const podeGerenciar = podeNaUI(sessao, "catalog.manage");
  const novoProduto = um("novo") === "1" && aba === "produtos" && podeGerenciar;
  const produtoEmEdicao = !novoProduto && aba === "produtos" ? um("editar") : "";
  const categoriasDoNovoProduto = novoProduto ? await listarCategorias() : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 font-display text-[22px] font-extrabold text-ink">Produtos</h2>
          <p className="mb-0 mt-1 text-[13.5px] text-muted">
            Gerencie os itens e a estrutura do cardápio.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {podeGerenciar ? (
            <Link
              href="/admin/produtos?novo=1"
              className="inline-flex min-h-touch items-center rounded-11 bg-cta px-4 text-[14px] font-bold text-cta-fg shadow-[0_5px_16px_rgb(30_24_20/0.08)]"
            >
              + Novo produto
            </Link>
          ) : null}
          <MenuFerramentasCatalogo
            ferramentas={FERRAMENTAS}
            atual={aba === "produtos" ? undefined : aba}
          />
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
          titulo={FERRAMENTAS.find((ferramenta) => ferramenta.valor === aba)?.nome ?? "Cardápio"}
          tamanho={tamanhoDaFerramenta}
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
