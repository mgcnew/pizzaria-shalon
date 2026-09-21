import type { Metadata } from "next";
import { EdicaoProduto } from "../_ui/EdicaoProduto";

export const metadata: Metadata = { title: "Produto" };

/**
 * No mobile, a edição continua como página própria. No desktop, a listagem
 * abre o mesmo conteúdo em modal por query string, preservando navegação SPA.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EdicaoProduto id={id} />;
}
