"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { contarPedidosAbertos } from "@/application/pedidos/acoes";
import { carregarClienteRealtime } from "@/infrastructure/supabase/realtimeSobDemanda";
import { useFecharAoNavegar } from "@/ui/hooks/useFecharAoNavegar";
import { barraInferiorOculta, rotaBloqueada } from "@/ui/navegacao";
import { IndicadorDeNavegacao } from "./IndicadorDeNavegacao";
import { IconeMenu, MenuLateralAdmin } from "./MenuLateralAdmin";

/** Vários pedidos mudando juntos viram uma contagem só. */
const JANELA_DA_CONTAGEM_MS = 1_500;

/**
 * Contador de pedidos em aberto, só no celular e só para quem vê pedidos.
 *
 * O evento avisa; quem conta é o servidor, sob o RLS de `orders`. Ao religar o
 * canal ou voltar à aba, conta de novo: o Realtime não reenvia o que aconteceu
 * com a conexão caída.
 */
function usePedidosAbertos(ativo: boolean): number | null {
  const [abertos, setAbertos] = useState<number | null>(null);

  useEffect(() => {
    if (!ativo || !window.matchMedia("(max-width: 1023.98px)").matches) return;

    let vivo = true;
    let espera: number | undefined;
    let limpar: (() => void) | undefined;

    const contar = () => {
      void contarPedidosAbertos()
        .then((total) => {
          if (vivo && total !== null) setAbertos(total);
        })
        .catch(() => undefined);
    };
    const agendar = () => {
      window.clearTimeout(espera);
      espera = window.setTimeout(contar, JANELA_DA_CONTAGEM_MS);
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible") contar();
    };

    void carregarClienteRealtime()
      .then((supabase) => {
        if (!vivo) return;
        const canal = supabase
          .channel("barra-inferior-pedidos")
          .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, agendar)
          .subscribe((estado) => {
            if (vivo && estado === "SUBSCRIBED") contar();
          });
        limpar = () => void supabase.removeChannel(canal);
      })
      .catch(contar);

    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
      document.removeEventListener("visibilitychange", aoVoltar);
      limpar?.();
    };
  }, [ativo]);

  return abertos;
}

function Aba({
  href,
  nome,
  ativa,
  contador = null,
}: {
  href: string;
  nome: string;
  ativa: boolean;
  contador?: number | null;
}) {
  const rotulo = contador ? `${nome}, ${contador} em aberto` : nome;
  return (
    <Link
      href={href}
      aria-label={rotulo}
      aria-current={ativa ? "page" : undefined}
      className={[
        "relative flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] text-[11px] leading-none no-underline",
        ativa ? "font-bold text-admin-nav-active-fg" : "font-medium text-admin-nav-muted",
      ].join(" ")}
    >
      <span className="relative flex [&>svg]:h-[22px] [&>svg]:w-[22px]">
        <IconeMenu href={href} />
        {contador ? (
          <span
            aria-hidden="true"
            className="absolute -right-[11px] -top-[7px] flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-brand-red px-1 text-[11px] font-bold tabular-nums text-white"
          >
            {contador > 99 ? "99+" : contador}
          </span>
        ) : null}
      </span>
      {nome}
      <IndicadorDeNavegacao forma="traco" />
    </Link>
  );
}

/**
 * Navegação do painel no celular (D-2026-10-30-178). Substitui o menu ☰: os
 * destinos do dia a dia ficam na barra e o restante, na folha "Mais". Lançar
 * pedido fica a um toque, no centro. No desktop segue o menu lateral.
 *
 * Some nas telas com botões próprios no rodapé (`barraInferiorOculta`). O
 * botão + só aparece para quem tem `orders.create_manual`; quem decide de
 * verdade continua sendo o banco.
 */
