/**
 * Situação de cada motoboy na tela de Entregas.
 *
 * O motoboy não tem login nem app (RN-MOTO-001) e o sistema não o rastreia
 * (sem GPS, CLAUDE.md §46). "Disponível" é, portanto, uma leitura do que a
 * equipe registra: cadastrado como entregador, ativo, sem corrida em aberto e
 * sem ter sido marcado como ausente hoje.
 *
 * PRESENÇA (D-2026-10-24-165): a equipe marca Veio ou Faltou, por dia de
 * trabalho. Só "Faltou" tira o motoboy da escolha de quem recebe pedido; sem
 * marca ele continua escolhível, para esquecer de marcar nunca travar o
 * balcão. A mesma regra vale no servidor (`atribuir_entrega`,
 * `transferir_entrega`): esta função só decide o que a tela mostra.
 *
 * Domínio puro: não consulta nada.
 */

export type PresencaDeHoje = "present" | "absent" | null;

export type MotoboyParaSituacao = {
  ocupado: boolean;
  presenca: PresencaDeHoje;
};

export type CorridaParaSituacao = {
  status: "open" | "out" | "settling" | "settled";
  pedidos: number;
};

export type SituacaoDoMotoboy = {
  /** Disponível primeiro; quem faltou por último. */
  ordem: number;
  tom: "sucesso" | "atencao" | "rota" | "neutro";
  texto: string;
  detalhe: string;
  /** Pode ser escolhido para um pedido. Só "Faltou hoje" diz não. */
  recebeEntrega: boolean;
};

export function situacaoDoMotoboy(
  m: MotoboyParaSituacao,
  corrida: CorridaParaSituacao | undefined,
): SituacaoDoMotoboy {
  const recebeEntrega = m.presenca !== "absent";
  const pedidos = (c: CorridaParaSituacao) => `${c.pedidos} ${c.pedidos === 1 ? "pedido" : "pedidos"}`;
  // Marcado como ausente DEPOIS de a corrida já existir: a corrida segue
  // valendo, e a tela diz as duas coisas.
  const ausente = m.presenca === "absent" ? " · marcado como ausente hoje" : "";

  if (corrida?.status === "out") {
    return { ordem: 3, tom: "rota", texto: "Na rua", detalhe: pedidos(corrida) + ausente, recebeEntrega };
  }
  if (corrida?.status === "settling") {
    return {
      ordem: 4,
      tom: "atencao",
      texto: "A acertar",
      detalhe: "Voltou: falta o acerto da corrida" + ausente,
      recebeEntrega,
    };
  }
  if (corrida?.status === "open") {
    return {
      ordem: 2,
      tom: "atencao",
      texto: "Montando",
      detalhe: `Corrida aberta · ${pedidos(corrida)}` + ausente,
      recebeEntrega,
    };
  }
  if (m.ocupado) return { ordem: 3, tom: "atencao", texto: "Em corrida", detalhe: ausente.slice(3), recebeEntrega };

  if (m.presenca === "absent") {
    return { ordem: 5, tom: "neutro", texto: "Faltou hoje", detalhe: "Não aparece na escolha do motoboy", recebeEntrega: false };
  }
  return {
    ordem: 1,
    tom: "sucesso",
    texto: "Disponível",
    detalhe: m.presenca === "present" ? "Veio hoje · pode receber entregas" : "Presença não marcada hoje",
    recebeEntrega: true,
  };
}
