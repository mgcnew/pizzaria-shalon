"use client";

import { useEffect } from "react";
import { toPublicMessage } from "@/lib/errors";

/**
 * Fronteira de erro da aplicação (CLAUDE.md §37).
 *
 * Mostra mensagem segura ao usuário e oferece nova tentativa. O detalhe
 * interno nunca vai para a tela.
 *
 * NÃO usa `@/lib/logger`: fronteira de erro é obrigatoriamente componente de
 * cliente, e importar o logger daqui levava a lista de campos sensíveis dele
 * para dentro do bundle do navegador. Aqui só se registra o `digest`, que é
 * um identificador opaco — o erro completo fica no log do servidor.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        nivel: "error",
        ts: new Date().toISOString(),
        msg: "erro nao tratado na interface",
        digest: error.digest,
      }),
    );
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-[460px] rounded-12 border border-tdb bg-td p-4 text-center">
        <p className="m-0 font-semibold text-tdf">Não conseguimos carregar esta página</p>
        <p className="mt-1 text-[14px] text-ink-2">{toPublicMessage(error)}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-[10px] min-h-touch cursor-pointer rounded-11 border-[1.5px] border-tdb bg-transparent px-[14px] text-[14px] font-semibold text-tdf"
        >
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
