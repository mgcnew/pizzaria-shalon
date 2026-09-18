import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FormularioLogin } from "./FormularioLogin";

export const metadata: Metadata = { title: "Entrar" };

/**
 * Login da equipe interna.
 *
 * O design aprovado NÃO possui esta tela — o protótipo do Claude Design não
 * tem autenticação. Ela foi montada usando exclusivamente o design system
 * aprovado: tokens da marca, Bricolage Grotesque no título, Be Vietnam Pro no
 * corpo, cartão sobre --surface com borda --border e raio 18, campos de 50px
 * com foco laranja, CTA com o par --cta-bg/--cta-fg e alerta na família tonal
 * de perigo. Nada foi inventado visualmente (pendência A-06).
 *
 * Fica fora do shell administrativo (sem sidebar), por isso está no grupo
 * de rotas (auth).
 */
export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string }>;
}) {
  const { proximo } = await searchParams;

  return (
    // O login pertence à experiência administrativa, cujo tema de acento
    // padrão no design aprovado é o vermelho.
    <main
      data-acento="vermelho"
      className="flex min-h-screen items-center justify-center bg-bg px-4 py-10"
    >
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex justify-center">
          <Image
            src="/marca/logo-shalon.png"
            alt="Pizzaria Shalon — Tradição desde 1995"
            width={512}
            height={256}
            priority
            className="h-[56px] w-auto"
          />
        </div>

        <div className="rounded-18 border border-border-shalon bg-surface p-5">
          <h1 className="m-0 font-display text-[24px] font-extrabold leading-[1.1] text-ink">
            Painel da Shalon
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">
            Acesso restrito à equipe interna.
          </p>

          <FormularioLogin proximo={proximo ?? "/admin"} />
        </div>

        <p className="mt-4 text-center text-[12.5px] text-muted">
          Cliente não precisa de login para pedir.{" "}
          <Link href="/" className="font-semibold">
            Ver o cardápio
          </Link>
        </p>
      </div>
    </main>
  );
}
