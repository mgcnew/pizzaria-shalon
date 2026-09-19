"use server";

import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";

/**
 * Pedido de recuperação de senha da equipe interna.
 *
 * 03-RLS-RBAC-SEGURANCA.md §25 · CLAUDE.md §37
 *
 * A RESPOSTA É SEMPRE A MESMA, exista a conta ou não. É a mesma postura do
 * login: dizer "este e-mail não está cadastrado" transformaria esta tela num
 * verificador de quem trabalha na Shalon (enumeração de usuários).
 *
 * Por isso também não há diferença de tempo perceptível nem mensagem
 * distinta para erro do provedor: o que a pessoa lê é sempre que, SE houver
 * conta, o link foi enviado.
 *
 * O envio em si é do Supabase Auth. Não há e-mail montado aqui, nem token
 * gerado por nós — o link e o prazo de validade são dele.
 */
export type EstadoRecuperacao = { enviado?: boolean; erro?: string };

export async function pedirRecuperacao(
  _anterior: EstadoRecuperacao,
  formData: FormData,
): Promise<EstadoRecuperacao> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { erro: "Informe um e-mail válido." };
  }

  // O destino do link precisa ser absoluto. Vem do host da requisição, e
  // quem de fato autoriza é a lista de redirecionamentos do próprio
  // Supabase: um host forjado não produz link que funcione.
  const cabecalhos = await headers();
  const origem =
    cabecalhos.get("origin") ??
    `${cabecalhos.get("x-forwarded-proto") ?? "http"}://${cabecalhos.get("host") ?? "localhost:3000"}`;

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origem}/admin/redefinir-senha`,
  });

  if (error) {
    // Registrado para quem opera, invisível para quem pediu.
    logger.warn("falha ao solicitar recuperacao de senha", {
      code: (error as { code?: string }).code,
    });
  }

  return { enviado: true };
}
