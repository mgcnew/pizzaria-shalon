import type { Metadata } from "next";
import Image from "next/image";
import { FormularioNovaSenha } from "./FormularioNovaSenha";

export const metadata: Metadata = {
  title: "Definir nova senha",
  // A URL carrega o token de recuperação: não deve entrar em índice.
  robots: { index: false, follow: false },
};

export default function PaginaRedefinirSenha() {
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
            Definir nova senha
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">
            Escolha a senha que você vai usar no painel.
          </p>

          <FormularioNovaSenha />
        </div>
      </div>
    </main>
  );
}
