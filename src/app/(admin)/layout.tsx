import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MENU_ADMIN } from "@/ui/navegacao";
import { DrawerAdmin } from "@/ui/components/DrawerAdmin";
import { obterSessaoInterna } from "@/application/auth/sessao";
import { sair } from "@/app/(auth)/admin/login/actions";

/**
 * Shell administrativo — sidebar + cabeçalho do design aprovado.
 *
 * Preserva do protótipo: sidebar escura de 232px fixa no desktop, cabeçalho
 * sticky, bloco de identificação do usuário no rodapé da sidebar e o tema de
 * acento vermelho (`data-acento="vermelho"`), padrão do administrativo.
 *
 * DIFERENÇA DELIBERADA: o design decidia sidebar × drawer medindo
 * `window.innerWidth` em JavaScript. Aqui a decisão é CSS puro
 * (`hidden lg:flex`), conforme PI-004.
 *
 * FASE 2: a sessão real substitui o placeholder de usuário. Continuam ausentes
 * badge de contagem e toggle de loja, que dependem de regras de operação
 * (Fase 3+). A troca de perfil do protótipo NÃO foi implementada: perfil não
 * se troca por clique, decorre do papel atribuído (CLAUDE.md §14).
 */
export default async function LayoutAdmin({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessao = await obterSessaoInterna();

  // O middleware já barra quem não está autenticado. Esta verificação cobre
  // o caso de estar autenticado SEM ser usuário interno ativo — por exemplo,
  // acesso revogado enquanto a sessão seguia aberta (§5.4).
  if (!sessao) redirect("/admin/login");

  return (
    <div data-acento="vermelho" className="flex min-h-screen bg-bg">
      <nav
        aria-label="Navegação principal do administrativo"
        className="sticky top-0 hidden h-screen w-sidebar shrink-0 flex-col gap-1 overflow-y-auto bg-sidebar px-3 py-4 lg:flex"
      >
        <div className="flex items-center gap-[10px] px-2 pb-4 pt-1">
          <Image
            src="/marca/logo-shalon.webp"
            alt="Pizzaria Shalon"
            width={512}
            height={256}
            className="h-[38px] w-auto"
          />
        </div>

        {MENU_ADMIN.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-touch items-center gap-[10px] rounded-10 px-3 text-[14px] font-semibold text-sidebar-ink hover:bg-white/10"
          >
            <span className="flex-1">{item.nome}</span>
          </Link>
        ))}

        <div className="mt-auto border-t border-white/12 px-[10px] pb-1 pt-3">
          <p className="m-0 text-[13px] font-semibold text-sidebar-ink">
            {sessao.nome}
          </p>
          <p className="mt-[2px] text-[12px] text-white/45">
            {sessao.papeis.join(" · ") || "Sem papel atribuído"}
          </p>
          <form action={sair}>
            <button
              type="submit"
              className="mt-2 min-h-[36px] cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-semibold text-white/60 hover:text-white"
            >
              Sair
            </button>
          </form>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border-shalon bg-surface px-4 py-3">
          <DrawerAdmin nome={sessao.nome} papeis={sessao.papeis} />
          <div className="min-w-[120px] flex-1">
            <h1 className="m-0 font-display text-[20px] font-extrabold leading-[1.15] text-ink">
              Pizzaria Shalon
            </h1>
            <p className="mt-[2px] text-[12.5px] text-muted">Administrativo</p>
          </div>
        </header>

        <main className="flex-1 px-4 pb-10 pt-[18px]">{children}</main>
      </div>
    </div>
  );
}
