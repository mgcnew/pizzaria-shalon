import { EdicaoProduto } from "@/app/(admin)/admin/produtos/_ui/EdicaoProduto";

export default async function ModalEdicaoProdutoInterceptado({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EdicaoProduto id={id} emModal fecharComVoltar />;
}
