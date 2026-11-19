import type { NextConfig } from "next";

/** Host do projeto Supabase, quando configurado. Vazio no build sem ambiente. */
const hostDoSupabase = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{
      source: "/sw-admin.js",
      headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
    }];
  },
  /**
   * COMPATIBILIDADE DA ROTA ANTIGA DO CAIXA — consolidação PDV × Caixa.
   *
   * 09-PDV-FRENTE-DE-CAIXA.md §4.3 · CLAUDE.md §51
   *
   * `/admin/caixa` foi absorvida por `/admin/pdv`, que passou a ser a única
   * interface operacional de PDV + Caixa. A rota antiga não renderiza mais
   * nada: existe só para que um favorito ou uma aba esquecida num navegador de
   * balcão não caiam em 404 no meio do expediente.
   *
   * `permanent: false` (307) DE PROPÓSITO. Um 308 fica gravado no navegador e
   * sobrevive à remoção desta entrada — quem tivesse aberto a rota uma vez
   * nunca mais conseguiria acessá-la, mesmo depois de a compatibilidade sair.
   * 307 é revalidado a cada visita, então tirar esta entrada é decisão
   * reversível, que é o que "temporária" exige.
   *
   * Redirects do `next.config` são avaliados ANTES do sistema de arquivos, e é
   * por isso que `app/(admin)/admin/caixa/` pôde ser removido inteiro: não há
   * página por baixo competindo com o redirect.
   */
  async redirects() {
    return [
      { source: "/admin/caixa", destination: "/admin/pdv", permanent: false },
      /**
       * ENDEREÇO ANTIGO → DOMÍNIO PRÓPRIO (D-2026-11-19-187).
       *
       * Cupons impressos e links compartilhados com `pizzariashalon.vercel.app`
       * continuam valendo: o caminho e os parâmetros vão junto. Só o host exato
       * é redirecionado; as prévias da Vercel têm outros hosts e não são afetadas.
       *
       * `permanent: true` (308) DE PROPÓSITO, ao contrário do caixa acima: a
       * mudança de domínio não tem volta prevista, e o 308 é o que buscadores e
       * navegadores entendem como "mudou de endereço".
       */
      {
        source: "/:caminho*",
        has: [{ type: "host", value: "pizzariashalon.vercel.app" }],
        destination: "https://pizzariashalon.com.br/:caminho*",
        permanent: true,
      },
    ];
  },
  // O diretório do Claude Design é referência visual, não código da aplicação.
  // Nunca deve ser compilado nem entrar no bundle (CLAUDE.md §7 e §8).
  outputFileTracingExcludes: {
    "*": ["./pizzaria-shalon-design-system/**"],
  },
  typescript: {
    // Build falha se houver erro de tipo. Não afrouxar (CLAUDE.md §36).
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      // O envio de imagem do catálogo aceita até 8 MB (03 §24), mas o limite
      // padrão de corpo de Server Action no Next é 1 MB — e ele falha com
      // "Body exceeded 1 MB limit", mensagem que não diz nada à Owner.
      // Encontrado com uma foto real de produto na Fase 3.
      bodySizeLimit: "9mb",
    },
  },
  images: {
    // Sem o otimizador da Vercel (12/11/2026): a cota gratuita acabou e ele
    // passou a responder 402, derrubando TODAS as imagens do site. As fotos
    // do catálogo já chegam ao Storage redimensionadas e em WebP pelo
    // pipeline com `sharp` (03 §24), então servimos o arquivo direto.
    // Reverter só junto com a decisão de pagar a otimização.
    unoptimized: true,
    // Imagens do catálogo ficam no Storage do Supabase (CLAUDE.md §35: nunca
    // Base64 no banco). O host é lido do ambiente, não fixado no código —
    // dev e produção são projetos diferentes (pendência A-11).
    remotePatterns: hostDoSupabase
      ? [{ protocol: "https", hostname: hostDoSupabase, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  // Next 16 removeu o lint embutido no build. O ESLint roda como passo
  // próprio (`npm run lint`) e faz parte do `npm run check`.
};

export default nextConfig;
