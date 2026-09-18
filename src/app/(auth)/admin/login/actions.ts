"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";

/**
 * Server Action de login da equipe interna.
 *
 * Roda no servidor: a senha nunca transita por código de cliente nem aparece
 * em log (03-RLS-RBAC-SEGURANCA.md §31).
 *
 * A mensagem devolvida é deliberadamente genérica: não revela se o e-mail
 * existe, o que evita enumeração de usuários (§25).
 */
export type EstadoLogin = { erro?: string };

export async function entrar(
  _anterior: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const proximo = String(formData.get("proximo") ?? "/admin");

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    logger.warn("tentativa de login sem sucesso");
    return { erro: "E-mail ou senha incorretos." };
  }

  // Autenticar não basta: é preciso ser usuário interno ATIVO. Quem não for
  // (cliente, funcionário sem acesso, usuário desligado) não entra no painel.
  const { data: interno } = await supabase.rpc("is_internal_user");
  if (interno !== true) {
    await supabase.auth.signOut();
    logger.warn("login de identidade sem acesso interno ativo");
    return {
      erro: "Esta conta não tem acesso ao painel da Shalon. Fale com a proprietária.",
    };
  }

  redirect(proximo.startsWith("/admin") ? proximo : "/admin");
}

export async function sair() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
