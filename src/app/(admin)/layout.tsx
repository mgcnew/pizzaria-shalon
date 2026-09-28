import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DrawerAdmin } from "@/ui/components/DrawerAdmin";
import { MenuLateralAdmin } from "@/ui/components/MenuLateralAdmin";
import { MenuUsuarioAdmin } from "@/ui/components/MenuUsuarioAdmin";
import { SeletorDeTema } from "@/ui/components/SeletorDeTema";
import { RegistrarPwaAdmin } from "@/ui/components/RegistrarPwaAdmin";
import { SinoNotificacoesAdmin } from "@/ui/notificacoes/SinoNotificacoesAdmin";
import { listarNotificacoes } from "@/application/notificacoes/acoes";
import { COOKIE_TEMA, temaDoCookie } from "@/ui/tema";
import { obterSessaoInterna } from "@/application/auth/sessao";
import { sair } from "@/app/(auth)/admin/login/actions";

export const metadata: Metadata = {
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "Shalon Admin", statusBarStyle: "default" },
  icons: { apple: [{ url: "/pwa-icon/180", sizes: "180x180", type: "image/png" }] },
};

/**
 * Shell administrativo — sidebar + cabeçalho do design aprovado.
 *
 * Preserva do protótipo: sidebar de 232px fixa no desktop, cabeçalho sticky,
 * identidade do usuário na topbar e o tema de acento vermelho
 * (`data-acento="vermelho"`), padrão do administrativo. A navegação inteiramente
 * clara, com a marca na topbar e o título compacto na sidebar, é a revisão
 * atual do shell.
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

  const temaAtual = temaDoCookie((await cookies()).get(COOKIE_TEMA)?.value);
  const notificacoes = sessao.permissoes.includes("orders.view")
    ? await listarNotificacoes()
    : null;

  return (
    <div data-acento="vermelho" className="flex min-h-screen bg-bg">
      <RegistrarPwaAdmin />
      <aside
        aria-label="Navegação principal do administrativo"
        className="sticky top-0 hidden h-screen w-sidebar shrink-0 flex-col overflow-hidden border-r border-admin-nav-border bg-admin-nav-bg shadow-[4px_0_18px_rgb(41_37_36/0.06)] lg:flex"
      >
        <div className="flex h-[53px] shrink-0 items-center border-b border-admin-nav-border bg-admin-nav-bg px-4">
          <p className="m-0 text-[10px] font-bold uppercase tracking-[0.14em] text-admin-nav-active-fg">
            Painel administrativo
          </p>
        </div>

        <MenuLateralAdmin />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-[53px] flex-wrap items-center gap-3 border-b border-admin-nav-border bg-admin-nav-bg px-4 py-1">
          <DrawerAdmin />
          <Link
            href="/admin"
            aria-label="Ir para o painel administrativo"
            className="flex min-w-[120px] flex-1 items-center self-stretch"
          >
            <Image
              src="/marca/logo-shalon.webp"
              alt="Pizzaria Shalon"
              width={512}
              height={256}
              priority
              className="h-[34px] w-auto sm:h-[38px]"
            />
          </Link>
          <SeletorDeTema atual={temaAtual} />
          {notificacoes ? <SinoNotificacoesAdmin key={sessao.appUserId} iniciais={notificacoes} appUserId={sessao.appUserId} /> : null}
          <MenuUsuarioAdmin nome={sessao.nome} papeis={sessao.papeis} acaoSair={sair} />
        </header>

        <main className="flex-1 px-4 pb-10 pt-[18px]">{children}</main>
      </div>
    </div>
  );
}
