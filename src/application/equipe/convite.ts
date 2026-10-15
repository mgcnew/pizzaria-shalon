"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { getSupabaseAdminClient } from "@/infrastructure/supabase/admin";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
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
  // Nada pode escapar daqui como exceção: uma exceção de servidor cai na tela
  // de erro geral da página. O motivo real vai para o log; a pessoa vê uma
  // mensagem que diz o que fazer.
  try {
    return await convidar(entrada);
  } catch (erro) {
    if (erro instanceof AppError && erro.kind === "config") {
      logger.error("equipe:convite:configuracao", { motivo: erro.message });
      return {
        ok: false,
        erro: "Convites ainda não estão configurados neste ambiente. Avise quem cuida do sistema.",
      };
    }
    return falha("inesperado", erro);
  }
}

/**
 * Traduz o erro do Supabase em instrução para quem opera. Só usa o código do
 * erro, que não tem segredo; a chave nunca aparece aqui.
 */
function motivoDoConvite(erro: unknown): string {
  const e = erro as { code?: string; status?: number; message?: string };
  const codigo = e.code ?? "";
  if (codigo === "over_email_send_rate_limit" || e.status === 429) {
    return "Limite de envio de e-mails atingido. Tente de novo em alguns minutos, ou configure um SMTP próprio no Supabase.";
  }
  if (e.status === 401 || e.status === 403 || codigo === "bad_jwt" || codigo === "invalid_api_key") {
    return "A chave de servidor (SUPABASE_SERVICE_ROLE_KEY) não corresponde a este projeto. Confira se é a chave do projeto que o site usa.";
  }
  if (codigo === "unexpected_failure" || /redirect|url/i.test(e.message ?? "")) {
    return "O Supabase recusou o endereço de retorno. Confira em Authentication → URL Configuration se o redirecionamento está liberado.";
  }
  return `Não foi possível enviar o convite (${codigo || e.status || "erro desconhecido"}). Veja o log do servidor para detalhes.`;
}

async function convidar(entrada: unknown): Promise<Resultado> {
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
    logger.error("equipe:convite:inviteUserByEmail", {
      code: (error as { code?: string }).code,
      status: (error as { status?: number }).status,
    });
    return { ok: false, erro: motivoDoConvite(error) };
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

const contaComSenhaSchema = z.object({
  funcionario_id: z.string().uuid(),
  email: z.string().email().max(200),
  senha: z.string().min(8, { message: "A senha precisa ter pelo menos 8 caracteres." }).max(72),
});

/**
 * Cria a conta com senha definida pelo dono (D-2026-10-15-121, opção aprovada
 * em 15/10/2026). A conta nasce confirmada, sem e-mail. Só cria conta NOVA:
 * se o e-mail já existe, recusa, e nunca troca a senha de uma conta existente.
 * Se o vínculo falhar, a conta criada é removida, para não sobrar login solto.
 */
export async function criarContaComSenha(entrada: unknown): Promise<Resultado> {
  try {
    return await criarConta(entrada);
  } catch (erro) {
    if (erro instanceof AppError && erro.kind === "config") {
      logger.error("equipe:conta:configuracao", { motivo: erro.message });
      return {
        ok: false,
        erro: "Convites ainda não estão configurados neste ambiente. Avise quem cuida do sistema.",
      };
    }
    return falha("criarConta", erro);
  }
}

async function criarConta(entrada: unknown): Promise<Resultado> {
  const v = contaComSenhaSchema.safeParse(entrada);
  if (!v.success) {
    return { ok: false, erro: v.error.issues[0]?.message ?? "Confira os dados informados." };
  }
  const email = v.data.email.trim().toLowerCase();

  const sessao = await obterSessaoInterna();
  if (!podeNaUI(sessao, "employees.manage") || !podeNaUI(sessao, "roles.manage")) {
    return { ok: false, erro: "Você não tem permissão para conceder acesso ao sistema." };
  }

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

  const admin = getSupabaseAdminClient();
  const { data: criado, error } = await admin.auth.admin.createUser({
    email,
    password: v.data.senha,
    email_confirm: true,
  });
  if (error || !criado.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) {
      return {
        ok: false,
        erro: "Já existe uma conta com este e-mail. Use “Vincular conta existente” para ligá-la a este funcionário.",
      };
    }
    return { ok: false, erro: motivoDoConvite(error) };
  }

  const { data, error: erroVinculo } = await supabase.rpc("vincular_acesso", {
    p_dados: { funcionario_id: v.data.funcionario_id, email },
  });
  const r = (data ?? {}) as { ok?: boolean; erro?: string };
  if (erroVinculo || !r.ok) {
    // Sem vínculo, a conta não serve a ninguém: desfaz a criação.
    await admin.auth.admin.deleteUser(criado.user.id);
    logger.error("equipe:conta:vinculo", { code: (erroVinculo as { code?: string })?.code });
    return { ok: false, erro: r.erro ?? "Não foi possível vincular a conta. Nada foi criado." };
  }

  revalidatePath(ROTA_EQUIPE);
  return { ok: true };
}

