/**
 * Leitura do horário semanal para a interface.
 *
 * RN-LOJA-001 e RN-LOJA-003 · 02-MODELO-DADOS-SUPABASE.md §3.2
 *
 * Domínio puro. Quem decide se a loja está ABERTA é o banco (`loja_aberta`),
 * que também considera o fechamento temporário. Este módulo responde outra
 * pergunta, só de apresentação: "até que horas dá para pedir hoje?" e
 * "quando reabre?".
 *
 * A janela pode atravessar a meia-noite — fechar às 02:00 tendo aberto às
 * 18:00 é o caso normal de pizzaria, não erro (02 §3.2).
 */

export type JanelaDia = {
  /** 0 = domingo … 6 = sábado. */
  diaSemana: number;
  fechado: boolean;
  /** "HH:MM" ou "HH:MM:SS". */
  abre: string | null;
  fecha: string | null;
};

/** Momento local da loja, já convertido para o fuso dela. */
export type MomentoLocal = { diaSemana: number; minutos: number };

export const DIAS_CURTOS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

export function minutosDe(hora: string | null): number | null {
  if (!hora) return null;
  const partes = hora.split(":");
  const h = Number(partes[0]);
  const m = Number(partes[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function comoHora(hora: string | null): string {
  return hora ? hora.slice(0, 5) : "";
}

function janelaDo(horarios: readonly JanelaDia[], dia: number): JanelaDia | undefined {
  return horarios.find((h) => h.diaSemana === ((dia % 7) + 7) % 7);
}

/**
 * Até quando dá para pedir na janela que está correndo agora.
 *
 * Devolve `null` quando nenhuma janela cobre o momento — inclusive quando a
 * loja está tecnicamente aberta por fechamento temporário resolvido, caso em
 * que quem decide é o banco.
 */
export function fechamentoDaJanelaAtual(
  horarios: readonly JanelaDia[],
  agora: MomentoLocal,
): string | null {
  const hoje = janelaDo(horarios, agora.diaSemana);
  if (hoje && !hoje.fechado) {
    const abre = minutosDe(hoje.abre);
    const fecha = minutosDe(hoje.fecha);
    if (abre !== null && fecha !== null) {
      // Janela normal do próprio dia.
      if (fecha > abre && agora.minutos >= abre && agora.minutos < fecha) {
        return comoHora(hoje.fecha);
      }
      // Trecho antes da meia-noite de uma janela que vira o dia.
      if (fecha <= abre && agora.minutos >= abre) return comoHora(hoje.fecha);
    }
  }

  // Trecho depois da meia-noite: a janela pertence ao dia ANTERIOR.
  const ontem = janelaDo(horarios, agora.diaSemana - 1);
  if (ontem && !ontem.fechado) {
    const abre = minutosDe(ontem.abre);
    const fecha = minutosDe(ontem.fecha);
    if (abre !== null && fecha !== null && fecha <= abre && agora.minutos < fecha) {
      return comoHora(ontem.fecha);
    }
  }

  return null;
}

/**
 * Próxima abertura, olhando até sete dias à frente.
 *
 * Devolve `null` quando não há nenhum dia aberto cadastrado — estado possível
 * numa loja ainda não configurada, e que a interface precisa saber tratar.
 */
export function proximaAbertura(
  horarios: readonly JanelaDia[],
  agora: MomentoLocal,
): { diaSemana: number; hora: string; hoje: boolean } | null {
  for (let avanco = 0; avanco < 8; avanco++) {
    const dia = (agora.diaSemana + avanco) % 7;
    const janela = janelaDo(horarios, dia);
    if (!janela || janela.fechado) continue;

    const abre = minutosDe(janela.abre);
    if (abre === null) continue;

    // Hoje só conta se a abertura ainda não passou.
    if (avanco === 0 && agora.minutos >= abre) continue;

    return { diaSemana: dia, hora: comoHora(janela.abre), hoje: avanco === 0 };
  }
  return null;
}

/**
 * Microcopy do cabeçalho, como no design: "Pedidos até 23:30" quando aberta.
 *
 * Fechada, diz quando reabre — informação que o protótipo não tinha porque
 * ali o horário era fixo.
 */
export function rotuloDeHorario(
  horarios: readonly JanelaDia[],
  agora: MomentoLocal,
  aberta: boolean,
): string {
  if (horarios.length === 0) return "Horário não configurado";

  if (aberta) {
    const fecha = fechamentoDaJanelaAtual(horarios, agora);
    return fecha ? `Pedidos até ${fecha}` : "Aberta agora";
  }

  const proxima = proximaAbertura(horarios, agora);
  if (!proxima) return "Sem horário de funcionamento cadastrado";
  return proxima.hoje
    ? `Abre hoje às ${proxima.hora}`
    : `Abre ${DIAS_CURTOS[proxima.diaSemana]} às ${proxima.hora}`;
}
