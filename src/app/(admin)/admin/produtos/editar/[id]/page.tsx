import type { Metadata } from "next";
import { EdicaoProduto } from "../../_ui/EdicaoProduto";

export const metadata: Metadata = { title: "Produto" };

/**
 * Rota canônica e inequívoca da edição. Em navegação a partir da listagem é
 * interceptada como modal; em acesso direto continua sendo uma página.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EdicaoProduto id={id} />;
}
