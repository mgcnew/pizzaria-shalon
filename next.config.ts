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
  // O diretório do Claude Design é referência visual, não código da aplicação.
  // Nunca deve ser compilado nem entrar no bundle (CLAUDE.md §7 e §8).
  outputFileTracingExcludes: {
    "*": ["./pizzaria-shalon-design-system/**"],
  },
  typescript: {
    // Build falha se houver erro de tipo. Não afrouxar (CLAUDE.md §36).
    ignoreBuildErrors: false,
  },
  images: {
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
