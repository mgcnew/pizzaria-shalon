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
      if (document.visibilityState !== "visible") return;
      const r = await conferirPedido(token);
      if (!ativo || !r.ok || r.assinatura === ultima.current) return;

      ultima.current = r.assinatura;
      const titulo = descreverEstado(r.status).titulo;
      setAviso(titulo);
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

  function dispensarAviso() {
    setAviso(null);
    if (tituloOriginal.current) document.title = tituloOriginal.current;
  }

  return (
    <>
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
