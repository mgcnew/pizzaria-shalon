"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseRealtimeClient } from "@/infrastructure/supabase/client";
import {
  listarNotificacoes,
  marcarNotificacaoLida,
  type NotificacaoAdministrativa,
  type ResumoNotificacoes,
} from "@/application/notificacoes/acoes";
import { ativarSom, desativarSom, somAtivo, tocarAlerta } from "./som";
import {
  AREAS_ALERTA,
  definirAlerta,
  lerAreasSalvas,
  type AreaAlerta,
} from "@/domain/notificacoes/alertas";

const CHAVE_ULTIMO_SOM = "shalon-admin-ultimo-alerta-sonoro";

function preferenciaSalva(chave: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(chave) === "1";
  } catch {
    return false;
  }
}

function areasSalvas(chave: string): AreaAlerta[] {
  if (typeof window === "undefined") return ["atendimento"];
  try {
    return lerAreasSalvas(localStorage.getItem(chave));
  } catch {
    return ["atendimento"];
  }
}

export function SinoNotificacoesAdmin({
  iniciais,
  appUserId,
}: {
  iniciais: ResumoNotificacoes;
  appUserId: string;
}) {
  const router = useRouter();
  const chaveSom = `shalon-admin-som:${appUserId}`;
  const chaveAreas = `shalon-admin-areas-sonoras:${appUserId}`;
  const [resumo, setResumo] = useState(iniciais);
  const [aberto, setAberto] = useState(false);
  const [somPreferido, setSomPreferido] = useState(() => preferenciaSalva(chaveSom));
  const [somLigado, setSomLigado] = useState(false);
  const [areasSonoras, setAreasSonoras] = useState<AreaAlerta[]>(() => areasSalvas(chaveAreas));
  const [conectado, setConectado] = useState(false);
  const [abrindoPedido, setAbrindoPedido] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const somPreferidoAtual = useRef(somPreferido);
  const areasSonorasAtuais = useRef(areasSonoras);

  const naoLidas = resumo.unread_count;

  useEffect(() => {
    if (!somPreferido && somAtivo()) void desativarSom();
  }, [somPreferido]);

  useEffect(() => {
    if (!somPreferido || somLigado) return;
    let tentando = false;
    let vivo = true;

    // O navegador não permite prometer áudio no carregamento. A escolha fica
    // salva e o contexto é retomado no primeiro gesto dentro do painel.
    const retomar = () => {
      if (tentando || !somPreferidoAtual.current) return;
      tentando = true;
      void ativarSom().then((ativo) => {
        tentando = false;
        if (!vivo) return;
        if (!somPreferidoAtual.current) {
          if (ativo) void desativarSom();
          return;
        }
        if (ativo) setSomLigado(true);
      });
    };
    document.addEventListener("pointerdown", retomar, { capture: true });
    document.addEventListener("keydown", retomar, { capture: true });
    return () => {
      vivo = false;
      document.removeEventListener("pointerdown", retomar, { capture: true });
      document.removeEventListener("keydown", retomar, { capture: true });
    };
  }, [somPreferido, somLigado]);

  async function alternarSom() {
    const proximo = !somPreferidoAtual.current;
    somPreferidoAtual.current = proximo;
    setSomPreferido(proximo);
    try {
      localStorage.setItem(chaveSom, proximo ? "1" : "0");
    } catch {
      // Preferência ainda funciona até fechar esta aba.
    }
    if (!proximo) {
      await desativarSom();
      setSomLigado(false);
      return;
    }
    const ativo = await ativarSom();
    if (!somPreferidoAtual.current) {
      if (ativo) await desativarSom();
      return;
    }
    setSomLigado(ativo);
    if (ativo) tocarAlerta();
  }

  function alternarArea(area: AreaAlerta) {
    const proximas = areasSonorasAtuais.current.includes(area)
      ? areasSonorasAtuais.current.filter((atual) => atual !== area)
      : [...areasSonorasAtuais.current, area];
    areasSonorasAtuais.current = proximas;
    setAreasSonoras(proximas);
    try {
      localStorage.setItem(chaveAreas, JSON.stringify(proximas));
    } catch {
      // A seleção continua válida até fechar esta aba.
    }
  }

  useEffect(() => {
    let vivo = true;
    let cliente: SupabaseClient | null = null;
    let canal: RealtimeChannel | null = null;

    async function atualizar() {
      try {
        const novas = await listarNotificacoes();
        if (vivo) setResumo(novas);
        return novas;
      } catch {
        return null;
      }
    }

    void getSupabaseRealtimeClient().then((supabase) => {
      if (!vivo) return;
      cliente = supabase;
      canal = supabase
        .channel("admin-notificacoes")
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "admin_notifications",
        }, (evento) => {
          const id = (evento.new as { id?: unknown }).id;
          void atualizar().then((novas) => {
            const nova = novas?.items.find((item) => item.id === id);
            if (!vivo || !nova || nova.resolved || !somAtivo() ||
                !areasSonorasAtuais.current.includes(definirAlerta(nova.kind).area) ||
                document.visibilityState !== "visible") return;
            // Em duas abas da mesma estação, apenas a primeira toca.
            try {
              if (localStorage.getItem(CHAVE_ULTIMO_SOM) !== nova.id) {
                localStorage.setItem(CHAVE_ULTIMO_SOM, nova.id);
                tocarAlerta();
              }
            } catch {
              tocarAlerta();
            }
          });
        })
        .subscribe((situacao) => {
          if (!vivo) return;
          setConectado(situacao === "SUBSCRIBED");
          if (situacao === "SUBSCRIBED") void atualizar();
        });
    }).catch(() => {
      if (vivo) setConectado(false);
    });

    const aoVoltar = () => {
      if (document.visibilityState === "visible") void atualizar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void atualizar();
    }, 60_000);

    return () => {
      vivo = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      if (canal) void cliente?.removeChannel(canal);
    };
  }, []);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(evento: MouseEvent) {
      if (!raiz.current?.contains(evento.target as Node)) setAberto(false);
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setAberto(false);
      botao.current?.focus();
    }
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  async function abrirNotificacao(notificacao: NotificacaoAdministrativa) {
    setAbrindoPedido(notificacao.id);
    try {
      if (!notificacao.read) {
        const marcada = await marcarNotificacaoLida(notificacao.id);
        if (marcada) setResumo((atual) => ({
          items: atual.items.map((item) =>
            item.id === notificacao.id ? { ...item, read: true } : item,
          ),
          unread_count: notificacao.resolved
            ? atual.unread_count
            : Math.max(0, atual.unread_count - 1),
        }));
      }
    } catch {
      // A falha de confirmação de leitura não bloqueia abrir o pedido.
    } finally {
      setAbrindoPedido(null);
      setAberto(false);
      router.push(`/admin/pedidos?modal=detalhes&pedido=${notificacao.order_id}`);
    }
  }

  return (
    <div ref={raiz} className="relative shrink-0">
      <button
        ref={botao}
        type="button"
        aria-label={`Notificações${naoLidas > 0 ? `, ${naoLidas} não lidas` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls="notificacoes-admin"
        onClick={() => setAberto((valor) => !valor)}
        className="motion-interactive relative flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-12 border border-border-shalon bg-surface text-ink transition-colors hover:border-brand-orange hover:bg-elev"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {naoLidas > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        ) : null}
      </button>

      {aberto ? (
        <section
          id="notificacoes-admin"
          role="dialog"
          aria-label="Notificações do painel"
          className="motion-popover-in absolute right-0 top-[calc(100%+8px)] z-60 w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-16 border border-border-shalon bg-surface shadow-[0_18px_50px_rgb(30_24_20/0.2)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border-shalon p-4">
            <div>
              <h2 className="m-0 text-[15px] font-bold text-ink">Notificações</h2>
              <p className="m-0 text-[11px] text-muted">{conectado ? "Atualizando em tempo real" : "Reconectando; a lista será sincronizada"}</p>
            </div>
            <button
              type="button"
              onClick={() => { void alternarSom(); }}
              className="min-h-[36px] cursor-pointer rounded-10 border border-border-shalon bg-transparent px-2.5 text-[11px] font-semibold text-ink hover:bg-elev"
            >
              {somPreferido ? "Desligar som" : "Ativar som"}
            </button>
          </div>
          {somPreferido && !somLigado ? (
            <p className="m-0 border-b border-border-shalon px-4 py-2 text-[11px] text-muted">
              Preferência salva. Toque na tela para liberar o som neste acesso.
            </p>
          ) : null}

          <fieldset className="m-0 border-0 border-b border-border-shalon px-4 py-3">
            <legend className="mb-1.5 px-0 text-[11px] font-semibold text-muted">Som para</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {AREAS_ALERTA.map((area) => (
                <label key={area.id} className="flex min-h-[32px] cursor-pointer items-center gap-1.5 text-[12px] text-ink">
                  <input
                    type="checkbox"
                    checked={areasSonoras.includes(area.id)}
                    onChange={() => alternarArea(area.id)}
                    className="accent-brand-red"
                  />
                  {area.nome}
                </label>
              ))}
            </div>
            <p className="m-0 mt-1.5 text-[11px] text-muted">
              {somPreferido
                ? "A lista visual mostra todas as tarefas que você pode atender."
                : "Ative o som acima para ouvir as áreas selecionadas."}
            </p>
          </fieldset>

          <div className="scrollbar-subtle max-h-[min(420px,65vh)] overflow-y-auto p-2">
            {resumo.items.length === 0 ? (
              <p className="m-0 px-3 py-6 text-center text-[13px] text-muted">Nenhuma notificação por enquanto.</p>
            ) : resumo.items.map((notificacao) => (
              <button
                key={notificacao.id}
                type="button"
                disabled={abrindoPedido !== null}
                onClick={() => { void abrirNotificacao(notificacao); }}
                className="flex min-h-touch w-full cursor-pointer items-start gap-3 rounded-11 border-0 bg-transparent px-3 py-2.5 text-left hover:bg-elev disabled:opacity-60"
              >
                <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${!notificacao.read && !notificacao.resolved ? "bg-brand-red" : "bg-border-shalon"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">{definirAlerta(notificacao.kind).titulo} #{notificacao.order_number}</span>
                  <span className="block text-[11px] text-muted">
                    {notificacao.resolved ? "Resolvido · " : ""}
                    {new Date(notificacao.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
