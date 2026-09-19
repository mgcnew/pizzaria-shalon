"use server";

import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";

/**
 * Define a nova senha.
 *
 * 03-RLS-RBAC-SEGURANCA.md §25 e §31 · CLAUDE.md §36
 *
 * Roda no SERVIDOR de propósito: a senha nova nunca transita por código de
 * cliente nem entra em log — a mesma regra que vale para o login.
 *
 * A sessão usada aqui é a de recuperação, criada pelo link do e-mail e já
 * gravada nos cookies pela página. Sem ela, `updateUser` falha — não há como
 * trocar a senha de outra pessoa a partir desta tela.
 *
 * Ao final, a sessão é encerrada. Entrar de novo com a senha nova é a prova
 * de que ela funciona, e evita deixar aberta uma sessão que nasceu de um
 * link de e-mail.
 */
export type EstadoNovaSenha = { ok?: boolean; erro?: string };

/** Mínimo do Supabase Auth é 6; a política definitiva é da Fase 10 (A-15). */
const MINIMO = 8;

export async function definirNovaSenha(
  _anterior: EstadoNovaSenha,
  formData: FormData,
): Promise<EstadoNovaSenha> {
  const senha = String(formData.get("senha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (senha.length < MINIMO) {
    return { erro: `A senha precisa ter pelo menos ${MINIMO} caracteres.` };
  }
  if (senha !== confirmacao) {
    return { erro: "As duas senhas não são iguais." };
  }

  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      erro: "Este link não é mais válido. Peça um novo link de redefinição.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: senha });

  if (error) {
    logger.warn("falha ao definir nova senha", {
      code: (error as { code?: string }).code,
    });
    return {
      erro: "Não foi possível definir a senha. Peça um novo link e tente de novo.",
    };
  }

  await supabase.auth.signOut();
  return { ok: true };
}
