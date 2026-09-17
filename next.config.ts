import type { NextConfig } from "next";

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
  // Next 16 removeu o lint embutido no build. O ESLint roda como passo
  // próprio (`npm run lint`) e faz parte do `npm run check`.
};

export default nextConfig;
