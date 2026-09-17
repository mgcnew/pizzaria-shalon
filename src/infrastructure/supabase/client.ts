import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lerEnvPublico } from "@/infrastructure/env";

/**
 * Cliente Supabase do navegador.
 *
 * Fase 1 entrega apenas a ESTRUTURA: nenhum projeto real está conectado e
 * nenhuma consulta é feita. Tabelas, RLS, RPCs e Auth são escopo da Fase 2
 * (05-PLANO-IMPLEMENTACAO.md §6) e não devem ser antecipados.
 *
 * Este cliente usa exclusivamente a chave anônima pública. A `service_role`
 * nunca entra aqui nem em qualquer código que chegue ao navegador
 * (CLAUDE.md §13).
 */

let cache: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (cache) return cache;
  const env = lerEnvPublico();
  cache = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return cache;
}