/**
 * Conta de um funcionário já vinculada, lida com a chave administrativa, só
 * depois da checagem de permissão. Devolve null se não houver conta.
 */
async function contaVinculada(funcionarioId: string) {
  const admin = getSupabaseAdminClient();
  const { data: vinculo } = await admin
    .from("app_users")
    .select("auth_user_id")
    .eq("employee_id", funcionarioId)
    .maybeSingle();
  if (!vinculo?.auth_user_id) return null;
  const { data } = await admin.auth.admin.getUserById(vinculo.auth_user_id);
  if (!data.user) return null;
  return { admin, user: data.user };
}

async function podeAdministrarAcesso(): Promise<{ appUserId: string } | null> {
  const sessao = await obterSessaoInterna();
  if (!sessao || !podeNaUI(sessao, "employees.manage") || !podeNaUI(sessao, "roles.manage")) {
    return null;
  }
  return { appUserId: sessao.appUserId };
}

const funcionarioSchema = z.object({ funcionario_id: z.string().uuid() });

const senhaInicialSchema = funcionarioSchema.extend({
  senha: z.string().min(8, { message: "A senha precisa ter pelo menos 8 caracteres." }).max(72),
});

/**
 * Define a senha inicial de uma conta que ainda NÃO entrou no sistema (convite
 * pendente ou conta recém-vinculada). Conta que já entrou não tem a senha
 * trocada aqui: a própria pessoa troca por "Esqueci minha senha".
 */
export async function definirSenhaInicial(entrada: unknown): Promise<Resultado> {
  try {
    const v = senhaInicialSchema.safeParse(entrada);
    if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Confira a senha." };

    const quem = await podeAdministrarAcesso();
    if (!quem) return { ok: false, erro: "Você não tem permissão para alterar acessos." };

    const conta = await contaVinculada(v.data.funcionario_id);
    if (!conta) return { ok: false, erro: "Este funcionário ainda não tem conta vinculada." };
    if (conta.user.last_sign_in_at) {
      return {
        ok: false,
        erro: "Esta pessoa já entrou no sistema. Ela troca a senha em “Esqueci minha senha”.",
      };
    }

    const { error } = await conta.admin.auth.admin.updateUserById(conta.user.id, {
      password: v.data.senha,
      email_confirm: true,
    });
    if (error) return falha("definirSenha", error);

    await conta.admin.rpc("log_audit", {
      p_action: "definir_senha_inicial",
      p_entity_type: "employees",
      p_entity_id: v.data.funcionario_id,
      p_before: null,
      p_after: null,
      p_reason: null,
      p_metadata: { feito_por_app_user: quem.appUserId, email: conta.user.email },
    });

    revalidatePath(ROTA_EQUIPE);
    return { ok: true };
  } catch (erro) {
    return falha("definirSenhaInicial", erro);
  }
}

/** Reenvia o convite para quem ainda não entrou. */
export async function reenviarConvite(entrada: unknown): Promise<Resultado> {
  try {
    const v = funcionarioSchema.safeParse(entrada);
    if (!v.success) return { ok: false, erro: "Funcionário inválido." };

    const quem = await podeAdministrarAcesso();
    if (!quem) return { ok: false, erro: "Você não tem permissão para alterar acessos." };

    const conta = await contaVinculada(v.data.funcionario_id);
    if (!conta || !conta.user.email) return { ok: false, erro: "Este funcionário não tem conta vinculada." };
    if (conta.user.last_sign_in_at) {
      return { ok: false, erro: "Esta pessoa já entrou no sistema; não há convite pendente." };
    }

    const cabecalhos = await headers();
    const origem =
      cabecalhos.get("origin") ??
      `${cabecalhos.get("x-forwarded-proto") ?? "https"}://${cabecalhos.get("host") ?? "localhost:3000"}`;

    const { error } = await conta.admin.auth.admin.inviteUserByEmail(conta.user.email, {
      redirectTo: `${origem}/admin/redefinir-senha`,
    });
    if (error) return { ok: false, erro: motivoDoConvite(error) };
    return { ok: true };
  } catch (erro) {
    return falha("reenviarConvite", erro);
  }
}
