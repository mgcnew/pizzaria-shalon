import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      // Referência visual do Claude Design — protótipo, não código de produção.
      // Não deve ser lintado nem transportado (CLAUDE.md §8).
      "pizzaria-shalon-design-system/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // CLAUDE.md §36: evitar `any` como solução rápida.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // CLAUDE.md §37 e 03-RLS-RBAC-SEGURANCA.md §31: logging controlado,
      // sem vazar dados sensíveis em console.log.
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
];

export default eslintConfig;