export function BarraInferiorAdmin({
  permissoes,
  seletorDeTema,
}: {
  permissoes: readonly string[];
  seletorDeTema: ReactNode;
}) {
  const pathname = usePathname();
  const [aberta, setAberta] = useState(false);
  const aoClicarEmLink = useFecharAoNavegar(() => setAberta(false));

  const podePedidos = !rotaBloqueada("/admin/pedidos", permissoes);
  const podeEntregas = !rotaBloqueada("/admin/entregas", permissoes);
  const podeLancar = permissoes.includes("orders.create_manual");
  const abertos = usePedidosAbertos(podePedidos);

  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberta(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberta]);

  if (barraInferiorOculta(pathname)) return null;

  const naBarra = [
    "/admin",
    ...(podePedidos ? ["/admin/pedidos"] : []),
    ...(podeEntregas ? ["/admin/entregas"] : []),
  ];
  const estaEm = (rota: string) => pathname === rota || pathname.startsWith(`${rota}/`);
  const emMais = !aberta && !naBarra.some((r) => (r === "/admin" ? pathname === r : estaEm(r)));

  return (
    <>
      {/* Reserva o lugar da barra: o fim de cada página não fica coberto. */}
      <div aria-hidden="true" className="h-[calc(64px+env(safe-area-inset-bottom))] shrink-0 lg:hidden" />

      <nav
        aria-label="Navegação principal do administrativo"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-admin-nav-border bg-admin-nav-bg px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgb(41_37_36/0.06)] lg:hidden"
      >
        <Aba href="/admin" nome="Início" ativa={pathname === "/admin"} />
        {podePedidos ? (
          <Aba href="/admin/pedidos" nome="Pedidos" ativa={estaEm("/admin/pedidos")} contador={abertos} />
        ) : null}

        {podeLancar ? (
          <Link
            href="/admin/pedidos/novo"
            aria-label="Novo pedido"
            className="relative flex min-w-0 flex-1 flex-col items-center justify-end gap-[3px] pb-[9px] text-[11px] font-bold leading-none text-ink no-underline"
          >
            <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-pill border-4 border-admin-nav-bg bg-cta text-cta-fg shadow-[0_5px_16px_rgb(30_24_20/0.22)]">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[26px] w-[26px]">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </span>
            Novo
            <IndicadorDeNavegacao forma="traco" />
          </Link>
        ) : null}

        {podeEntregas ? (
          <Aba href="/admin/entregas" nome="Entregas" ativa={estaEm("/admin/entregas")} />
        ) : null}

        <button
          type="button"
          aria-expanded={aberta}
          aria-haspopup="dialog"
          onClick={() => setAberta(true)}
          className={[
            "flex min-h-[56px] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-[3px] border-0 bg-transparent text-[11px] leading-none",
            aberta || emMais ? "font-bold text-admin-nav-active-fg" : "font-medium text-admin-nav-muted",
          ].join(" ")}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Mais
        </button>
      </nav>

      {aberta ? (
        <div
          className="fixed inset-0 z-80 flex items-end bg-[var(--shalon-scrim-drawer)] lg:hidden"
          onClick={() => setAberta(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mais opções"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-22 border-t border-admin-nav-border bg-admin-nav-bg pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex min-h-[56px] shrink-0 items-center justify-between border-b border-admin-nav-border px-4">
              <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">Mais</h2>
              <button
                type="button"
                aria-label="Fechar"
                autoFocus
                onClick={() => setAberta(false)}
                className="min-h-touch min-w-touch cursor-pointer rounded-pill border-0 bg-transparent text-[22px] leading-none text-admin-nav-text"
              >
                ×
              </button>
            </div>

            <MenuLateralAdmin aoClicarEmLink={aoClicarEmLink} permissoes={permissoes} excluir={naBarra} />

            <div className="flex min-h-[60px] shrink-0 items-center justify-between border-t border-admin-nav-border px-4">
              <span className="text-[13.5px] font-semibold text-admin-nav-text">Tema</span>
              {seletorDeTema}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
