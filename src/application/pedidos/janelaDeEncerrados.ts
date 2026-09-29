import type { JanelaDeEncerrados, PedidoNaFila } from "./tipos";

/**
 * Apresentação da aba Encerrados (D-2026-09-29-93). Sem I/O: quem escolhe a
 * janela é o banco (`pedidos_encerrados`); aqui só se lê a URL e se formata o
 * que ele devolveu, no fuso da loja.
 */

/**
 * `?dias=` vem da URL, que qualquer um edita: só inteiro, nunca negativo,
 * com teto. O banco satura de novo; isto só evita mandar lixo.
 */
export function diasDaUrl(valor: string | undefined): number {
  const n = Number.parseInt(valor ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 3650);
}

/**
 * "Quando" de cada pedido encerrado: só a hora se for de hoje, e data e hora
 * se for de outro dia, sempre no fuso da loja. Com "Carregar dias
 * anteriores" a lista mistura dias, e "21:14" sozinho não diz de qual.
 *
 * Mora na aplicação, como `esperaDaFila`: saber o que é "hoje" é ler o relógio do
 * servidor, e isso é preparo de dado, não renderização.
 */
export function horarioDosEncerrados(
  pedidos: PedidoNaFila[],
  fuso: string,
): Record<string, string> {
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit" });
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" });
  const hoje = dia.format(new Date());
  return Object.fromEntries(
    pedidos.map((p) => {
      const quando = new Date(p.criado_em);
      const d = dia.format(quando);
      return [p.id, d === hoje ? hora.format(quando) : `${d} ${hora.format(quando)}`];
    }),
  );
}

/** A frase acima da lista de encerrados, dizendo que janela está na tela. */
export function descreverJanela(janela: JanelaDeEncerrados, fuso: string): string {
  if (janela.desde === null) return "Não foi possível carregar os pedidos encerrados.";
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit" });
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" });
  const desde = new Date(janela.desde);
  const deHoje = dia.format(desde) === dia.format(new Date());

  if (janela.origem === "caixa") {
    return deHoje
      ? `Desde a abertura do caixa, às ${hora.format(desde)}.`
      : `Desde a abertura do caixa, em ${dia.format(desde)} às ${hora.format(desde)}.`;
  }
  return janela.diasAnteriores === 0 ? "Encerrados de hoje." : `Encerrados desde ${dia.format(desde)}.`;
}
