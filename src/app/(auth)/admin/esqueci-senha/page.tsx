import type { Metadata } from "next";
import Image from "next/image";
import { FormularioRecuperacao } from "./FormularioRecuperacao";

export const metadata: Metadata = { title: "Recuperar acesso" };

/**
 * Recuperação de senha da equipe interna.
 *
 * Mesma moldura do login — logo, cartão sobre `--surface`, acento vermelho
 * do administrativo. Nada foi inventado visualmente (A-06).
 */
export default function PaginaEsqueciSenha() {
  return (
    <main
      data-acento="vermelho"
      className="flex min-h-screen items-center justify-center bg-bg px-4 py-10"
    >
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex justify-center">
          <Image
            src="/marca/logo-shalon.webp"
            alt="Pizzaria Shalon — Tradição desde 1995"
            width={512}
            height={256}
            priority
            className="h-[56px] w-auto"
          />
        </div>

        <div className="rounded-18 border border-border-shalon bg-surface p-5">
          <h1 className="m-0 font-display text-[24px] font-extrabold leading-[1.1] text-ink">
            Recuperar acesso
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">
            Informe o e-mail da sua conta do painel.
          </p>

          <FormularioRecuperacao />
        </div>
      </div>
    </main>
  );
}
