"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase do navegador.
 *
 * Só a chave publicável chega aqui — e ela não concede nada por si: todo
 * acesso passa por RLS (CLAUDE.md §12 e §13).
 */
let cache: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (cache) return cache;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Configuração de ambiente ausente.");
  }
  cache = createBrowserClient(url, key);
  return cache;
}
