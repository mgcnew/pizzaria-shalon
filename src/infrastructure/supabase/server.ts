import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerEnvPublico } from "@/infrastructure/env";

/**
 * Cliente Supabase do servidor, ligado aos cookies da requisição.
 *
 * `server-only`: importar isto de um componente cliente quebra o build, o que
 * impede vazamento acidental para o navegador.
 *
 * Usa exclusivamente a chave publicável. A autoridade sobre os dados é do RLS,
 * não do cliente (CLAUDE.md §12). Não existe cliente `service_role` neste
 * projeto e ele não deve ser criado sem justificativa registrada (§13).
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const env = lerEnvPublico();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component não pode escrever cookie; o middleware renova
            // a sessão. Ignorar aqui é o comportamento recomendado.
          }
        },
      },
    },
  );
}
