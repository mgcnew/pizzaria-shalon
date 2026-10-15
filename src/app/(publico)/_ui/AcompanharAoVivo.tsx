"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { conferirPedido } from "@/application/checkout/acoes";
import { acompanhamentoEncerrado } from "@/domain/pedidos/acompanhamento";
import { descreverEstado } from "@/domain/pedidos/estados";

/**
 * Mantém o acompanhamento do cliente em dia (D-2026-10-01-108).
 *
 * Com a página aberta e visível, confere o pedido a cada 15 s — pelo token,
 * na mesma consulta do acompanhamento; nada de tempo real aberto ao público.
 * Ao mudar algo visível, a página é recarregada pelo servidor e o cliente é
 * avisado: destaque na tela, título da aba, vibração no celular e, se ele
 * ligou, um som curto. Nos estados finais, para de conferir.
 *
 * O som só existe depois de um toque do cliente: o navegador não deixa uma
 * página tocar som sozinha, e prometer o contrário seria mentir.
 */

const INTERVALO_MS = 15_000;
const CHAVE_SOM = "shalon:som-acompanhamento";

function lerPreferenciaDeSom(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_SOM) === "1";
  } catch {
    return false;
  }
}

const semInscricao = () => () => {};

/**
 * A decisão do cliente sobre os avisos fica neste aparelho (15/10/2026): quem
 * escolheu "ativar" ou "agora não" não é perguntado de novo. O sino continua
 * disponível para mudar de ideia.
 */
const CHAVE_DECISAO = "shalon:aviso-do-pedido";

function lerDecisao(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_DECISAO);
  } catch {
    return null;
  }
}

function gravarDecisao(valor: "ativado" | "recusado"): void {
  try {
    window.localStorage.setItem(CHAVE_DECISAO, valor);
  } catch {
    // Sem armazenamento, só não se lembra na próxima visita.
  }
}

