import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";

export const metadata: Metadata = { title: "Novo produto" };

/**
 * Compatibilidade com o endereço anterior. A criação agora abre sobre a
 * listagem, em modal no desktop e como tela no mobile.
 */
export default async function Page() {
  const sessao = await obterSessaoInterna();
  // Não adianta oferecer o formulário: o RLS recusaria a escrita de qualquer
  // jeito. Melhor não simular uma capacidade que não existe.
  if (!podeNaUI(sessao, "catalog.manage")) redirect("/admin/produtos");

  redirect("/admin/produtos?novo=1");
}
