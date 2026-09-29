import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O cliente do Realtime, carregado só quando uma tela liga o tempo real.
 *
 * O `supabase-js` é o maior pedaço de JavaScript do painel: cerca de 66 KB
 * gzip, medido no build de 29/09/2026 (D-2026-09-29-91). Importado de forma
 * estática pelo sino, que está em todas as telas, ele entrava no
 * carregamento inicial de cada página, antes de a tela ficar interativa.
 *
 * No navegador ele só serve ao Realtime, que já é assíncrono: o canal é
 * ligado num efeito, depois que a tela aparece. Com o `import()`, o pacote
 * vira um chunk à parte, baixado nesse momento e guardado em cache pelo
 * navegador nas visitas seguintes.
 *
 * A ordem que o `getSupabaseRealtimeClient` garante (sessão lida antes de
 * entrar no canal) continua a mesma: esta função só adia o carregamento.
 */
export function carregarClienteRealtime(): Promise<SupabaseClient> {
  return import("./client").then((modulo) => modulo.getSupabaseRealtimeClient());
}
