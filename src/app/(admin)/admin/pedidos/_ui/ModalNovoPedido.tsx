"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormaDePagamento } from "@/application/checkout/tipos";
import type { Modalidade } from "@/application/pedidos/tipos";
import { NovoPedido, type EtapaNovoPedido } from "./NovoPedido";

const NUMERO_DA_ETAPA: Record<EtapaNovoPedido, number> = {
  cliente: 1,
  itens: 2,
  pagamento: 3,
};

export function ModalNovoPedido({
  formasPorModalidade,
  fecharComVoltar = false,
}: {
  formasPorModalidade: Record<Modalidade, FormaDePagamento[]>;
  fecharComVoltar?: boolean;
}) {
  const router = useRouter();
  const painelRef = useRef<HTMLElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const [desktop, setDesktop] = useState(false);
  const [etapa, setEtapa] = useState<EtapaNovoPedido>("cliente");
  const fechar = useCallback(() => {
    if (fecharComVoltar) router.back();
    else router.push("/admin/pedidos");
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

  return (
    <div className="fixed inset-0 z-70 flex overflow-y-auto bg-bg lg:items-center lg:justify-center lg:bg-transparent lg:p-6">
      <button
        type="button"
        aria-label="Fechar novo pedido"
        onClick={fechar}
        className="motion-backdrop-in absolute inset-0 hidden cursor-default border-0 bg-[var(--shalon-scrim-sheet)] lg:block"
        tabIndex={-1}
      />

      <section
        ref={painelRef}
        role={desktop ? "dialog" : undefined}
        aria-modal={desktop ? true : undefined}
        aria-labelledby="modal-novo-pedido-titulo"
        className="motion-modal-in relative flex w-full flex-col bg-bg lg:max-h-[88vh] lg:max-w-[760px] lg:overflow-hidden lg:rounded-18 lg:border lg:border-border-shalon lg:bg-surface lg:shadow-[0_22px_70px_rgb(30_24_20/0.26)]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border-shalon bg-surface px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2
              id="modal-novo-pedido-titulo"
              className="m-0 font-display text-[20px] font-extrabold text-ink"
            >
              Novo pedido
            </h2>
            <p className="mb-0 mt-0.5 text-[12.5px] text-muted">
              WhatsApp, telefone, balcão, iFood ou outro canal
            </p>
          </div>
          <span className="hidden whitespace-nowrap rounded-pill bg-tn px-2.5 py-1 text-[11px] font-semibold text-muted sm:inline-flex">
            Etapa {NUMERO_DA_ETAPA[etapa]} de 3
          </span>
          <button
            ref={fecharRef}
            type="button"
            aria-label="Fechar"
            onClick={fechar}
            className="flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-11 border border-border-shalon bg-surface text-[22px] leading-none text-ink-2 hover:border-brand-orange hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="scrollbar-subtle min-h-0 overflow-y-auto bg-bg p-5">
          <NovoPedido
            formasPorModalidade={formasPorModalidade}
            emModal
            etapaAtual={etapa}
            aoMudarEtapa={setEtapa}
          />
        </div>
      </section>
    </div>
  );
}
