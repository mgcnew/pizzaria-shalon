"use client";

/** Áudio compartilhado pelo shell; a permissão vem de um gesto explícito. */
let contexto: AudioContext | null = null;
let ultimoToque = 0;
let amostra: AudioBuffer | null = null;
let carregamento: Promise<void> | null = null;

function carregarAmostra(audioContext: AudioContext): Promise<void> {
  carregamento ??= fetch("/sons/notificacao-pedido.mp3")
    .then((resposta) => {
      if (!resposta.ok) throw new Error("Áudio indisponível");
      return resposta.arrayBuffer();
    })
    .then((dados) => audioContext.decodeAudioData(dados))
    .then((decodificada) => { amostra = decodificada; })
    .catch(() => {
      // Falha de rede/codec não tira o alerta: o toque sintetizado é reserva.
      carregamento = null;
    });
  return carregamento;
}

export async function ativarSom(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const Construtor = window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Construtor) return false;
    contexto ??= new Construtor();
    await contexto.resume();
    if (contexto.state === "running") await carregarAmostra(contexto);
    return contexto.state === "running";
  } catch {
    return false;
  }
}

export function somAtivo(): boolean {
  return contexto?.state === "running";
}

export async function desativarSom(): Promise<void> {
  await contexto?.suspend();
}

export function tocarAlerta(): void {
  if (!somAtivo() || contexto === null) return;
  const agora = Date.now();
  if (agora - ultimoToque < 3000) return;
  ultimoToque = agora;

  try {
    if (amostra) {
      const fonte = contexto.createBufferSource();
      fonte.buffer = amostra;
      fonte.connect(contexto.destination);
      fonte.start();
      return;
    }

    // Reserva caso o arquivo não seja carregado ou decodificado pelo navegador.
    const inicio = contexto.currentTime;
    for (const [indice, frequencia] of [880, 1170].entries()) {
      const oscilador = contexto.createOscillator();
      const ganho = contexto.createGain();
      oscilador.type = "sine";
      oscilador.frequency.value = frequencia;
      const em = inicio + indice * 0.18;
      ganho.gain.setValueAtTime(0.0001, em);
      ganho.gain.exponentialRampToValueAtTime(0.25, em + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, em + 0.16);
      oscilador.connect(ganho).connect(contexto.destination);
      oscilador.start(em);
      oscilador.stop(em + 0.18);
    }
  } catch {
    // Falha de áudio não atrapalha a operação nem o aviso visual.
  }
}
