"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import type { EstadoFormulario } from "@/application/catalogo/tipos";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";

const nomeDoPerfil = z.string().trim().min(2).max(120);

export async function atualizarPerfil(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const sessao = await obterSessaoInterna();
  if (!sessao) return { erro: "Sua sessão expirou. Entre novamente." };
  if (!podeNaUI(sessao, "employees.manage")) {
    return { erro: "Seu perfil não possui permissão para alterar dados de funcionários." };
  }

  const nome = nomeDoPerfil.safeParse(form.get("nome"));
  if (!nome.success) return { erro: "Informe um nome entre 2 e 120 caracteres." };

  const supabase = await getSupabaseServerClient();
  const { error, count } = await supabase
    .from("employees")
    .update({ full_name: nome.data }, { count: "exact" })
    .eq("id", sessao.employeeId);

  if (error || count === 0) {
    logger.error("perfil:atualizar", { code: error?.code });
    return { erro: "Não foi possível atualizar o perfil." };
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/perfil");
  return { ok: "Perfil atualizado." };
}
