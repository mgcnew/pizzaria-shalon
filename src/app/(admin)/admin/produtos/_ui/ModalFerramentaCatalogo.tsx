"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ModalFerramentaCatalogo({
  titulo,
  children,
  variante = "ferramenta",
}: {
  titulo: string;
  children: ReactNode;
  variante?: "ferramenta" | "formulario";
}) {
  const router = useRouter();
  const painelRef = useRef<HTMLElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const consulta = window.matchMedia("(min-width: 1024px)");
    const sincronizar = () => setDesktop(consulta.matches);
    sincronizar();
    consulta.addEventListener("change", sincronizar);
    return () => consulta.removeEventListener("change", sincronizar);
  }, []);

  useEffect(() => {
    if (!desktop) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fecharRef.current?.focus();

    function aoPressionarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        router.push("/admin/produtos");
        return;
      }

      if (evento.key !== "Tab" || !painelRef.current) return;
      const focaveis = Array.from(
        painelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const primeiro = focaveis[0];
      const ultimo = focaveis.at(-1);

      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo?.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro?.focus();
      }
    }

    document.addEventListener("keydown", aoPressionarTecla);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoPressionarTecla);
    };
  }, [desktop, router]);

  return (
    <div className="lg:fixed lg:inset-0 lg:z-70 lg:flex lg:items-center lg:justify-center lg:p-6">
      <button
        type="button"
        aria-label="Fechar janela"
        onClick={() => router.push("/admin/produtos")}
        className="absolute inset-0 hidden cursor-default border-0 bg-[var(--shalon-scrim-sheet)] lg:block"
        tabIndex={-1}
      />

      <section
        ref={painelRef}
        role={desktop ? "dialog" : undefined}
        aria-modal={desktop ? true : undefined}
        aria-labelledby="ferramenta-catalogo-titulo"
        className={[
          "relative flex w-full flex-col bg-bg lg:overflow-hidden lg:rounded-18 lg:border lg:border-border-shalon lg:bg-surface lg:shadow-[0_22px_70px_rgb(30_24_20/0.26)]",
          variante === "formulario"
            ? "lg:max-h-[86vh] lg:max-w-[760px]"
            : "lg:max-h-[calc(100vh-48px)] lg:max-w-[1040px]",
        ].join(" ")}
      >
        <header className="mb-4 flex items-center gap-3 border-b border-border-shalon pb-3 lg:mb-0 lg:shrink-0 lg:bg-surface lg:px-5 lg:py-4">
          <Link
            href="/admin/produtos"
            className="inline-flex min-h-touch items-center gap-2 rounded-10 px-2 text-[13px] font-semibold text-ink-2 hover:bg-tn hover:text-ink lg:hidden"
          >
            <span aria-hidden="true">←</span>
            Produtos
          </Link>
          <h2
            id="ferramenta-catalogo-titulo"
            className="m-0 flex-1 font-display text-[20px] font-extrabold text-ink"
          >
            {titulo}
          </h2>
          <button
            ref={fecharRef}
            type="button"
            aria-label="Fechar"
            onClick={() => router.push("/admin/produtos")}
            className="hidden min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-11 border border-border-shalon bg-surface text-[22px] leading-none text-ink-2 hover:border-brand-orange hover:text-ink lg:flex"
          >
            ×
          </button>
        </header>

        <div
          className={[
            "lg:overflow-y-auto lg:p-5",
            variante === "formulario" ? "lg:bg-surface" : "lg:bg-bg",
          ].join(" ")}
        >
          {children}
        </div>
      </section>
    </div>
  );
}
