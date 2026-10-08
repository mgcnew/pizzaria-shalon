"use client";

/**
 * Impressora Bluetooth pela Web Serial (D-2026-10-08-116, entrega 2).
 *
 * A KD-1025 é Bluetooth Clássico (perfil serial, SPP): a Web Bluetooth não a
 * alcança, a Web Serial sim — no Chrome do computador e, desde 2025, no do
 * Android.
 *
 * ESCOLHE-SE UMA VEZ. `requestPort` abre o seletor e só pode ser chamado por
 * um toque da pessoa (Configurações → Impressora). Depois disso o Chrome
 * lembra a autorização, e `getPorts` devolve a impressora sem perguntar
 * nada: imprimir vira um toque. Se o Chrome do Android esquecer entre uma
 * sessão e outra, é isso que o teste físico vai mostrar (06, POC da 58 mm).
 *
 * A conexão abre e fecha a cada impressão. Manter aberta economizaria um
 * segundo, mas prende a impressora a este aparelho e quebra em silêncio
 * quando ela desliga.
 */

/** Perfil serial do Bluetooth (SPP). */
const SPP = "00001101-0000-1000-8000-00805f9b34fb";

// Tipos mínimos: a Web Serial não está na lib DOM do TypeScript.
type PortaSerial = {
  open(opcoes: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  forget?: () => Promise<void>;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { bluetoothServiceClassId?: string; usbVendorId?: number };
};
type ApiSerial = {
  requestPort(opcoes?: { allowedBluetoothServiceClassIds?: string[] }): Promise<PortaSerial>;
  getPorts(): Promise<PortaSerial[]>;
};

function api(): ApiSerial | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as unknown as { serial?: ApiSerial }).serial ?? null;
}

export function serialDisponivel(): boolean {
  return api() !== null;
}

export class ErroDaImpressora extends Error {}

/** A impressora autorizada neste aparelho, se houver. */
export async function impressoraLembrada(): Promise<PortaSerial | null> {
  const serial = api();
  if (serial === null) return null;
  const portas = await serial.getPorts();
  return portas.at(-1) ?? null;
}

/**
 * Abre o seletor do Chrome. Precisa vir de um toque. Troca a impressora:
 * as autorizações antigas são esquecidas, para "a impressora deste
 * aparelho" ser sempre uma só.
 */
export async function escolherImpressoraSerial(): Promise<void> {
  const serial = api();
  if (serial === null) throw new ErroDaImpressora("Este navegador não tem Web Serial. Use o Chrome atualizado.");

  let nova: PortaSerial;
  try {
    nova = await serial.requestPort({ allowedBluetoothServiceClassIds: [SPP] });
  } catch {
    throw new ErroDaImpressora("Nenhuma impressora foi escolhida.");
  }
  for (const antiga of await serial.getPorts()) {
    if (antiga !== nova) await antiga.forget?.().catch(() => undefined);
  }
}

export async function esquecerImpressoraSerial(): Promise<void> {
  const serial = api();
  if (serial === null) return;
  for (const porta of await serial.getPorts()) await porta.forget?.().catch(() => undefined);
}

/** Uma impressão por vez: duas conexões na mesma porta falham. */
let fila: Promise<unknown> = Promise.resolve();

export function imprimirSerial(bytes: Uint8Array): Promise<void> {
  const tarefa = fila.then(() => enviar(bytes));
  fila = tarefa.catch(() => undefined);
  return tarefa;
}

const PEDACO = 256;

async function enviar(bytes: Uint8Array): Promise<void> {
  const porta = await impressoraLembrada();
  if (porta === null) {
    throw new ErroDaImpressora("Nenhuma impressora Bluetooth escolhida neste aparelho. Escolha em Configurações → Impressora.");
  }

  try {
    // Velocidade é ignorada no Bluetooth, mas a API exige uma.
    await porta.open({ baudRate: 9600 });
  } catch {
    throw new ErroDaImpressora("Não conectou na impressora. Confira se ela está ligada e perto do aparelho.");
  }

  try {
    if (porta.writable === null) throw new ErroDaImpressora("A impressora não aceitou dados.");
    const escritor = porta.writable.getWriter();
    try {
      for (let i = 0; i < bytes.length; i += PEDACO) {
        await escritor.write(bytes.subarray(i, i + PEDACO));
      }
      await escritor.close();
    } finally {
      escritor.releaseLock();
    }
  } catch (erro) {
    if (erro instanceof ErroDaImpressora) throw erro;
    throw new ErroDaImpressora("A conexão caiu no meio da impressão. Confira o papel e emita de novo.");
  } finally {
    await porta.close().catch(() => undefined);
  }
}
