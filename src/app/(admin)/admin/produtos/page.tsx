import type { Metadata } from "next";
import { Abas, type Aba } from "@/ui/patterns";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { PainelProdutos } from "./_ui/PainelProdutos";
import { PainelCategorias } from "./_ui/PainelCategorias";
import { PainelTamanhos } from "./_ui/PainelTamanhos";
import { PainelBordasAdicionais } from "./_ui/PainelBordasAdicionais";
import { PainelCombos } from "./_ui/PainelCombos";
import { PainelPromocoes } from "./_ui/PainelPromocoes";
import { PainelBanners } from "./_ui/PainelBanners";

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
 * A aba viaja na URL, não em estado de cliente (PI-004).
 */

const ABAS: readonly Aba[] = [
  { nome: "Produtos", valor: "produtos" },
  { nome: "Categorias", valor: "categorias" },
  { nome: "Tamanhos", valor: "tamanhos" },
  { nome: "Bordas", valor: "bordas" },
  { nome: "Adicionais", valor: "adicionais" },
  { nome: "Combos", valor: "combos" },
  { nome: "Promoções", valor: "promocoes" },
  { nome: "Banners", valor: "banners" },
];

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

  const aba = ABAS.some((a) => a.valor === um("aba")) ? um("aba") : "produtos";

  // A interface esconde o que não se aplica. Quem autoriza de verdade é o
  // RLS: mesmo que alguém chame a Server Action direto, a escrita é recusada
  // (CLAUDE.md §12).
  const sessao = await obterSessaoInterna();
  const podeGerenciar = podeNaUI(sessao, "catalog.manage");

  return (
    <div className="flex flex-col gap-4">
      <Abas abas={ABAS} atual={aba} parametro="aba" base="/admin/produtos" />

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
    </div>
  );
}
