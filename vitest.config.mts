import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` existe para EXPLODIR se um módulo de servidor for
      // importado por Client Component. No Next isso funciona pela condição
      // de export `react-server`, que resolve para o `empty.js` do próprio
      // pacote; o Vitest não aplica essa condição e cairia no `index.js`, que
      // lança. Apontar para o mesmo `empty.js` reproduz o comportamento do
      // servidor — a guarda continua valendo no código de produção, e o teste
      // consegue exercitar provedores como o do HERE, que antes ficavam sem
      // cobertura justamente por causa disso.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
});
