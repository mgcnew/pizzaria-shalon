"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { getSupabaseAdminClient } from "@/infrastructure/supabase/admin";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { Resultado } from "./tipos";

/**
 * Convite de acesso por e-mail (D-2026-10-15-121, fecha A-20).
 *
 * O funcionário recebe um link, define a própria senha na tela de redefinir
 * senha e entra. Ninguém da pizzaria escolhe nem vê a senha de outra pessoa.
 *
 * ORDEM, e ela importa:
 *  1. quem chama precisa de `employees.manage` E `roles.manage` (checado na
 *     sessão, que vem do banco);
 *  2. o funcionário precisa existir, estar ativo e ainda não ter acesso;
 *  3. só então o convite, com a chave `service_role` (única vez que ela
 *     aparece no projeto);
 *  4. o vínculo é feito pela MESMA função `vincular_acesso` de sempre, com a
 *     conta do usuário — ela refaz a checagem de permissão e grava auditoria.
 */

const ROTA_EQUIPE = "/admin/equipe";

const conviteSchema = z.object({
  funcionario_id: z.string().uuid(),
  email: z.string().email().max(200),
});

function falha(contexto: string, erro: unknown): Resultado {
  logger.error(`equipe:convite:${contexto}`, { code: (erro as { code?: string })?.code });
  return { ok: false, erro: "Não foi possível enviar o convite agora. Tente de novo." };
}

export async function convidarFuncionario(entrada: unknown): Promise<Resultado> {
  const v = conviteSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe um e-mail válido." };
  const email = v.data.email.trim().toLowerCase();

  // 1. Permissão, pela sessão que o banco monta.
  const sessao = await obterSessaoInterna();
  if (!podeNaUI(sessao, "employees.manage") || !podeNaUI(sessao, "roles.manage")) {
    return { ok: false, erro: "Você não tem permissão para conceder acesso ao sistema." };
  }

  // 2. Funcionário ativo e sem acesso ainda — lido com o RLS de quem chama.
  const supabase = await getSupabaseServerClient();
  const { data: funcionario } = await supabase
    .from("employees")
    .select("id, employment_status")
    .eq("id", v.data.funcionario_id)
    .maybeSingle();
  if (!funcionario) return { ok: false, erro: "Funcionário não encontrado." };
  if (funcionario.employment_status !== "active") {
    return { ok: false, erro: "Funcionário desligado não recebe acesso." };
  }

  // 3. Convite. O link volta para a tela de definir senha que já existe.
  const cabecalhos = await headers();
  const origem =
    cabecalhos.get("origin") ??
    `${cabecalhos.get("x-forwarded-proto") ?? "https"}://${cabecalhos.get("host") ?? "localhost:3000"}`;

  const admin = getSupabaseAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origem}/admin/redefinir-senha`,
  });
  // Conta que já existe não é erro aqui: segue para o vínculo normal.
  // Qualquer outra falha para o convite interrompe o fluxo.
  if (error && !/already|registered|exists/i.test(error.message ?? "")) {
    return falha("inviteUserByEmail", error);
  }

  // 4. Vínculo pela função normal, com a conta do próprio usuário.
  const { data, error: erroVinculo } = await supabase.rpc("vincular_acesso", {
    p_dados: { funcionario_id: v.data.funcionario_id, email },
  });
  if (erroVinculo) return falha("vincular", erroVinculo);

  revalidatePath(ROTA_EQUIPE);
  const r = (data ?? {}) as { ok?: boolean; erro?: string };
  if (r.ok) return { ok: true };
  return { ok: false, erro: r.erro ?? "Não foi possível vincular a conta." };
}
