"use client";

/**
 * Alerta sonoro de pedido novo.
 *
 * CLAUDE.md §40: o alerta deve funcionar visualmente E com som. O visual é
 * responsabilidade da tela; o som é isto.
 *
 * TRÊS CUIDADOS, todos por motivo concreto:
 *
 * 1. Navegador não deixa tocar som antes de o usuário interagir com a
 *    página. Por isso o contexto de áudio só nasce depois de um clique
 *    explícito em "Ativar som" — e enquanto isso a tela não finge que o som
 *    está ligado.
 * 2. Nada de repetir em laço. Toca uma vez por pedido novo, e só.
 * 3. Intervalo mínimo entre toques: dois pedidos no mesmo segundo não viram
 *    uma sirene.
 *
 * Sem arquivo de áudio: dois bipes curtos gerados na hora. Um MP3 seria mais
 * peso no bundle para dizer a mesma coisa.
 */

const INTERVALO_MINIMO_MS = 3000;

let contexto: AudioContext | null = null;
let ultimoToque = 0;

/** Precisa ser chamado a partir de um gesto do usuário. */
export function ativarSom(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const Construtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Construtor) return false;

    contexto ??= new Construtor();
    void contexto.resume();
    return true;
  } catch {
    // Áudio bloqueado ou indisponível: a tela segue com o alerta visual.
    return false;
  }
}

export function somAtivo(): boolean {
  return contexto !== null && contexto.state === "running";
}

export function tocarAlerta(): void {
  if (contexto === null) return;

  const agora = Date.now();
  if (agora - ultimoToque < INTERVALO_MINIMO_MS) return;
  ultimoToque = agora;

  try {
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
    // Falhar o bipe não pode derrubar a central.
  }
}
