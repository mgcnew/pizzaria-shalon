import Image from "next/image";
import Link from "next/link";
import { MENU_ADMIN } from "@/ui/navegacao";
import { DrawerAdmin } from "@/ui/components/DrawerAdmin";

/**
 * Shell administrativo — sidebar + cabeçalho do design aprovado.
 *
 * Preserva do protótipo: sidebar escura de 232px fixa no desktop, cabeçalho
 * sticky com título e contexto da página, e o tema de acento vermelho
 * (`data-acento="vermelho"`), que é o padrão do administrativo.
 *
 * DIFERENÇA DELIBERADA EM RELAÇÃO AO PROTÓTIPO: o design decidia
 * sidebar × drawer medindo `window.innerWidth` em JavaScript. Aqui a decisão
 * é CSS puro (`hidden lg:flex`), conforme PI-004 — mesmo resultado visual,
 * sem medir viewport em JS, sem flash de layout e sem problema de hidratação.
 *
 * FASE 1: sem dados reais, sem badge de contagem, sem troca de perfil e sem
 * toggle de loja — tudo isso depende de Auth/RBAC (Fase 2) e de regras de
 * operação (Fase 3+).
 */
export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <div data-acento="vermelho" className="flex min-h-screen bg-bg">
      <nav
        aria-label="Navegação principal do administrativo"
        className="sticky top-0 hidden h-screen w-sidebar shrink-0 flex-col gap-1 overflow-y-auto bg-sidebar px-3 py-4 lg:flex"
      >
        <div className="flex items-center gap-[10px] px-2 pb-4 pt-1">
          <Image
            src="/marca/logo-shalon.png"
            alt="Pizzaria Shalon"
            width={1774}
            height={887}
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
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border-shalon bg-surface px-4 py-3">
          <DrawerAdmin />
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
