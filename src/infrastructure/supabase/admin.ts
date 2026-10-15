import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";

/**
 * Cliente com a chave `service_role` — ÚNICO uso no projeto (D-2026-10-15-121).
 *
 * Existe para uma coisa: enviar o convite de acesso de um funcionário, porque
 * criar uma conta de login sem a chave não é possível. Por isso:
 *  - `server-only`: importar isto de um componente cliente quebra o build;
 *  - quem chama DEVE verificar a permissão antes (`employees.manage` e
 *    `roles.manage`), porque esta chave ignora o RLS;
 *  - a chave nunca é impressa em log, erro ou resposta.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !chave) {
    throw new AppError("config", "Envio de convite indisponível: configuração do servidor ausente.", {
      internalMessage: "SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL não definida",
    });
  }

  return createClient(url, chave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
