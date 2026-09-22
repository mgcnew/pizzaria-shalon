import { redirect } from "next/navigation";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { listarCategorias } from "@/application/catalogo/consultas";
import { FormularioProduto } from "@/app/(admin)/admin/produtos/_ui/FormularioProduto";
import { ModalFerramentaCatalogo } from "@/app/(admin)/admin/produtos/_ui/ModalFerramentaCatalogo";

export default async function ModalNovoProdutoInterceptado() {
  const [sessao, categorias] = await Promise.all([obterSessaoInterna(), listarCategorias()]);

  if (!podeNaUI(sessao, "catalog.manage")) redirect("/admin/produtos");

  return (
    <ModalFerramentaCatalogo titulo="Novo produto" variante="formulario" fecharComVoltar>
      <FormularioProduto categorias={categorias} integrado />
    </ModalFerramentaCatalogo>
  );
}
