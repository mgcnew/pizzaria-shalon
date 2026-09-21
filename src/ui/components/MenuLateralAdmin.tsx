"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENU_ADMIN } from "@/ui/navegacao";

const GRUPOS = [
  { titulo: "Operação", rotas: ["/admin", "/admin/pedidos", "/admin/caixa", "/admin/entregas"] },
  {
    titulo: "Cardápio e clientes",
    rotas: ["/admin/produtos", "/admin/clientes", "/admin/remarketing"],
  },
  {
    titulo: "Gestão",
    rotas: ["/admin/financeiro", "/admin/equipe", "/admin/relatorios"],
  },
] as const;

function IconeMenu({ href }: { href: string }) {
  const classe = "h-[18px] w-[18px]";

  if (href === "/admin") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={classe}>
        <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }

  if (href === "/admin/pedidos") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={classe}>
        <path d="M7 3.75h10v16.5l-2.5-1.6-2.5 1.6-2.5-1.6L7 20.25V3.75Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M9.5 8h5M9.5 11.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (href === "/admin/caixa" || href === "/admin/financeiro") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={classe}>
        <path d="M4 7.5h16v11H4v-11Zm2-3h12v3H6v-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M15.5 12h4.5v3h-4.5a1.5 1.5 0 0 1 0-3Z" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  if (href === "/admin/entregas") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={classe}>
        <path d="M3.5 6h11v10h-11V6Zm11 4h3.2l2.8 3v3h-6v-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <circle cx="7" cy="17.5" r="1.5" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="17.5" cy="17.5" r="1.5" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  if (href === "/admin/produtos") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={classe}>
        <path d="m4 7 8-3 8 3-8 3-8-3Zm0 0v10l8 3 8-3V7M12 10v10" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }

  if (href === "/admin/clientes" || href === "/admin/equipe") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={classe}>
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0M15 6.5a3 3 0 0 1 0 5.8M16 14a5 5 0 0 1 4.5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (href === "/admin/remarketing") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={classe}>
        <path d="M4 10v4h4l8 4V6l-8 4H4Zm4 4 1.5 5h3L11 15" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M19 9a4.5 4.5 0 0 1 0 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (href === "/admin/relatorios") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={classe}>
        <path d="M5 19V9h4v10H5Zm5 0V4h4v15h-4Zm5 0v-7h4v7h-4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={classe}>
      <path d="M12 8.25A3.75 3.75 0 1 1 12 15.75 3.75 3.75 0 0 1 12 8.25Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="m9.8 3.8.45-1.55h3.5l.45 1.55 1.45.6 1.4-.78 2.48 2.48-.78 1.4.6 1.45 1.55.45v3.5l-1.55.45-.6 1.45.78 1.4-2.48 2.48-1.4-.78-1.45.6-.45 1.55h-3.5L9.8 18.5l-1.45-.6-1.4.78-2.48-2.48.78-1.4-.6-1.45-1.55-.45V9.4l1.55-.45.6-1.45-.78-1.4 2.48-2.48 1.4.78 1.45-.6Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
    </svg>
  );
}

export function MenuLateralAdmin() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-3 py-3">
      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="mb-1.5 mt-0 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
            {grupo.titulo}
          </p>
          <div className="flex flex-col gap-1">
            {MENU_ADMIN.filter((item) => grupo.rotas.some((rota) => rota === item.href)).map((item) => {
              const ativo =
                item.href === "/admin"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={ativo ? "page" : undefined}
                  className={[
                    "motion-interactive group flex min-h-touch items-center gap-2.5 rounded-12 border px-2.5 py-2 text-[13.5px] font-semibold transition-colors",
                    ativo
                      ? "border-brand-yellow/45 bg-brand-yellow/[0.13] text-dark-ink"
                      : "border-transparent text-sidebar-ink hover:border-white/10 hover:bg-white/[0.07] hover:text-dark-ink",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "motion-interactive flex h-8 w-8 shrink-0 items-center justify-center rounded-10 transition-colors",
                      ativo
                        ? "bg-brand-yellow text-ink"
                        : "bg-white/[0.07] text-brand-yellow group-hover:bg-white/[0.11]",
                    ].join(" ")}
                  >
                    <IconeMenu href={item.href} />
                  </span>
                  <span className="min-w-0 flex-1 leading-[1.2]">{item.nome}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