/** O navegador só oferece aviso do sistema onde a API existe (iOS fora do app, não). */
function avisoDoSistemaDisponivel(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function gravarPreferenciaDeSom(ligado: boolean): void {
  try {
    window.localStorage.setItem(CHAVE_SOM, ligado ? "1" : "0");
  } catch {
    // Sem armazenamento, vale só nesta visita.
  }
}

/** Dois bipes curtos, gerados na hora: sem arquivo de áudio para baixar. */
function tocarAviso(contexto: AudioContext): void {
  const agora = contexto.currentTime;
  for (const [inicio, frequencia] of [
    [0, 880],
    [0.22, 1175],
  ] as const) {
    const oscilador = contexto.createOscillator();
    const volume = contexto.createGain();
    oscilador.type = "sine";
    oscilador.frequency.value = frequencia;
    volume.gain.setValueAtTime(0.0001, agora + inicio);
    volume.gain.exponentialRampToValueAtTime(0.25, agora + inicio + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, agora + inicio + 0.18);
    oscilador.connect(volume).connect(contexto.destination);
    oscilador.start(agora + inicio);
    oscilador.stop(agora + inicio + 0.2);
  }
}

export function AcompanharAoVivo({
  token,
  numero,
  assinatura,
  status,
}: {
  token: string;
  numero: number;
  assinatura: string;
  status: string;
}) {
  const router = useRouter();
  const encerrado = acompanhamentoEncerrado(status);

  const ultima = useRef(assinatura);
  const [aviso, setAviso] = useState<string | null>(null);
  // A preferência é deste aparelho: no servidor, desligada; no navegador, a
  // guardada — até o cliente escolher de novo nesta visita.
  const somGuardado = useSyncExternalStore(semInscricao, lerPreferenciaDeSom, () => false);
  const [somEscolhido, setSomEscolhido] = useState<boolean | null>(null);
  const som = somEscolhido ?? somGuardado;
  const audio = useRef<AudioContext | null>(null);

  const decisaoGuardada = useSyncExternalStore(semInscricao, lerDecisao, () => "pendente");
  const [decisaoNaVisita, setDecisaoNaVisita] = useState<string | null>(null);
  const decisao = decisaoNaVisita ?? decisaoGuardada;
  const perguntar = !encerrado && decisao === null;
  const tituloOriginal = useRef<string | null>(null);

  // A página recarregada traz a assinatura nova: ela passa a ser a base.
  useEffect(() => {
    ultima.current = assinatura;
  }, [assinatura]);

  useEffect(() => {
    tituloOriginal.current = document.title;
  }, []);

  // O título da aba avisa quem está em outra aba. O refresh do servidor
  // restaura o título da página depois de nós; enquanto houver aviso, ele é
  // reposto sempre que alguém o trocar.
  useEffect(() => {
    if (aviso === null) return;
    const desejado = `● ${aviso} · Pedido #${numero}`;
    const repor = () => {
      if (document.title !== desejado) document.title = desejado;
    };
    repor();
    const observador = new MutationObserver(repor);
    observador.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observador.disconnect();
  }, [aviso, numero]);

  // Ligado numa visita anterior: o áudio só destrava com um toque nesta.
  useEffect(() => {
    if (!som || audio.current) return;
    const destravar = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    };
    window.addEventListener("pointerdown", destravar, { once: true });
    return () => window.removeEventListener("pointerdown", destravar);
  }, [som]);

  useEffect(() => {
    if (encerrado) return;
    let ativo = true;

    async function conferir() {
      // Em segundo plano só se confere se o cliente liberou o aviso do
      // sistema: é ele que o chama de volta.
      const avisoDoSistema =
        avisoDoSistemaDisponivel() && Notification.permission === "granted";
      if (document.visibilityState !== "visible" && !avisoDoSistema) return;
      const r = await conferirPedido(token);
      if (!ativo || !r.ok || r.assinatura === ultima.current) return;

      ultima.current = r.assinatura;
      const titulo = descreverEstado(r.status).titulo;
      setAviso(titulo);
      if (avisoDoSistema && document.visibilityState !== "visible") {
        try {
          new Notification(`Pedido #${numero}: ${titulo}`, {
            tag: `pedido-${token}`,
            body: "Toque para ver o andamento do seu pedido.",
          });
        } catch {
          // Alguns navegadores móveis só aceitam aviso por service worker.
        }
      }
      navigator.vibrate?.([180, 90, 180]);
      if (audio.current) {
        void audio.current.resume().then(() => {
          if (audio.current) tocarAviso(audio.current);
        });
      }
      router.refresh();
    }

    const relogio = window.setInterval(conferir, INTERVALO_MS);
    // Voltou para a aba: confere na hora, em vez de esperar o próximo ciclo.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void conferir();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      ativo = false;
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [encerrado, token, numero, router]);

  function alternarSom() {
    const ligar = !som;
    setSomEscolhido(ligar);
    gravarPreferenciaDeSom(ligar);
    if (ligar) {
      // O toque do cliente é o que libera o áudio no navegador.
      audio.current ??= new AudioContext();
      void audio.current.resume().then(() => {
        if (audio.current) tocarAviso(audio.current);
      });
    } else {
      void audio.current?.close();
      audio.current = null;
    }
  }

  /** O toque em "Ativar" é o gesto que libera o áudio e a permissão. */
  function ativarAvisos() {
    gravarDecisao("ativado");
    setDecisaoNaVisita("ativado");
    if (!som) alternarSom();
    if (avisoDoSistemaDisponivel() && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }

  function recusarAvisos() {
    gravarDecisao("recusado");
    setDecisaoNaVisita("recusado");
  }

  function dispensarAviso() {
    setAviso(null);
    if (tituloOriginal.current) document.title = tituloOriginal.current;
  }

  return (
    <>
      {perguntar ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onKeyDown={(e) => {
            if (e.key === "Escape") recusarAvisos();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-aviso-pedido"
            className="motion-popover-in w-full max-w-[400px] rounded-16 bg-surface p-5 shadow-[0_16px_42px_rgb(30_24_20/0.24)]"
          >
            <h2 id="titulo-aviso-pedido" className="m-0 font-display text-[19px] font-bold text-ink">
              Quer ser avisado sobre o seu pedido?
            </h2>
            <p className="m-0 mt-2 text-[14.5px] text-ink-2">
              Avisamos quando a pizzaria aceitar, quando estiver pronto e quando sair para entrega.
              Funciona com esta página aberta, mesmo que você esteja em outra aba ou aplicativo.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                autoFocus
                onClick={ativarAvisos}
                className="min-h-[50px] cursor-pointer rounded-13 border-0 bg-cta px-4 text-[15px] font-bold text-cta-fg"
              >
                Ativar avisos
              </button>
              <button
                type="button"
                onClick={recusarAvisos}
                className="min-h-touch cursor-pointer rounded-13 border border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink"
              >
                Agora não
              </button>
            </div>
            <p className="m-0 mt-3 text-[12.5px] text-muted">
              Você pode mudar isso depois pelo botão de som nesta página.
            </p>
          </div>
        </div>
      ) : null}

      {aviso !== null ? (
        <div
          role="status"
          aria-live="polite"
          className="motion-popover-in mb-3 flex items-center justify-between gap-3 rounded-14 border border-tgb bg-tg px-4 py-3"
        >
          <p className="m-0 text-[14.5px] font-bold text-tgf">Pedido atualizado: {aviso}</p>
          <button
            type="button"
            onClick={dispensarAviso}
            aria-label="Dispensar aviso"
            className="min-h-touch w-11 shrink-0 cursor-pointer border-0 bg-transparent text-[18px] font-bold text-tgf"
          >
            ×
          </button>
        </div>
      ) : null}

      {!encerrado ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
          <span>Esta página se atualiza sozinha enquanto estiver aberta.</span>
          <button
            type="button"
            onClick={alternarSom}
            aria-pressed={som}
            className="min-h-touch cursor-pointer rounded-pill border border-border-shalon bg-surface px-3 text-[12.5px] font-semibold text-ink"
          >
            {som ? "🔔 Aviso com som ligado" : "🔕 Avisar com som"}
          </button>
        </div>
      ) : null}
    </>
  );
}
