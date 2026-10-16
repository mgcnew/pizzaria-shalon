"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export function ModalFerramentaCatalogo({
  titulo,
  children,
  abas,
  variante = "ferramenta",
  tamanho = "amplo",
  fecharComVoltar = false,
}: {
  titulo: string;
  children: ReactNode;
  /** Navegação entre seções, logo abaixo do título (ex.: "Gerenciar cardápio"). */
  abas?: ReactNode;
  variante?: "ferramenta" | "formulario";
  tamanho?: "compacto" | "regular" | "medio" | "amplo";
  fecharComVoltar?: boolean;
}) {
  const router = useRouter();
  const painelRef = useRef<HTMLElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const [desktop, setDesktop] = useState(false);
  const larguraDesktop = {
    compacto: "lg:max-w-[680px]",
    regular: "lg:max-w-[760px]",
    medio: "lg:max-w-[840px]",
    amplo: "lg:max-w-[1040px]",
  }[tamanho];
  const fechar = useCallback(() => {
    if (fecharComVoltar) router.back();
    else router.push("/admin/produtos");
  }, [fecharComVoltar, router]);

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
        fechar();
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
  }, [desktop, fechar]);

  // Com as abas numa faixa rolável (celular), a ativa pode nascer fora da
  // tela: traz para a vista, sem mexer na rolagem da página.
  // Só quando a aba ATIVA muda — rerenderizar não pode puxar a rolagem.
  const ultimaAbaAtiva = useRef<string | null>(null);
  useEffect(() => {
    if (!abas) return;
    const ativa = painelRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const chave = ativa?.getAttribute("href") ?? null;
    if (!ativa || chave === ultimaAbaAtiva.current) return;
    ultimaAbaAtiva.current = chave;
    ativa.scrollIntoView({ block: "nearest", inline: "center" });
  });

  return (
    <div className="fixed inset-0 z-70 flex items-start overflow-y-auto bg-bg lg:items-center lg:justify-center lg:bg-transparent lg:p-6">
      <button
        type="button"
        aria-label="Fechar janela"
        onClick={fechar}
        className="motion-backdrop-in absolute inset-0 hidden cursor-default border-0 bg-[var(--shalon-scrim-sheet)] lg:block"
        tabIndex={-1}
      />

      <section
        ref={painelRef}
        role={desktop ? "dialog" : undefined}
        aria-modal={desktop ? true : undefined}
        aria-labelledby="ferramenta-catalogo-titulo"
        className={[
          "motion-modal-in relative flex w-full flex-col bg-bg lg:overflow-hidden lg:rounded-18 lg:border lg:border-border-shalon lg:bg-surface lg:shadow-[0_22px_70px_rgb(30_24_20/0.26)]",
          variante === "formulario"
            ? "lg:max-h-[86vh] lg:max-w-[760px]"
            : `lg:max-h-[calc(100vh-48px)] ${larguraDesktop}`,
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
            onClick={fechar}
            className="hidden min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-11 border border-border-shalon bg-surface text-[22px] leading-none text-ink-2 hover:border-brand-orange hover:text-ink lg:flex"
          >
            ×
          </button>
        </header>

        {abas ? (
          <div className="mb-3 border-b border-border-shalon pb-3 lg:mb-0 lg:shrink-0 lg:bg-surface lg:px-5 lg:py-3">
            {abas}
          </div>
        ) : null}

        <div
          className={[
            "scrollbar-subtle lg:min-h-0 lg:overflow-y-auto lg:p-5",
            variante === "formulario" ? "lg:bg-surface" : "lg:bg-bg",
          ].join(" ")}
        >
          {children}
        </div>
      </section>
    </div>
  );
}
