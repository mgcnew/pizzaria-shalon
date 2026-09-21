import Image from "next/image";
import { redirect } from "next/navigation";
import { DrawerAdmin } from "@/ui/components/DrawerAdmin";
import { MenuLateralAdmin } from "@/ui/components/MenuLateralAdmin";
import { MenuUsuarioAdmin } from "@/ui/components/MenuUsuarioAdmin";
import { obterSessaoInterna } from "@/application/auth/sessao";
import { sair } from "@/app/(auth)/admin/login/actions";

/**
 * Shell administrativo — sidebar + cabeçalho do design aprovado.
 *
 * Preserva do protótipo: sidebar escura de 232px fixa no desktop, cabeçalho
 * sticky, identidade do usuário na topbar e o tema de acento vermelho
 * (`data-acento="vermelho"`), padrão do administrativo.
 *
 * DIFERENÇA DELIBERADA: o design decidia sidebar × drawer medindo
 * `window.innerWidth` em JavaScript. Aqui a decisão é CSS puro
 * (`hidden lg:flex`), conforme PI-004.
 *
 * FASE 2: a sessão real substitui o placeholder de usuário. Continuam ausentes
 * badge de contagem e toggle de loja, que dependem de regras de operação.
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
      <aside
        aria-label="Navegação principal do administrativo"
        className="sticky top-0 hidden h-screen w-sidebar shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[linear-gradient(165deg,#30241d_0%,#211813_100%)] px-3 pt-4 shadow-[8px_0_28px_rgb(0_0_0/0.12)] lg:flex"
      >
        <div className="border-b border-white/10 px-2 pb-4 pt-1">
          <Image
            src="/marca/logo-shalon.webp"
            alt="Pizzaria Shalon"
            width={512}
            height={256}
            className="h-[42px] w-auto"
          />
          <p className="mb-0 mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-yellow">
            Painel administrativo
          </p>
        </div>

        <MenuLateralAdmin />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border-shalon bg-surface px-4 py-3">
          <DrawerAdmin />
          <div className="min-w-[120px] flex-1">
            <h1 className="m-0 font-display text-[20px] font-extrabold leading-[1.15] text-ink">
              Pizzaria Shalon
            </h1>
            <p className="mt-[2px] text-[12.5px] text-muted">Administrativo</p>
          </div>
          <MenuUsuarioAdmin nome={sessao.nome} papeis={sessao.papeis} acaoSair={sair} />
        </header>

        <main className="flex-1 px-4 pb-10 pt-[18px]">{children}</main>
      </div>
    </div>
  );
}
