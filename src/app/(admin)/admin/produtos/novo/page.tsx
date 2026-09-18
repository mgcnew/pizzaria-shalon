import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listarCategorias } from "@/application/catalogo/consultas";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { FormularioProduto } from "../_ui/FormularioProduto";

export const metadata: Metadata = { title: "Novo produto" };

/**
 * Criação de produto.
 *
 * ADAPTAÇÃO REGISTRADA: no protótipo isto era um modal. Virou rota própria
 * porque o formulário é renderizado e validado no servidor, o endereço fica
 * compartilhável e o botão "voltar" funciona. O CONTEÚDO e a sequência do
 * design foram preservados — inclusive a numeração "1 · Dados básicos".
 * Pendência A-06.
 */
export default async function Page() {
  const sessao = await obterSessaoInterna();
  // Não adianta oferecer o formulário: o RLS recusaria a escrita de qualquer
  // jeito. Melhor não simular uma capacidade que não existe.
  if (!podeNaUI(sessao, "catalog.manage")) redirect("/admin/produtos");

  const categorias = await listarCategorias();

  return (
    <div className="flex max-w-[620px] flex-col gap-4">
      <Link href="/admin/produtos" className="text-[13.5px] font-semibold text-ink-2">
        ← Voltar ao cardápio
      </Link>
      <h1 className="m-0 font-display text-[22px] font-extrabold text-ink">Novo produto</h1>
      <FormularioProduto categorias={categorias} />
    </div>
  );
}
