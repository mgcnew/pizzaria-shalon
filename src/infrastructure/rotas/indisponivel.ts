import type {
  ProvedorDeRotas,
  ResultadoGeocodificacao,
  ResultadoRota,
} from "./contrato";

/**
 * Provedor usado quando NÃO existe credencial configurada.
 *
 * Existe para que a falta de configuração seja um estado EXPLÍCITO do
 * sistema, e não um `undefined` que vaza em runtime ou — pior — uma taxa
 * R$ 0,00 acidental, proibida por CLAUDE.md §20.
 *
 * Ele recusa tudo com `motivo: "configuracao"`, o que a camada de aplicação
 * traduz em "entrega indisponível no momento": o cliente não é induzido a
 * fechar um pedido com frete errado, e a retirada continua funcionando.
 */
export function provedorIndisponivel(): ProvedorDeRotas {
  const recusa = {
    ok: false as const,
    motivo: "configuracao" as const,
    mensagem: "O cálculo de entrega não está disponível no momento.",
    provedor: "indisponivel",
  };

  return {
    nome: "indisponivel",
    async geocodificar(): Promise<ResultadoGeocodificacao> {
      return recusa;
    },
    async rota(): Promise<ResultadoRota> {
      return recusa;
    },
  };
}
