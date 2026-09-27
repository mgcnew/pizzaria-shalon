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
  const { url, key } = lerAmbiente();
  cache = createBrowserClient(url, key);
  return cache;
}

function lerAmbiente(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Configuração de ambiente ausente.");
  }
  return { url, key };
}

/**
 * O MESMO CLIENTE, com o Realtime falando pela sessão do operador.
 *
 * Fase 12, Etapa 10 · CLAUDE.md §12, §40 · 03-RLS-RBAC-SEGURANCA.md §5
 *
 * O DEFEITO QUE ISTO CORRIGE, e ele é de infraestrutura, não do PDV.
 *
 * O socket do Realtime carrega um JWT próprio, e é por ele que o servidor
 * decide, POR RLS, quais linhas viram evento para cada assinante. O
 * `supabase-js` atualiza esse token sozinho ao ouvir `INITIAL_SESSION`,
 * `SIGNED_IN` e `TOKEN_REFRESHED` — mas isso acontece **depois** que a sessão
 * é lida do cookie, e um `subscribe()` disparado num `useEffect` chega antes.
 *
 * Quem entra no canal primeiro registra a assinatura com o token que havia
 * naquele instante: a chave `anon`. E `anon` não tem policy de leitura em
 * `orders`, `cash_sessions` nem `cash_movements` — então **toda linha é
 * filtrada e nenhum evento chega**. O canal segue dizendo `SUBSCRIBED`.
 *
 * Medido no DEV em 27/09/2026, em `realtime.subscription`:
 *
 *     entity=orders  claims_role=anon  sub=null     ← antes
 *     entity=orders  claims_role=authenticated  sub=28e96e91-…  ← depois
 *
 * Era assim desde a Fase 5. A Central de Pedidos anunciava "Atualizando em
 * tempo real" e nunca recebeu um evento — a cozinha via lista velha achando
 * que via lista viva.
 *
 * A FALHA ERA FECHADA, e isso importa: `anon` não enxergava nada, então nunca
 * houve vazamento. Faltou entrega, não sobrou acesso.
 *
 * O QUE ESTA FUNÇÃO NÃO FAZ: não cria segundo cliente, não implementa
 * autenticação própria, não mexe em RLS, policy, grant ou permissão. Ela só
 * garante a ORDEM — sessão lida antes de entrar no canal — e mantém o token
 * acompanhando renovação e logout.
 */
let autenticacaoDoRealtime: Promise<SupabaseClient> | null = null;

export function getSupabaseRealtimeClient(): Promise<SupabaseClient> {
  if (autenticacaoDoRealtime) return autenticacaoDoRealtime;

  autenticacaoDoRealtime = (async () => {
    const supabase = getSupabaseBrowserClient();

    /*
     * O LISTENER PRIMEIRO, e registrado UMA VEZ só — a promessa em cache
     * garante isso. Ele cobre o resto da vida da sessão:
     *
     *  - `TOKEN_REFRESHED`: o token novo vai para o socket sem religar canal,
     *    então renovação não duplica assinatura nem derruba a fila;
     *  - `SIGNED_OUT`: `setAuth(null)` devolve o socket à chave `anon`, e o
     *    operador que saiu para de receber o que não pode mais ver. Sem isto
     *    ficaria token autenticado residual num navegador já deslogado.
     */
    supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === "SIGNED_OUT") {
        /*
         * A CHAVE PUBLICÁVEL DE VOLTA, EXPLICITAMENTE — e não `setAuth(null)`.
         *
         * Medido na versão instalada (`realtime-js` 2.116.0): sem um callback
         * `accessToken` configurado, `setAuth(null)` cai em
         * `tokenToSend = this.accessTokenValue` e **reenvia o token que já
         * estava lá**. Não limpa nada. O `SIGNED_OUT` do próprio `supabase-js`
         * chama exatamente `setAuth()` e tem o mesmo destino.
         *
         * Consequência sem esta linha: depois do logout o socket seguiria
         * carregando a identidade de quem saiu até o token expirar — e um
         * navegador de balcão continuaria recebendo pedido e caixa de uma
         * sessão encerrada. Devolver a chave publicável recoloca o socket
         * como `anon`, que não tem policy de leitura em nenhuma das três
         * tabelas e portanto não recebe linha alguma.
         */
        void supabase.realtime.setAuth(lerAmbiente().key);
        return;
      }
      if (sessao?.access_token) {
        void supabase.realtime.setAuth(sessao.access_token);
      }
    });

    /*
     * E SÓ ENTÃO A SESSÃO ATUAL. É este `await` que desfaz a corrida: quem
     * pede este cliente não entra em canal nenhum antes de o token estar no
     * socket.
     *
     * Sem sessão — visitante do cardápio público — o socket continua `anon`,
     * que é exatamente o certo: ele não deve receber linha protegida nenhuma.
     */
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      await supabase.realtime.setAuth(data.session.access_token);
    }

    return supabase;
  })();

  return autenticacaoDoRealtime;
}
