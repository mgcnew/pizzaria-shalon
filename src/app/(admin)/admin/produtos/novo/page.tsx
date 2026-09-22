import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { listarCategorias } from "@/application/catalogo/consultas";
import { FormularioProduto } from "../_ui/FormularioProduto";

export const metadata: Metadata = { title: "Novo produto" };

/**
 * Rota canônica e compartilhável. Em navegação a partir da listagem ela é
 * interceptada como modal; em acesso direto continua sendo uma página.
 */
export default async function Page() {
  const [sessao, categorias] = await Promise.all([obterSessaoInterna(), listarCategorias()]);
  // Não adianta oferecer o formulário: o RLS recusaria a escrita de qualquer
  // jeito. Melhor não simular uma capacidade que não existe.
  if (!podeNaUI(sessao, "catalog.manage")) redirect("/admin/produtos");

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <Link href="/admin/produtos" className="text-[13.5px] font-semibold text-ink-2">
        ← Voltar ao cardápio
      </Link>
      <h1 className="m-0 font-display text-[22px] font-extrabold text-ink">Novo produto</h1>
      <FormularioProduto categorias={categorias} />
    </div>
  );
}
