import type { Metadata } from "next";
import Link from "next/link";
import { MolduraDeAcesso } from "../../_ui/MolduraDeAcesso";
import { FormularioLogin } from "./FormularioLogin";

export const metadata: Metadata = { title: "Entrar" };

/**
 * Login da equipe interna.
 *
 * O design aprovado NÃO possui esta tela — o protótipo do Claude Design não
 * tem autenticação. Ela usa exclusivamente o design system aprovado: tokens da
 * marca, Bricolage Grotesque no título, Be Vietnam Pro no corpo, campos de
 * 50px com foco laranja e CTA com o par --cta-bg/--cta-fg (pendência A-06).
 * A moldura (marca + formulário) é a mesma das três telas de acesso.
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
    <MolduraDeAcesso
      titulo="Entrar no painel"
      subtitulo="Use o e-mail e a senha da sua conta da equipe."
      rodape={
        <>
          Cliente não precisa de login para pedir.{" "}
          <Link href="/" className="font-semibold text-ink-2">
            Ver o cardápio
          </Link>
        </>
      }
    >
      <FormularioLogin proximo={proximo ?? "/admin"} />
    </MolduraDeAcesso>
  );
}
