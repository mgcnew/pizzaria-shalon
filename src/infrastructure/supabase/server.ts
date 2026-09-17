import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lerEnvPublico } from "@/infrastructure/env";

/**
 * Cliente Supabase do servidor.
 *
 * Marcado com `server-only`: importá-lo de um componente cliente quebra o
 * build, o que impede vazamento acidental para o navegador.
 *
 * Fase 1 entrega apenas a estrutura. Continua usando a chave anônima: a
 * autoridade sobre os dados é do RLS, não do cliente (CLAUDE.md §12).
 * Não existe cliente `service_role` neste projeto e ele não deve ser criado
 * sem justificativa registrada (CLAUDE.md §13).
 *
 * A integração com sessão/cookies do Supabase Auth pertence à Fase 2.
 */

export function getSupabaseServerClient(): SupabaseClient {
  const env = lerEnvPublico();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
