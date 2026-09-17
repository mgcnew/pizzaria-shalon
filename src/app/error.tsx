"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";
import { toPublicMessage } from "@/lib/errors";

/**
 * Fronteira de erro da aplicação (CLAUDE.md §37).
 *
 * Mostra mensagem segura ao usuário e oferece nova tentativa. O detalhe
 * interno vai para o log redigido, nunca para a tela.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("erro nao tratado na interface", { digest: error.digest });
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
